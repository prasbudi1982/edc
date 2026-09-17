import DB from './db.js';

if (!window._karyawanState) {
    window._karyawanState = {
        activeTab: 'shift',
        selectedOperatorId: '',
        selectedPeriod: 'daily',
        absensiSearchName: '',
        absensiSearchDate: '',
        absensiCurrentPage: 1,
        absensiItemsPerPage: 10
    };
}

const KaryawanModule = {
    operators: [],
    shifts: [],
    attendances: [],
    salaries: [],
    transactions: [],
    editingShiftId: null,

    get activeTab() { return window._karyawanState.activeTab; },
    set activeTab(val) { window._karyawanState.activeTab = val; },
    get selectedOperatorId() { return window._karyawanState.selectedOperatorId; },
    set selectedOperatorId(val) { window._karyawanState.selectedOperatorId = val; },
    get selectedPeriod() { return window._karyawanState.selectedPeriod; },
    set selectedPeriod(val) { window._karyawanState.selectedPeriod = val; },
    get absensiSearchName() { return window._karyawanState.absensiSearchName; },
    set absensiSearchName(val) { window._karyawanState.absensiSearchName = val; },
    get absensiSearchDate() { return window._karyawanState.absensiSearchDate; },
    set absensiSearchDate(val) { window._karyawanState.absensiSearchDate = val; },
    get absensiCurrentPage() { return window._karyawanState.absensiCurrentPage; },
    set absensiCurrentPage(val) { window._karyawanState.absensiCurrentPage = val; },
    get absensiItemsPerPage() { return window._karyawanState.absensiItemsPerPage; },

    async render() {
        this.operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
        this.shifts = JSON.parse(localStorage.getItem('edc_shifts') || '[]');
        
        let lsAttendances = [];
        try { lsAttendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]'); } catch(e) { lsAttendances = []; }

        let idbAttendances = [];
        try {
            if (DB && typeof DB.getAttendances === 'function') {
                idbAttendances = await DB.getAttendances() || [];
            }
        } catch(e) { idbAttendances = []; }

        // FIX: Session attendance sekarang sinkron dengan ID asli, bukan ID operator
        let sessionAttendances = [];
        try {
            const activeOp = JSON.parse(localStorage.getItem('edc_active_operator') || localStorage.getItem('edc_active_user') || 'null');
            // FIX: Izinkan semua role yang punya loginTime, termasuk admin, agar tercatat
            if (activeOp && (activeOp.loginTime || activeOp.timestamp)) {
                // Cari attendance terbuka yang sudah ada di LS/IDB dengan operator yang sama
                const existingOpen = [...lsAttendances, ...idbAttendances].reverse().find(a => String(a.operatorId) === String(activeOp.id || activeOp.operatorId) && !a.logoutTime);
                const sessionId = activeOp.sessionKey || (existingOpen ? existingOpen.id : ('att_' + (activeOp.loginTime || activeOp.timestamp)));
                
                // Hanya push jika belum ada record terbuka dengan ID yang sama
                if (!existingOpen || String(existingOpen.id) !== String(sessionId)) {
                    // Jika sudah ada open attendance, pakai ID itu agar tidak dobel
                    if (existingOpen) {
                        sessionAttendances.push(existingOpen);
                    } else {
                        sessionAttendances.push({
                            id: sessionId,
                            sessionKey: sessionId,
                            operatorId: activeOp.id || activeOp.operatorId,
                            operatorName: activeOp.name || activeOp.operatorName,
                            loginTime: activeOp.loginTime || activeOp.timestamp,
                            logoutTime: activeOp.logoutTime || null,
                            isPaid: false,
                            role: activeOp.role || 'operator'
                        });
                    }
                }
            }
        } catch(e) { console.warn('session parse error', e); }

        // FIX: Merge dengan benar, prioritaskan logoutTime terbaru
        // FIX BUG: Operator selain kasir/admin tidak terbaca karena field id berbeda
        const getNormalizedOpId = (a) => {
            if (!a) return null;
            return a.operatorId || a.operator_id || a.karyawanId || a.karyawan_id || a.userId || a.user_id || a.id_karyawan || a.karyawanID || a.operator?.id || a.operator?.operatorId || a.opId || null;
        };
        const attendanceMap = new Map();
        [...lsAttendances, ...idbAttendances, ...sessionAttendances].forEach(att => {
            if (!att) return;
            // Normalisasi operatorId agar semua role terbaca (kasir, admin, BOSS, staff, operator, dll)
            let normOpId = getNormalizedOpId(att);
            // Fallback: coba cari dari operatorName jika id tidak ada
            if (!normOpId && att.operatorName) {
                const foundOp = (this.operators || []).find(o => o.name && att.operatorName && o.name.toLowerCase() === att.operatorName.toLowerCase());
                if (foundOp) normOpId = foundOp.id;
            }
            if (!normOpId) return;
            // Set field standar agar downstream konsisten
            att.operatorId = String(normOpId);
            // Normalisasi loginTime/logoutTime field alternatif
            if (!att.loginTime) att.loginTime = att.login_time || att.waktuMasuk || att.jamMasuk || att.timestamp || att.createdAt;
            if (!att.logoutTime) att.logoutTime = att.logout_time || att.waktuKeluar || att.jamKeluar || null;
            const key = att.id || `${att.operatorId}_${att.loginTime}`;
            if (!attendanceMap.has(key)) {
                attendanceMap.set(key, att);
            } else {
                const existing = attendanceMap.get(key);
                // Jika yang baru punya logout dan yang lama belum, update
                if (!existing.logoutTime && att.logoutTime) {
                    existing.logoutTime = att.logoutTime;
                }
                // Jika ada yang isPaid
                if (att.isPaid) {
                    existing.isPaid = true;
                    existing.paidAt = att.paidAt;
                }
                // Jika key berbeda tapi operator sama dan waktu login sama, hindari duplikat
                // Cek duplikat berdasarkan operatorId + loginTime
                const dupKey = `${att.operatorId}_${att.loginTime}`;
                if (attendanceMap.has(dupKey) && key !== dupKey) {
                    const dup = attendanceMap.get(dupKey);
                    if (!dup.logoutTime && att.logoutTime) dup.logoutTime = att.logoutTime;
                }
            }
        });

        // Deduplikasi tambahan berdasarkan operatorId + loginTime (tanpa ms)
        const deduped = [];
        const seenLogin = new Set();
        for (let att of attendanceMap.values()) {
            const loginTrim = att.loginTime ? att.loginTime.slice(0,19) : '';
            const composite = `${att.operatorId}_${loginTrim}`;
            if (!seenLogin.has(composite)) {
                seenLogin.add(composite);
                deduped.push(att);
            } else {
                // Merge ke yang sudah ada
                const existing = deduped.find(d => `${d.operatorId}_${d.loginTime.slice(0,19)}` === composite);
                if (existing && !existing.logoutTime && att.logoutTime) existing.logoutTime = att.logoutTime;
            }
        }

        this.attendances = deduped.sort((a,b) => new Date(b.loginTime) - new Date(a.loginTime));
        localStorage.setItem('edc_attendances', JSON.stringify(this.attendances));

        this.salaries = JSON.parse(localStorage.getItem('edc_salaries') || '[]');
        try { this.transactions = await DB.getTransactions() || []; } catch(e) { this.transactions = []; }

        if (!this.selectedOperatorId && this.operators.length > 0) {
            this.selectedOperatorId = this.operators[0].id;
        }

        return `
            <div class="setting-section" style="padding-bottom: 30px;">
                <div style="text-align:center; margin-bottom:14px;">
                    <h3 style="color:var(--text-primary); font-size:1.2rem; font-weight:800; margin:0;">👥 Modul Pengelolaan Karyawan</h3>
                    <p style="color:var(--text-secondary); font-size:0.75rem; margin-top:2px;">Pembagian shift, absensi otomatis, pengelolaan gaji & bonus, serta slip gaji</p>
                </div>
                <style>
                    .tab-karyawan-wrap::-webkit-scrollbar { display: none; }
                    .tab-karyawan-btn { transition: all 0.2s ease; outline: none; position: relative; }
                    .tab-karyawan-btn.active { background: var(--accent-color, #2563eb) !important; color: #fff !important; box-shadow: 0 2px 8px rgba(37,99,235,0.35) !important; transform: translateY(-1px); }
                    .tab-karyawan-btn:not(.active):hover { background: var(--bg-primary) !important; color: var(--text-primary) !important; }
                    .tab-karyawan-btn:focus-visible { outline: 2px solid var(--accent-color, #2563eb); outline-offset: 2px; }
                    .tab-karyawan-btn.active::after { content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 6px; height: 6px; background: var(--accent-color, #2563eb); border-radius: 50%; }
                </style>
                <div class="tab-karyawan-wrap" style="display:flex; gap:6px; overflow-x:auto; margin-bottom:14px; background:var(--bg-card); padding:6px; border-radius:12px; border:1px solid var(--border-color); scrollbar-width: none;">
                    <button class="tab-karyawan-btn ${this.activeTab === 'shift' ? 'active' : ''}" data-tab="shift" tabindex="0" aria-selected="${this.activeTab === 'shift'}" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='shift'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='shift'?'#fff':'var(--text-secondary)'};">📅 1. Pembagian Shift</button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'absensi' ? 'active' : ''}" data-tab="absensi" tabindex="0" aria-selected="${this.activeTab === 'absensi'}" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='absensi'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='absensi'?'#fff':'var(--text-secondary)'};">⏱️ 2. Absensi Otomatis</button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'gaji' ? 'active' : ''}" data-tab="gaji" tabindex="0" aria-selected="${this.activeTab === 'gaji'}" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='gaji'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='gaji'?'#fff':'var(--text-secondary)'};">💰 3. Gaji & Bonus</button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'slip' ? 'active' : ''}" data-tab="slip" tabindex="0" aria-selected="${this.activeTab === 'slip'}" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='slip'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='slip'?'#fff':'var(--text-secondary)'};">📄 4. Generate Slip Gaji</button>
                </div>
                <div id="tab-content-karyawan">${this.renderTabContent()}</div>
            </div>
        `;
    },

    renderTabContent() {
        switch (this.activeTab) {
            case 'shift': return this.renderTabShift();
            case 'absensi': return this.renderTabAbsensi();
            case 'gaji': return this.renderTabGaji();
            case 'slip': return this.renderTabSlip();
            default: return this.renderTabShift();
        }
    },

    renderTabShift() {
        const opOptions = this.operators.map(op => `<option value="${op.id}">${op.name}</option>`).join('');
        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">📅 Pengaturan Pembagian Shift Operator</h4>
                <form id="form-add-shift" style="background:var(--bg-primary); padding:12px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:14px;">
                    <div style="margin-bottom:8px;">
                        <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Operator Karyawan</label>
                        <select id="shift-operator-id" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>${opOptions || '<option value="">Belum ada operator. Tambahkan di Setting!</option>'}</select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                        <div><label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Nama Shift</label><input type="text" id="shift-name" placeholder="misal: Shift Pagi" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required></div>
                        <div><label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Hari Kerja</label>
                            <select id="shift-day" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;">
                                <option value="Setiap Hari">Setiap Hari</option><option value="Senin - Jumat">Senin - Jumat</option><option value="Sabtu - Minggu">Sabtu - Minggu</option>
                                <option value="Senin">Senin</option><option value="Selasa">Selasa</option><option value="Rabu">Rabu</option><option value="Kamis">Kamis</option><option value="Jumat">Jumat</option><option value="Sabtu">Sabtu</option><option value="Minggu">Minggu</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                        <div><label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Jam Masuk</label><input type="time" id="shift-start-time" value="08:00" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required></div>
                        <div><label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Jam Keluar</label><input type="time" id="shift-end-time" value="16:00" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required></div>
                    </div>
                    <button type="submit" style="width:100%; padding:10px; background:var(--accent-color, #2563eb); color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;">➕ Simpan Pembagian Shift</button>
                </form>
                <h5 style="margin:0 0 8px 0; font-size:0.8rem; color:var(--text-secondary);">📋 Daftar Shift Tersimpan (${this.shifts.length})</h5>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${this.shifts.length === 0 ? '<p style="text-align:center; font-size:0.75rem; color:var(--text-secondary); padding:10px; background:var(--bg-primary); border-radius:8px;">Belum ada jadwal shift</p>' : ''}
                    ${this.shifts.map(s => {
                        const op = this.operators.find(o => String(o.id) === String(s.operatorId));
                        const isEditing = String(this.editingShiftId) === String(s.id);
                        return `<div style="display:flex; justify-content:space-between; align-items:center; background:${isEditing ? 'var(--bg-secondary)' : 'var(--bg-primary)'}; border:1px solid ${isEditing ? 'var(--accent-color)' : 'var(--border-color)'}; padding:10px; border-radius:8px; ${isEditing ? 'outline:1px solid var(--accent-color);' : ''}">
                                <div><b style="color:var(--text-primary); font-size:0.85rem;">${s.name}</b> ${isEditing ? '<span style="font-size:0.6rem; background:#f59e0b; color:#000; padding:1px 5px; border-radius:10px; margin-left:4px;">SEDANG DIEDIT</span>' : ''} <span style="font-size:0.65rem; background:var(--accent-color); color:#fff; padding:2px 6px; border-radius:10px;">${op ? op.name : 'Unknown'}</span>
                                <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">🕒 ${s.startTime} - ${s.endTime} WIB | 📅 ${s.day || 'Setiap Hari'}</div></div>
                                <div style="display:flex; gap:4px;">
                                    <button onclick="KaryawanModule.editShift('${s.id}')" style="background:rgba(37,99,235,0.12); color:#2563eb; border:1px solid rgba(37,99,235,0.3); padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:bold; cursor:pointer;">✏️ Edit</button>
                                    <button onclick="KaryawanModule.deleteShift('${s.id}')" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:bold; cursor:pointer;">Hapus</button>
                                </div></div>`;
                    }).join('')}
                </div>
            </div>
        `;
    },

    deleteShift(id) {
        if (!confirm('Hapus shift ini?')) return;
        this.shifts = this.shifts.filter(s => String(s.id) !== String(id));
        if (String(this.editingShiftId) === String(id)) {
            this.editingShiftId = null;
        }
        localStorage.setItem('edc_shifts', JSON.stringify(this.shifts));
        this.refreshView();
    },

    editShift(id) {
        const shift = this.shifts.find(s => String(s.id) === String(id));
        if (!shift) return alert('Data shift tidak ditemukan!');
        this.editingShiftId = id;
        this.refreshView();
        // Setelah render, isi form
        setTimeout(() => {
            const opSelect = document.getElementById('shift-operator-id');
            const nameInput = document.getElementById('shift-name');
            const daySelect = document.getElementById('shift-day');
            const startInput = document.getElementById('shift-start-time');
            const endInput = document.getElementById('shift-end-time');
            const submitBtn = document.querySelector('#form-add-shift button[type="submit"]');
            if (opSelect) opSelect.value = shift.operatorId;
            if (nameInput) nameInput.value = shift.name;
            if (daySelect) daySelect.value = shift.day || 'Setiap Hari';
            if (startInput) startInput.value = shift.startTime;
            if (endInput) endInput.value = shift.endTime;
            if (submitBtn) {
                submitBtn.textContent = '💾 Update Shift';
                submitBtn.style.background = '#f59e0b';
            }
            // Tambah tombol batal jika belum ada
            const form = document.getElementById('form-add-shift');
            if (form && !document.getElementById('btn-cancel-edit-shift')) {
                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'btn-cancel-edit-shift';
                cancelBtn.type = 'button';
                cancelBtn.textContent = '❌ Batal Edit';
                cancelBtn.style.cssText = 'width:100%; margin-top:8px; padding:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;';
                cancelBtn.onclick = () => this.cancelEditShift();
                form.appendChild(cancelBtn);
                // Scroll ke form
                form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                nameInput?.focus();
            }
        }, 100);
    },

    cancelEditShift() {
        this.editingShiftId = null;
        this.refreshView();
    },

    renderTabAbsensi() {
        const allProcessed = this.getProcessedAbsensiLogs();
        const filtered = allProcessed.filter(log => {
            const matchName = !this.absensiSearchName || log.operatorName.toLowerCase().includes(this.absensiSearchName.toLowerCase());
            let matchDate = true;
            if (this.absensiSearchDate) {
                const searchD = new Date(this.absensiSearchDate).toDateString();
                const logD = new Date(log.rawLoginTime).toDateString();
                matchDate = searchD === logD;
            }
            return matchName && matchDate;
        });
        const totalPages = Math.ceil(filtered.length / this.absensiItemsPerPage) || 1;
        if (this.absensiCurrentPage > totalPages) this.absensiCurrentPage = totalPages;
        const startIndex = (this.absensiCurrentPage - 1) * this.absensiItemsPerPage;
        const paginatedLogs = filtered.slice(startIndex, startIndex + this.absensiItemsPerPage);

        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4 style="margin:0; font-size:0.9rem; color:var(--text-primary);">⏱️ Catatan Absensi Otomatis Karyawan</h4>
                    <button onclick="KaryawanModule.refreshAbsensi()" style="padding:4px 8px; background:var(--accent-color); color:#fff; border:none; border-radius:6px; font-size:0.7rem; cursor:pointer;">🔄 Sync Absensi</button>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; background:var(--bg-primary); padding:8px; border-radius:8px; border:1px solid var(--border-color);">
                    <div><label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Cari Nama Karyawan:</label><input type="text" id="search-absensi-name" value="${this.absensiSearchName}" placeholder="Ketik nama..." style="width:100%; padding:6px; margin-top:2px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.75rem;"></div>
                    <div><label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Filter Tanggal:</label><input type="date" id="search-absensi-date" value="${this.absensiSearchDate}" style="width:100%; padding:6px; margin-top:2px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.75rem;"></div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="table-custom" style="width:100%; font-size:0.75rem; border-collapse:collapse; color:var(--text-color);">
                        <thead><tr style="border-bottom:1px solid var(--border-color); background:var(--bg-primary); text-align:left;">
                            <th style="padding:8px; color:var(--text-secondary);">Operator</th><th style="padding:8px; color:var(--text-secondary);">Tanggal</th>
                            <th style="padding:8px; color:var(--text-secondary);">Jam Masuk</th><th style="padding:8px; color:var(--text-secondary);">Jam Keluar</th>
                            <th style="padding:8px; color:var(--text-secondary);">Total Kerja</th><th style="padding:8px; color:var(--text-secondary);">Status Gaji</th><th style="padding:8px; color:var(--text-secondary); text-align:center;">Aksi</th></tr></thead>
                        <tbody>
                            ${paginatedLogs.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:12px;">Belum ada riwayat absensi.</td></tr>' : ''}
                            ${paginatedLogs.map(log => `
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <td style="padding:8px; font-weight:bold; color:var(--text-primary);">${log.operatorName} ${log.role === 'admin' ? '<span style="font-size:0.6rem; background:#6366f1; color:#fff; padding:1px 4px; border-radius:4px;">ADMIN</span>' : ''}</td>
                                    <td style="padding:8px;">${log.dateStr}</td>
                                    <td style="padding:8px; color:#22c55e; font-weight:bold;">🟢 ${log.loginTimeStr}</td>
                                    <td style="padding:8px; color:#ef4444; font-weight:bold;">🔴 ${log.logoutTimeStr} ${log.isAutoLogout ? '<span style="font-size:0.6rem; background:#f59e0b; color:#000; padding:1px 4px; border-radius:4px;">Auto Trx</span>' : ''}</td>
                                    <td style="padding:8px; font-weight:bold; color:var(--accent-color);">${log.durationFormatted} (${log.durationMinutes} mnt)</td>
                                    <td style="padding:8px;"><span style="background:${log.isPaid ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color:${log.isPaid ? '#22c55e' : '#ef4444'}; padding:2px 6px; border-radius:4px; font-weight:bold;">${log.isPaid ? '✅ Lunas' : '⏳ Belum Dibayar'}</span></td>
                                    <td style="padding:8px; text-align:center; white-space:nowrap;">
                                        <button onclick="KaryawanModule.editAbsensi('${log.id}')" style="background:rgba(37,99,235,0.12); color:var(--accent-color, #2563eb); border:1px solid rgba(37,99,235,0.3); padding:3px 6px; border-radius:4px; font-size:0.68rem; font-weight:bold; cursor:pointer; margin-right:4px;">✏️ Edit</button>
                                        <button onclick="KaryawanModule.deleteAbsensi('${log.id}')" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:3px 6px; border-radius:4px; font-size:0.68rem; font-weight:bold; cursor:pointer;">🗑️ Hapus</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ${totalPages > 1 ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:4px;">
                        <button id="btn-absensi-prev" class="btn-touch" style="padding:4px 12px; font-size:0.75rem;" ${this.absensiCurrentPage <= 1 ? 'disabled' : ''}>&laquo; Prev</button>
                        <span style="font-size:0.75rem; color:var(--text-secondary);">Halaman <b>${this.absensiCurrentPage}</b> dari <b>${totalPages}</b></span>
                        <button id="btn-absensi-next" class="btn-touch" style="padding:4px 12px; font-size:0.75rem;" ${this.absensiCurrentPage >= totalPages ? 'disabled' : ''}>Next &raquo;</button></div>` : ''}
            </div>
        `;
    },

    getProcessedAbsensiLogs() {
        const rawAttendances = this.attendances || [];
        return rawAttendances.map(att => {
            // Normalisasi ulang untuk jaga-jaga data lama
            const normId = att.operatorId || att.operator_id || att.karyawanId || att.userId || att.operator?.id;
            if (normId) att.operatorId = String(normId);
            const op = this.operators.find(o => String(o.id) === String(att.operatorId)) || this.operators.find(o => o.name && att.operatorName && o.name.toLowerCase() === att.operatorName.toLowerCase());
            const opName = op ? op.name : (att.operatorName || 'Operator');
            let rawLoginDate = new Date(att.loginTime);
            let rawLogoutDate = att.logoutTime ? new Date(att.logoutTime) : null;
            const opShift = this.shifts.find(s => String(s.operatorId) === String(att.operatorId));
            let effectiveLoginDate = isNaN(rawLoginDate.getTime()) ? new Date() : new Date(rawLoginDate);
            let effectiveLogoutDate = (rawLogoutDate && !isNaN(rawLogoutDate.getTime())) ? new Date(rawLogoutDate) : null;
            let shiftStartDate = null, shiftEndDate = null;
            if (opShift && opShift.startTime && opShift.endTime) {
                const [sh, sm] = opShift.startTime.split(':').map(Number);
                const [eh, em] = opShift.endTime.split(':').map(Number);
                shiftStartDate = new Date(effectiveLoginDate); shiftStartDate.setHours(sh, sm, 0, 0);
                shiftEndDate = new Date(effectiveLoginDate); shiftEndDate.setHours(eh, em, 0, 0);
                if (shiftEndDate < shiftStartDate) shiftEndDate.setDate(shiftEndDate.getDate() + 1);
                if (rawLoginDate < shiftStartDate) effectiveLoginDate = new Date(shiftStartDate);
                if (rawLogoutDate && rawLogoutDate > shiftEndDate) effectiveLogoutDate = new Date(shiftEndDate);
            }
            let isAutoLogout = false;
            if (!att.logoutTime) {
                const searchEndBoundary = shiftEndDate || new Date(effectiveLoginDate.getFullYear(), effectiveLoginDate.getMonth(), effectiveLoginDate.getDate(), 23, 59, 59);
                const opTrxs = this.transactions.filter(t => {
                    const tOpId = t.operator?.id || t.operatorId;
                    const tOpName = t.operator?.name || t.operator;
                    const matchesOp = String(tOpId) === String(att.operatorId) || tOpName === opName;
                    const tDate = new Date(t.createdAt || t.timestamp);
                    return matchesOp && tDate >= effectiveLoginDate && tDate <= searchEndBoundary;
                }).sort((a,b) => new Date(b.createdAt||b.timestamp) - new Date(a.createdAt||a.timestamp));
                if (opTrxs.length > 0) {
                    effectiveLogoutDate = new Date(opTrxs[0].createdAt || opTrxs[0].timestamp);
                    isAutoLogout = true;
                } else {
                    const now = new Date();
                    if (shiftEndDate && now > shiftEndDate) effectiveLogoutDate = new Date(shiftEndDate);
                    else effectiveLogoutDate = now;
                }
            }
            const diffMs = Math.max(0, effectiveLogoutDate - effectiveLoginDate);
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const attId = att.id || `${att.operatorId}_${att.loginTime}`;
            return {
                id: attId,
                rawLoginTime: att.loginTime,
                rawLogoutTime: att.logoutTime,
                operatorId: att.operatorId,
                operatorName: opName,
                role: att.role || 'operator',
                dateStr: effectiveLoginDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }),
                loginTimeStr: effectiveLoginDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
                logoutTimeStr: effectiveLogoutDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
                durationMinutes: totalMinutes,
                durationFormatted: `${hours} jam ${mins} mnt`,
                isAutoLogout,
                isPaid: !!att.isPaid,
                paidAt: att.paidAt || null,
                status: att.logoutTime ? 'Selesai' : (isAutoLogout ? 'Auto-Close' : 'Aktif Shift')
            };
        });
    },

    async refreshAbsensi() { await this.render(); this.refreshView(); },
    async editAbsensi(id) {
        const att = this.attendances.find(a => String(a.id || `${a.operatorId}_${a.loginTime}`) === String(id));
        if (!att) return alert('Data absensi tidak ditemukan.');
        const loginFormatted = att.loginTime ? new Date(att.loginTime).toISOString().slice(0, 16) : '';
        const logoutFormatted = att.logoutTime ? new Date(att.logoutTime).toISOString().slice(0, 16) : '';
        const newLoginStr = prompt('Edit Waktu Jam Masuk (YYYY-MM-DDTHH:MM):', loginFormatted);
        if (newLoginStr === null) return;
        const newLogoutStr = prompt('Edit Waktu Jam Keluar (YYYY-MM-DDTHH:MM, kosongkan jika belum logout):', logoutFormatted);
        if (newLogoutStr === null) return;
        const newLoginDate = new Date(newLoginStr);
        if (isNaN(newLoginDate.getTime())) return alert('Format jam masuk tidak valid.');
        att.loginTime = newLoginDate.toISOString();
        if (newLogoutStr.trim() !== '') {
            const newLogoutDate = new Date(newLogoutStr);
            if (!isNaN(newLogoutDate.getTime())) att.logoutTime = newLogoutDate.toISOString();
        } else att.logoutTime = null;
        localStorage.setItem('edc_attendances', JSON.stringify(this.attendances));
        try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(att); } catch(e) {}
        alert('Data absensi berhasil diperbarui!'); this.refreshView();
    },
    async deleteAbsensi(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus catatan absensi ini?')) return;
        this.attendances = this.attendances.filter(a => String(a.id || `${a.operatorId}_${a.loginTime}`) !== String(id));
        localStorage.setItem('edc_attendances', JSON.stringify(this.attendances));
        try { if (DB && typeof DB.deleteAttendance === 'function') await DB.deleteAttendance(id); } catch(e) {}
        alert('Data absensi berhasil dihapus!'); this.refreshView();
    },

    renderTabGaji() {
        const opOptions = this.operators.map(op => `<option value="${op.id}" ${String(op.id) === String(this.selectedOperatorId) ? 'selected' : ''}>${op.name}</option>`).join('');
        const currentSalary = this.salaries.find(s => String(s.operatorId) === String(this.selectedOperatorId)) || { dailyRate: 50000, weeklyRate: 300000, monthlyRate: 1250000, bonusPercent: 0 };
        return `<div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">💰 Pengaturan Gaji Pokok & Bonus Transaksi</h4>
                <div style="margin-bottom:12px;"><label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Pilih Operator Karyawan:</label>
                    <select id="select-operator-gaji" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.85rem;">${opOptions || '<option value="">Belum ada operator</option>'}</select>
                </div>
                <form id="form-setting-gaji" style="background:var(--bg-primary); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
                        <div><label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Hari (Rp)</label><input type="number" id="gaji-daily" value="${currentSalary.dailyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required><small style="font-size:0.6rem; color:var(--text-secondary);">1 Hari</small></div>
                        <div><label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Minggu (Rp)</label><input type="number" id="gaji-weekly" value="${currentSalary.weeklyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required><small style="font-size:0.6rem; color:var(--text-secondary);">6 Hari Kerja</small></div>
                        <div><label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Bulan (Rp)</label><input type="number" id="gaji-monthly" value="${currentSalary.monthlyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required><small style="font-size:0.6rem; color:var(--text-secondary);">25 Hari Kerja</small></div>
                    </div>
                    <div style="margin-bottom:12px; background:var(--bg-card); padding:10px; border-radius:8px; border:1px dashed var(--accent-color);">
                        <label style="font-size:0.75rem; color:var(--text-primary); font-weight:bold;">🎁 Bonus dari Persentase Laba Bersih Per Transaksi (%)</label>
                        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;"><input type="number" step="0.1" id="bonus-percent" value="${currentSalary.bonusPercent || 0}" style="flex:1; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.85rem;" required><span style="font-size:0.85rem; font-weight:bold; color:var(--text-primary);">%</span></div>
                        <small style="font-size:0.68rem; color:var(--text-secondary); display:block; margin-top:4px;">Operator mendapat % dari laba bersih setiap transaksi yang dilayani.</small>
                    </div>
                    <button type="submit" style="width:100%; padding:10px; background:#10b981; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;">💾 Simpan Pengaturan Gaji & Bonus</button>
                </form>
            </div>`;
    },

    renderTabSlip() {
        const opOptions = this.operators.map(op => `<option value="${op.id}" ${String(op.id) === String(this.selectedOperatorId) ? 'selected' : ''}>${op.name}</option>`).join('');
        const calcData = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);
        return `<div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">📄 Kalkulator & Generator Slip Gaji Otomatis</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                    <div><label style="font-size:0.72rem; color:var(--text-secondary); font-weight:bold;">Pilih Karyawan:</label><select id="slip-operator-id" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;">${opOptions || '<option value="">Belum ada operator</option>'}</select></div>
                    <div><label style="font-size:0.72rem; color:var(--text-secondary); font-weight:bold;">Periode Hitung:</label><select id="slip-period" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;"><option value="daily" ${this.selectedPeriod==='daily'?'selected':''}>Harian (Daily)</option><option value="weekly" ${this.selectedPeriod==='weekly'?'selected':''}>Mingguan (Weekly)</option><option value="monthly" ${this.selectedPeriod==='monthly'?'selected':''}>Bulanan (Monthly)</option></select></div>
                </div>
                <div id="slip-preview-card" style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:12px;">
                    <h5 style="margin:0 0 8px 0; font-size:0.85rem; color:var(--accent-color); border-bottom:1px dashed var(--border-color); padding-bottom:6px;">📌 Rincian Hasil Perhitungan Gaji Otomatis (Belum Dibayar)</h5>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.75rem; margin-bottom:8px;">
                        <div>Nama Operator: <b style="color:var(--text-primary);">${calcData.opName}</b></div><div>No. HP / WA: <b style="color:var(--text-primary);">${calcData.opPhone}</b></div>
                        <div>Total Durasi Kerja: <b style="color:#22c55e;">${calcData.totalMinutes} Menit</b></div><div>Tarif Per Menit: <b style="color:var(--text-primary);">Rp ${calcData.ratePerMinute.toFixed(2)}/mnt</b></div>
                        <div>Total Omset Dilayani: <b>Rp ${calcData.totalOmset.toLocaleString('id-ID')}</b></div><div>Total Laba Dilayani: <b>Rp ${calcData.totalProfit.toLocaleString('id-ID')}</b></div>
                    </div>
                    <div style="border-top:1px dashed var(--border-color); padding-top:8px; font-size:0.8rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Gaji Pokok (${calcData.totalMinutes} mnt @ Rp ${calcData.ratePerMinute.toFixed(1)}):</span><b>Rp ${calcData.baseSalaryCalculated.toLocaleString('id-ID')}</b></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#22c55e;"><span>Bonus Transaksi (${calcData.bonusPercent}% dari Laba Rp ${calcData.totalProfit.toLocaleString('id-ID')}):</span><b>+ Rp ${calcData.bonusCalculated.toLocaleString('id-ID')}</b></div>
                        <div style="display:flex; justify-content:space-between; font-size:0.95rem; font-weight:bold; color:var(--text-primary); border-top:1px solid var(--border-color); padding-top:6px; margin-top:6px;"><span>TOTAL GAJI DITERIMA:</span><span style="color:var(--accent-color);">Rp ${calcData.grandTotalSalary.toLocaleString('id-ID')}</span></div>
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="btn-print-slip" class="btn-touch active" style="flex:1; padding:10px; font-size:0.8rem;">🖨️ Cetak Slip Gaji</button>
                    <button id="btn-send-wa-slip" class="btn-touch" style="flex:1; padding:10px; background:#25D366; color:#fff; font-size:0.8rem; font-weight:bold;">📲 Kirim Slip via WA</button>
                    <button id="btn-reset-gaji" class="btn-touch" style="flex:100%; margin-top:4px; padding:10px; background:#dc2626; color:#fff; font-size:0.8rem; font-weight:bold;">✅ Bayar & Reset Gaji Periode Ini</button>
                </div>
            </div>`;
    },

    getShiftDurationMinutes(operatorId) {
        // FIX BARU: Ambil durasi berdasarkan rentang jam shift karyawan
        const opShifts = this.shifts.filter(s => String(s.operatorId) === String(operatorId));
        if (opShifts.length === 0) return 480; // fallback 8 jam jika belum set shift
        // Hitung rata-rata durasi semua shift operator ini, atau pakai shift pertama
        const durations = opShifts.map(s => {
            if (!s.startTime || !s.endTime) return 480;
            const [sh, sm] = s.startTime.split(':').map(Number);
            const [eh, em] = s.endTime.split(':').map(Number);
            let startMins = sh * 60 + sm;
            let endMins = eh * 60 + em;
            let diff = endMins - startMins;
            if (diff <= 0) diff += 24 * 60; // lintas hari (misal 22:00-06:00)
            return diff;
        });
        // Jika ada 1 shift, pakai itu. Jika banyak, rata-rata
        const avg = durations.reduce((a,b)=>a+b,0) / durations.length;
        return Math.round(avg) || 480;
    },

    calculateAutomatedSalary(operatorId, period) {
        const op = this.operators.find(o => String(o.id) === String(operatorId));
        const opName = op ? op.name : 'Unknown Operator';
        const opPhone = op ? (op.phone || op.noHp || op.wa || '-') : '-';
        const salSetting = this.salaries.find(s => String(s.operatorId) === String(operatorId)) || { dailyRate: 50000, weeklyRate: 300000, monthlyRate: 1250000, bonusPercent: 0 };
        const allLogs = this.getProcessedAbsensiLogs().filter(a => String(a.operatorId) === String(operatorId) && !a.isPaid);
        const now = new Date();
        let startDate;
        if (period === 'daily') {
            startDate = new Date(now); startDate.setHours(0,0,0,0);
        } else if (period === 'weekly') {
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
        }
        const filteredLogs = allLogs.filter(a => {
            const d = new Date(a.rawLoginTime);
            return d >= startDate && d <= now;
        });
        const totalMinutes = filteredLogs.reduce((sum, log) => sum + (Number(log.durationMinutes) || 0), 0);
        const totalHours = totalMinutes / 60;

        // === FIX BARU: durasi berdasarkan rentang jam shift ===
        const shiftDuration = this.getShiftDurationMinutes(operatorId); // misal 390 menit untuk 16:30-23:00
        // dailyRate sekarang adalah untuk shiftDuration, bukan 480 menit fix
        let ratePerMinute;
        if (period === 'daily') {
            const base = Number(salSetting.dailyRate) || 0;
            ratePerMinute = shiftDuration > 0 ? base / shiftDuration : 0;
        } else if (period === 'weekly') {
            // weeklyRate untuk 6x durasi shift (6 hari kerja)
            const base = Number(salSetting.weeklyRate) || (Number(salSetting.dailyRate) * 6);
            const weeklyStandard = shiftDuration * 6;
            ratePerMinute = weeklyStandard > 0 ? base / weeklyStandard : 0;
        } else {
            // monthlyRate untuk 25x durasi shift (25 hari kerja)
            const base = Number(salSetting.monthlyRate) || (Number(salSetting.dailyRate) * 25);
            const monthlyStandard = shiftDuration * 25;
            ratePerMinute = monthlyStandard > 0 ? base / monthlyStandard : 0;
        }
        // Fallback
        if (!ratePerMinute || ratePerMinute <= 0) {
            const fallbackBase = Number(salSetting.dailyRate) || 0;
            ratePerMinute = shiftDuration > 0 ? fallbackBase / shiftDuration : fallbackBase / 480;
        }
        const baseSalaryCalculated = Math.round(totalMinutes * ratePerMinute);

        const opTrxs = this.transactions.filter(t => {
            const tOpId = t.operator?.id || t.operatorId;
            const tOpName = t.operator?.name || t.operator;
            const matchesOp = String(tOpId) === String(operatorId) || tOpName === opName;
            if (!matchesOp) return false;
            const tDate = new Date(t.createdAt || t.timestamp || t.date || now);
            return tDate >= startDate && tDate <= now;
        });
        const totalOmset = opTrxs.reduce((sum, t) => sum + (Number(t.total ?? t.grandTotal ?? t.omset ?? 0)), 0);
        const totalProfit = opTrxs.reduce((sum, t) => sum + (Number(t.grossProfit ?? t.computedLaba ?? t.laba ?? t.profit ?? 0)), 0);
        const bonusPercent = Number(salSetting.bonusPercent || 0);
        const bonusCalculated = Math.round((totalProfit * bonusPercent) / 100);
        const grandTotalSalary = baseSalaryCalculated + bonusCalculated;
        const effectiveDays = shiftDuration > 0 ? (totalMinutes / shiftDuration).toFixed(2) : '0';
        return { opName, opPhone, period, startDate, shiftDuration, filteredLogs, totalMinutes, totalHours, effectiveDays, ratePerMinute, baseSalaryCalculated, totalOmset, totalProfit, opTrxCount: opTrxs.length, bonusPercent, bonusCalculated, grandTotalSalary };
    },

    async payAndResetSalary() {
        const data = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);
        if (data.filteredLogs.length === 0 || data.grandTotalSalary === 0) return alert('Tidak ada akumulasi gaji/absensi belum dibayar yang perlu direset.');
        if (!confirm(`Tandai LUNAS & Reset Gaji sebesar Rp ${data.grandTotalSalary.toLocaleString('id-ID')} untuk ${data.opName}?`)) return;
        const logIdsToPay = new Set(data.filteredLogs.map(l => String(l.id)));
        const nowIso = new Date().toISOString();
        this.attendances.forEach(att => {
            const attId = String(att.id || `${att.operatorId}_${att.loginTime}`);
            if (logIdsToPay.has(attId)) { att.isPaid = true; att.paidAt = nowIso; }
        });
        localStorage.setItem('edc_attendances', JSON.stringify(this.attendances));
        try { if (DB && typeof DB.saveAttendance === 'function') for (let att of this.attendances) if (logIdsToPay.has(String(att.id || `${att.operatorId}_${att.loginTime}`))) await DB.saveAttendance(att); } catch(e) {}
        alert(`Gaji ${data.opName} berhasil dibayarkan dan periode direset!`); this.refreshView();
    },

    updateTabHighlight() {
        // FIX: highlight & fokus tab aktif tanpa ubah logika lain
        document.querySelectorAll('.tab-karyawan-btn').forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === this.activeTab;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) {
                btn.style.background = 'var(--accent-color, #2563eb)';
                btn.style.color = '#fff';
                btn.style.boxShadow = '0 2px 8px rgba(37,99,235,0.35)';
                // fokus & scroll ke tengah biar kelihatan di EDC
                try { btn.focus({ preventScroll: false }); btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch(e){ try{ btn.focus(); }catch(_){} }
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-secondary)';
                btn.style.boxShadow = 'none';
            }
        });
    },

    async refreshView() {
        const content = document.getElementById('tab-content-karyawan');
        if (content) { content.innerHTML = this.renderTabContent(); this.bindEvents(); }
        this.updateTabHighlight();
    },

    bindEvents() {
        document.getElementById('form-add-shift')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const operatorId = document.getElementById('shift-operator-id').value;
            const name = document.getElementById('shift-name').value.trim();
            const day = document.getElementById('shift-day').value;
            const startTime = document.getElementById('shift-start-time').value;
            const endTime = document.getElementById('shift-end-time').value;
            if (!operatorId) return alert('Pilih operator karyawan!');
            if (startTime >= endTime) {
                // Izinkan shift lintas hari (misal 22:00-06:00) tapi validasi jika sama
                if (startTime === endTime) return alert('Jam masuk dan jam keluar tidak boleh sama!');
            }
            if (this.editingShiftId) {
                const idx = this.shifts.findIndex(s => String(s.id) === String(this.editingShiftId));
                if (idx >= 0) {
                    this.shifts[idx] = { ...this.shifts[idx], operatorId, name, day, startTime, endTime };
                    localStorage.setItem('edc_shifts', JSON.stringify(this.shifts));
                    this.editingShiftId = null;
                    alert('Shift berhasil diperbarui!'); 
                    this.refreshView();
                }
            } else {
                const newShift = { id: 'shift_' + Date.now(), operatorId, name, day, startTime, endTime };
                this.shifts.push(newShift);
                localStorage.setItem('edc_shifts', JSON.stringify(this.shifts));
                alert('Shift berhasil ditambahkan!'); this.refreshView();
            }
        });
        document.getElementById('search-absensi-name')?.addEventListener('input', (e) => { this.absensiSearchName = e.target.value; this.absensiCurrentPage = 1; this.refreshView(); });
        document.getElementById('search-absensi-date')?.addEventListener('change', (e) => { this.absensiSearchDate = e.target.value; this.absensiCurrentPage = 1; this.refreshView(); });
        document.getElementById('btn-absensi-prev')?.addEventListener('click', () => { if (this.absensiCurrentPage > 1) { this.absensiCurrentPage--; this.refreshView(); } });
        document.getElementById('btn-absensi-next')?.addEventListener('click', () => { this.absensiCurrentPage++; this.refreshView(); });
        document.getElementById('select-operator-gaji')?.addEventListener('change', (e) => { this.selectedOperatorId = e.target.value; this.refreshView(); });
        const inDaily = document.getElementById('gaji-daily'); const inWeekly = document.getElementById('gaji-weekly'); const inMonthly = document.getElementById('gaji-monthly');
        inDaily?.addEventListener('input', (e) => { const val = parseFloat(e.target.value) || 0; if (inWeekly) inWeekly.value = Math.round(val * 6); if (inMonthly) inMonthly.value = Math.round(val * 25); });
        inWeekly?.addEventListener('input', (e) => { const val = parseFloat(e.target.value) || 0; const daily = val / 6; if (inDaily) inDaily.value = Math.round(daily); if (inMonthly) inMonthly.value = Math.round(daily * 25); });
        inMonthly?.addEventListener('input', (e) => { const val = parseFloat(e.target.value) || 0; const daily = val / 25; if (inDaily) inDaily.value = Math.round(daily); if (inWeekly) inWeekly.value = Math.round(daily * 6); });
        document.getElementById('form-setting-gaji')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const dailyRate = parseFloat(document.getElementById('gaji-daily').value) || 0;
            const weeklyRate = parseFloat(document.getElementById('gaji-weekly').value) || 0;
            const monthlyRate = parseFloat(document.getElementById('gaji-monthly').value) || 0;
            const bonusPercent = parseFloat(document.getElementById('bonus-percent').value) || 0;
            const existingIndex = this.salaries.findIndex(s => String(s.operatorId) === String(this.selectedOperatorId));
            const salaryData = { operatorId: this.selectedOperatorId, dailyRate, weeklyRate, monthlyRate, bonusPercent };
            if (existingIndex >= 0) this.salaries[existingIndex] = salaryData; else this.salaries.push(salaryData);
            localStorage.setItem('edc_salaries', JSON.stringify(this.salaries));
            alert('Pengaturan gaji dan bonus berhasil disimpan!'); this.refreshView();
        });
        document.getElementById('slip-operator-id')?.addEventListener('change', (e) => { this.selectedOperatorId = e.target.value; this.refreshView(); });
        document.getElementById('slip-period')?.addEventListener('change', (e) => { this.selectedPeriod = e.target.value; this.refreshView(); });
        document.getElementById('btn-print-slip')?.addEventListener('click', () => window.print());
        document.getElementById('btn-send-wa-slip')?.addEventListener('click', () => {
            const data = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);
            const msg = `*SLIP GAJI OPERATOR*\nNama: ${data.opName}\nPeriode: ${data.period.toUpperCase()}\n\nTotal Durasi Kerja: ${data.totalMinutes} Menit\nGaji Pokok: Rp ${data.baseSalaryCalculated.toLocaleString('id-ID')}\nBonus Laba (${data.bonusPercent}%): Rp ${data.bonusCalculated.toLocaleString('id-ID')}\n-----------------------------------\n*TOTAL DITERIMA: Rp ${data.grandTotalSalary.toLocaleString('id-ID')}*\n\nTerima kasih atas kerja keras Anda!`;
            const cleanPhone = data.opPhone.replace(/[^0-9]/g, '');
            const targetPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
            window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        });
        document.getElementById('btn-reset-gaji')?.addEventListener('click', () => this.payAndResetSalary());
    },

    init() {
        window.KaryawanModule = this;
        // FIX: bind tab dengan highlight & fokus yang benar
        const bindTabButtons = () => {
            document.querySelectorAll('.tab-karyawan-btn').forEach(btn => {
                // hindari double listener
                if (btn._karyawanBound) return;
                btn._karyawanBound = true;
                btn.addEventListener('click', (e) => {
                    const tab = e.currentTarget.getAttribute('data-tab');
                    if (!tab) return;
                    this.activeTab = tab;
                    this.absensiCurrentPage = 1; // reset pagination pas ganti tab
                    this.refreshView();
                });
                // keyboard accessibility: Enter / Space
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        btn.click();
                    }
                });
            });
        };
        bindTabButtons();
        // panggil lagi setelah render awal untuk pastikan highlight aktif
        setTimeout(() => { bindTabButtons(); this.updateTabHighlight(); }, 50);
        this.bindEvents();
        this.updateTabHighlight();
    }
};

export default KaryawanModule;
