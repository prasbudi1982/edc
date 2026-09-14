import DB from './db.js';

if (!window._karyawanState) {
    window._karyawanState = {
        activeTab: 'shift', // 'shift', 'absensi', 'gaji', 'slip'
        selectedOperatorId: '',
        selectedPeriod: 'daily' // 'daily', 'weekly', 'monthly'
    };
}

const KaryawanModule = {
    operators: [],
    shifts: [],
    attendances: [],
    salaries: [],
    transactions: [],

    get activeTab() { return window._karyawanState.activeTab; },
    set activeTab(val) { window._karyawanState.activeTab = val; },

    get selectedOperatorId() { return window._karyawanState.selectedOperatorId; },
    set selectedOperatorId(val) { window._karyawanState.selectedOperatorId = val; },

    get selectedPeriod() { return window._karyawanState.selectedPeriod; },
    set selectedPeriod(val) { window._karyawanState.selectedPeriod = val; },

    async render() {
        this.operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
        this.shifts = JSON.parse(localStorage.getItem('edc_shifts') || '[]');
        this.attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
        this.salaries = JSON.parse(localStorage.getItem('edc_salaries') || '[]');
        try {
            this.transactions = await DB.getTransactions() || [];
        } catch(e) {
            this.transactions = [];
        }

        if (!this.selectedOperatorId && this.operators.length > 0) {
            this.selectedOperatorId = this.operators[0].id;
        }

        return `
            <div class="setting-section" style="padding-bottom: 30px;">
                <div style="text-align:center; margin-bottom:14px;">
                    <h3 style="color:var(--text-primary); font-size:1.2rem; font-weight:800; margin:0;">👥 Modul Pengelolaan Karyawan</h3>
                    <p style="color:var(--text-secondary); font-size:0.75rem; margin-top:2px;">Pembagian shift, absensi otomatis, pengelolaan gaji & bonus, serta slip gaji</p>
                </div>

                <!-- DUA TIER / 4 TAB LENGKAP -->
                <div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:14px; background:var(--bg-card); padding:6px; border-radius:12px; border:1px solid var(--border-color);">
                    <button class="tab-karyawan-btn ${this.activeTab === 'shift' ? 'active' : ''}" data-tab="shift" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='shift'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='shift'?'#fff':'var(--text-secondary)'};">
                        📅 1. Pembagian Shift
                    </button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'absensi' ? 'active' : ''}" data-tab="absensi" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='absensi'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='absensi'?'#fff':'var(--text-secondary)'};">
                        ⏱️ 2. Absensi Otomatis
                    </button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'gaji' ? 'active' : ''}" data-tab="gaji" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='gaji'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='gaji'?'#fff':'var(--text-secondary)'};">
                        💰 3. Gaji & Bonus
                    </button>
                    <button class="tab-karyawan-btn ${this.activeTab === 'slip' ? 'active' : ''}" data-tab="slip" style="flex:1; padding:10px 6px; border:none; border-radius:8px; font-weight:700; font-size:0.75rem; cursor:pointer; white-space:nowrap; background:${this.activeTab==='slip'?'var(--accent-color, #2563eb)':'transparent'}; color:${this.activeTab==='slip'?'#fff':'var(--text-secondary)'};">
                        📄 4. Generate Slip Gaji
                    </button>
                </div>

                <!-- KONTEN BERDASARKAN TAB -->
                <div id="tab-content-karyawan">
                    ${this.renderTabContent()}
                </div>
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

    // ==========================================
    // TAB 1: PEMBAGIAN SHIFT
    // ==========================================
    renderTabShift() {
        const opOptions = this.operators.map(op => `<option value="${op.id}">${op.name}</option>`).join('');
        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">📅 Pengaturan Pembagian Shift Operator</h4>
                
                <form id="form-add-shift" style="background:var(--bg-primary); padding:12px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:14px;">
                    <div style="margin-bottom:8px;">
                        <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Operator Karyawan</label>
                        <select id="shift-operator-id" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                            ${opOptions || '<option value="">Belum ada operator. Tambahkan di Setting!</option>'}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Nama Shift</label>
                            <input type="text" id="shift-name" placeholder="misal: Shift Pagi" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Hari Kerja</label>
                            <select id="shift-day" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;">
                                <option value="Setiap Hari">Setiap Hari</option>
                                <option value="Senin - Jumat">Senin - Jumat</option>
                                <option value="Sabtu - Minggu">Sabtu - Minggu</option>
                                <option value="Senin">Senin</option>
                                <option value="Selasa">Selasa</option>
                                <option value="Rabu">Rabu</option>
                                <option value="Kamis">Kamis</option>
                                <option value="Jumat">Jumat</option>
                                <option value="Sabtu">Sabtu</option>
                                <option value="Minggu">Minggu</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Jam Masuk</label>
                            <input type="time" id="shift-start-time" value="08:00" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Jam Keluar</label>
                            <input type="time" id="shift-end-time" value="16:00" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                        </div>
                    </div>
                    <button type="submit" style="width:100%; padding:10px; background:var(--accent-color, #2563eb); color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;">
                        ➕ Simpan Pembagian Shift
                    </button>
                </form>

                <h5 style="margin:0 0 8px 0; font-size:0.8rem; color:var(--text-secondary);">📋 Daftar Shift Tersimpan (${this.shifts.length})</h5>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${this.shifts.length === 0 ? '<p style="text-align:center; font-size:0.75rem; color:var(--text-secondary); padding:10px; background:var(--bg-primary); border-radius:8px;">Belum ada jadwal shift</p>' : ''}
                    ${this.shifts.map(s => {
                        const op = this.operators.find(o => String(o.id) === String(s.operatorId));
                        return `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-primary); border:1px solid var(--border-color); padding:10px; border-radius:8px;">
                                <div>
                                    <b style="color:var(--text-primary); font-size:0.85rem;">${s.name}</b> 
                                    <span style="font-size:0.65rem; background:var(--accent-color); color:#fff; padding:2px 6px; border-radius:10px;">${op ? op.name : 'Unknown'}</span>
                                    <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">
                                        🕒 ${s.startTime} - ${s.endTime} WIB | 📅 ${s.day || 'Setiap Hari'}
                                    </div>
                                </div>
                                <button onclick="KaryawanModule.deleteShift('${s.id}')" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:bold; cursor:pointer;">Hapus</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    // ==========================================
    // TAB 2: ABSENSI OTOMATIS
    // ==========================================
    renderTabAbsensi() {
        const processedLogs = this.getProcessedAbsensiLogs();

        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4 style="margin:0; font-size:0.9rem; color:var(--text-primary);">⏱️ Catatan Absensi Otomatis Karyawan</h4>
                    <button onclick="KaryawanModule.refreshAbsensi()" style="padding:4px 8px; background:var(--accent-color); color:#fff; border:none; border-radius:6px; font-size:0.7rem; cursor:pointer;">🔄 Sync Absensi</button>
                </div>
                <p style="font-size:0.72rem; color:var(--text-secondary); margin:0 0 12px 0;">
                    * <b>Jam Masuk:</b> Tercatat saat login.<br>
                    * <b>Jam Keluar:</b> Tercatat saat logout atau diambil dari transaksi terakhir jika lupa logout.
                </p>

                <div style="overflow-x:auto;">
                    <table class="table-custom" style="width:100%; font-size:0.75rem; border-collapse:collapse; color:var(--text-color);">
                        <thead>
                            <tr style="border-bottom:1px solid var(--border-color); background:var(--bg-primary); text-align:left;">
                                <th style="padding:8px; color:var(--text-secondary);">Operator</th>
                                <th style="padding:8px; color:var(--text-secondary);">Tanggal</th>
                                <th style="padding:8px; color:var(--text-secondary);">Jam Masuk</th>
                                <th style="padding:8px; color:var(--text-secondary);">Jam Keluar (Trx Terakhir)</th>
                                <th style="padding:8px; color:var(--text-secondary);">Total Kerja</th>
                                <th style="padding:8px; color:var(--text-secondary);">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${processedLogs.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:12px;">Belum ada riwayat absensi.</td></tr>' : ''}
                            ${processedLogs.map(log => `
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <td style="padding:8px; font-weight:bold; color:var(--text-primary);">${log.operatorName}</td>
                                    <td style="padding:8px;">${log.dateStr}</td>
                                    <td style="padding:8px; color:#22c55e; font-weight:bold;">🟢 ${log.loginTimeStr}</td>
                                    <td style="padding:8px; color:#ef4444; font-weight:bold;">🔴 ${log.logoutTimeStr} ${log.isAutoLogout ? '<span style="font-size:0.6rem; background:#f59e0b; color:#000; padding:1px 4px; border-radius:4px;">Auto Trx</span>' : ''}</td>
                                    <td style="padding:8px; font-weight:bold; color:var(--accent-color);">${log.durationFormatted} (${log.durationMinutes} mnt)</td>
                                    <td style="padding:8px;"><span style="background:${log.status === 'Selesai' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'}; color:${log.status === 'Selesai' ? '#22c55e' : '#f59e0b'}; padding:2px 6px; border-radius:4px; font-weight:bold;">${log.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    getProcessedAbsensiLogs() {
        const rawAttendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
        return rawAttendances.map(att => {
            const op = this.operators.find(o => String(o.id) === String(att.operatorId));
            const opName = op ? op.name : (att.operatorName || 'Operator');

            let rawLoginDate = new Date(att.loginTime);
            let rawLogoutDate = att.logoutTime ? new Date(att.logoutTime) : null;

            // Cari shift operator
            const opShift = this.shifts.find(s => String(s.operatorId) === String(att.operatorId));

            let effectiveLoginDate = new Date(rawLoginDate);
            let effectiveLogoutDate = rawLogoutDate ? new Date(rawLogoutDate) : null;
            let shiftStartDate = null;
            let shiftEndDate = null;

            if (opShift && opShift.startTime && opShift.endTime) {
                const [startHour, startMinute] = opShift.startTime.split(':').map(Number);
                const [endHour, endMinute] = opShift.endTime.split(':').map(Number);

                shiftStartDate = new Date(rawLoginDate);
                shiftStartDate.setHours(startHour, startMinute, 0, 0);

                shiftEndDate = new Date(rawLoginDate);
                shiftEndDate.setHours(endHour, endMinute, 0, 0);

                // Handle shift melewati tengah malam
                if (shiftEndDate < shiftStartDate) {
                    shiftEndDate.setDate(shiftEndDate.getDate() + 1);
                }

                // Rule 1: Jika login sebelum jam shift -> hitung pada awal jam shift
                if (rawLoginDate < shiftStartDate) {
                    effectiveLoginDate = new Date(shiftStartDate);
                }

                // Rule 2: Jika logout di atas jam shift -> hitung pada akhir jam shift
                if (rawLogoutDate && rawLogoutDate > shiftEndDate) {
                    effectiveLogoutDate = new Date(shiftEndDate);
                }
            }

            let isAutoLogout = false;

            // Rule 3: Jika tidak logout pada rentang shift
            if (!att.logoutTime) {
                const searchEndBoundary = shiftEndDate || new Date(rawLoginDate.getFullYear(), rawLoginDate.getMonth(), rawLoginDate.getDate(), 23, 59, 59);

                // Transaksi terakhir pada rentang shift
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
                    // Jika tidak ada transaksi, batasi maksimum pada akhir shift atau waktu saat ini
                    const now = new Date();
                    if (shiftEndDate && now > shiftEndDate) {
                        effectiveLogoutDate = new Date(shiftEndDate);
                    } else {
                        effectiveLogoutDate = now;
                    }
                }
            }

            const diffMs = Math.max(0, effectiveLogoutDate - effectiveLoginDate);
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;

            return {
                id: att.id,
                operatorId: att.operatorId,
                operatorName: opName,
                dateStr: effectiveLoginDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }),
                loginTimeStr: effectiveLoginDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
                logoutTimeStr: effectiveLogoutDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
                durationMinutes: totalMinutes,
                durationFormatted: `${hours} jam ${mins} mnt`,
                isAutoLogout,
                status: att.logoutTime ? 'Selesai' : (isAutoLogout ? 'Auto-Close' : 'Aktif Shift')
            };
        });
    },

    // ==========================================
    // TAB 3: GAJI & BONUS (DENGAN AUTO SINKRONISASI FIELD)
    // ==========================================
    renderTabGaji() {
        const opOptions = this.operators.map(op => `<option value="${op.id}" ${String(op.id) === String(this.selectedOperatorId) ? 'selected' : ''}>${op.name}</option>`).join('');
        const currentSalary = this.salaries.find(s => String(s.operatorId) === String(this.selectedOperatorId)) || {
            dailyRate: 50000,
            weeklyRate: 300000,
            monthlyRate: 1250000,
            bonusPercent: 0
        };

        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">💰 Pengaturan Gaji Pokok & Bonus Transaksi</h4>

                <div style="margin-bottom:12px;">
                    <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">Pilih Operator Karyawan:</label>
                    <select id="select-operator-gaji" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.85rem;">
                        ${opOptions || '<option value="">Belum ada operator</option>'}
                    </select>
                </div>

                <form id="form-setting-gaji" style="background:var(--bg-primary); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                    <!-- SINKRONISASI FIELD OTOMATIS: HARIAN, MINGGUAN (6 Hari), BULANAN (25 Hari) -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
                        <div>
                            <label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Hari (Rp)</label>
                            <input type="number" id="gaji-daily" value="${currentSalary.dailyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                            <small style="font-size:0.6rem; color:var(--text-secondary);">1 Hari</small>
                        </div>
                        <div>
                            <label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Minggu (Rp)</label>
                            <input type="number" id="gaji-weekly" value="${currentSalary.weeklyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                            <small style="font-size:0.6rem; color:var(--text-secondary);">6 Hari Kerja</small>
                        </div>
                        <div>
                            <label style="font-size:0.7rem; color:var(--text-secondary); font-weight:bold;">Gaji Per Bulan (Rp)</label>
                            <input type="number" id="gaji-monthly" value="${currentSalary.monthlyRate || 0}" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;" required>
                            <small style="font-size:0.6rem; color:var(--text-secondary);">25 Hari Kerja</small>
                        </div>
                    </div>

                    <div style="margin-bottom:12px; background:var(--bg-card); padding:10px; border-radius:8px; border:1px dashed var(--accent-color);">
                        <label style="font-size:0.75rem; color:var(--text-primary); font-weight:bold;">🎁 Bonus dari Persentase Laba Bersih Per Transaksi (%)</label>
                        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                            <input type="number" step="0.1" id="bonus-percent" value="${currentSalary.bonusPercent || 0}" style="flex:1; padding:8px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.85rem;" required>
                            <span style="font-size:0.85rem; font-weight:bold; color:var(--text-primary);">%</span>
                        </div>
                        <small style="font-size:0.68rem; color:var(--text-secondary); display:block; margin-top:4px;">Operator mendapat % dari laba bersih setiap transaksi yang dilayani.</small>
                    </div>

                    <button type="submit" style="width:100%; padding:10px; background:#10b981; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:0.85rem; cursor:pointer;">
                        💾 Simpan Pengaturan Gaji & Bonus
                    </button>
                </form>
            </div>
        `;
    },

    // ==========================================
    // TAB 4: GENERATE SLIP GAJI
    // ==========================================
    renderTabSlip() {
        const opOptions = this.operators.map(op => `<option value="${op.id}" ${String(op.id) === String(this.selectedOperatorId) ? 'selected' : ''}>${op.name}</option>`).join('');
        const calcData = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);

        return `
            <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
                <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--text-primary);">📄 Kalkulator & Generator Slip Gaji Otomatis</h4>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                    <div>
                        <label style="font-size:0.72rem; color:var(--text-secondary); font-weight:bold;">Pilih Karyawan:</label>
                        <select id="slip-operator-id" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;">
                            ${opOptions || '<option value="">Belum ada operator</option>'}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.72rem; color:var(--text-secondary); font-weight:bold;">Periode Hitung:</label>
                        <select id="slip-period" style="width:100%; padding:8px; margin-top:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:0.8rem;">
                            <option value="daily" ${this.selectedPeriod==='daily'?'selected':''}>Harian (Daily)</option>
                            <option value="weekly" ${this.selectedPeriod==='weekly'?'selected':''}>Mingguan (Weekly)</option>
                            <option value="monthly" ${this.selectedPeriod==='monthly'?'selected':''}>Bulanan (Monthly)</option>
                        </select>
                    </div>
                </div>

                <div id="slip-preview-card" style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:12px;">
                    <h5 style="margin:0 0 8px 0; font-size:0.85rem; color:var(--accent-color); border-bottom:1px dashed var(--border-color); padding-bottom:6px;">
                        📌 Rincian Hasil Perhitungan Gaji Otomatis
                    </h5>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.75rem; margin-bottom:8px;">
                        <div>Nama Operator: <b style="color:var(--text-primary);">${calcData.opName}</b></div>
                        <div>No. HP / WA: <b style="color:var(--text-primary);">${calcData.opPhone}</b></div>
                        <div>Total Durasi Kerja: <b style="color:#22c55e;">${calcData.totalMinutes} Menit</b></div>
                        <div>Tarif Per Menit: <b style="color:var(--text-primary);">Rp ${calcData.ratePerMinute.toFixed(2)}/mnt</b></div>
                        <div>Total Omset Dilayani: <b>Rp ${calcData.totalOmset.toLocaleString('id-ID')}</b></div>
                        <div>Total Laba Dilayani: <b>Rp ${calcData.totalProfit.toLocaleString('id-ID')}</b></div>
                    </div>

                    <div style="border-top:1px dashed var(--border-color); padding-top:8px; font-size:0.8rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Gaji Pokok (${calcData.totalMinutes} mnt @ Rp ${calcData.ratePerMinute.toFixed(1)}):</span>
                            <b>Rp ${calcData.baseSalaryCalculated.toLocaleString('id-ID')}</b>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#22c55e;">
                            <span>Bonus Transaksi (${calcData.bonusPercent}% dari Laba Rp ${calcData.totalProfit.toLocaleString('id-ID')}):</span>
                            <b>+ Rp ${calcData.bonusCalculated.toLocaleString('id-ID')}</b>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.95rem; font-weight:bold; color:var(--text-primary); border-top:1px solid var(--border-color); padding-top:6px; margin-top:6px;">
                            <span>TOTAL GAJI DITERIMA:</span>
                            <span style="color:var(--accent-color);">Rp ${calcData.grandTotalSalary.toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:8px;">
                    <button id="btn-print-slip" class="btn-touch active" style="flex:1; padding:10px; font-size:0.8rem;">
                        🖨️ Cetak Slip Gaji
                    </button>
                    <button id="btn-send-wa-slip" class="btn-touch" style="flex:1; padding:10px; background:#25D366; color:#fff; font-size:0.8rem; font-weight:bold;">
                        📲 Kirim Slip via WA
                    </button>
                </div>
            </div>
        `;
    },

    calculateAutomatedSalary(operatorId, period) {
        const op = this.operators.find(o => String(o.id) === String(operatorId));
        const opName = op ? op.name : 'Unknown Operator';
        const opPhone = op ? (op.phone || op.noHp || op.wa || '-') : '-';

        const salSetting = this.salaries.find(s => String(s.operatorId) === String(operatorId)) || {
            dailyRate: 50000,
            weeklyRate: 300000,
            monthlyRate: 1250000,
            bonusPercent: 0
        };

        const absensiLogs = this.getProcessedAbsensiLogs().filter(a => String(a.operatorId) === String(operatorId));
        
        const now = new Date();
        let filteredLogs = [];

        if (period === 'daily') {
            filteredLogs = absensiLogs.filter(a => a.dateStr === now.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }));
        } else if (period === 'weekly') {
            const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            filteredLogs = absensiLogs.filter(a => new Date(a.dateStr) >= sevenDaysAgo);
        } else {
            filteredLogs = absensiLogs;
        }

        const totalMinutes = filteredLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

        let baseRate = salSetting.dailyRate;
        let standardMinutes = 480; 

        if (period === 'weekly') {
            baseRate = salSetting.weeklyRate;
            standardMinutes = 480 * 6; 
        } else if (period === 'monthly') {
            baseRate = salSetting.monthlyRate;
            standardMinutes = 480 * 25; 
        }

        const ratePerMinute = standardMinutes > 0 ? (baseRate / standardMinutes) : 0;
        const baseSalaryCalculated = Math.round(totalMinutes * ratePerMinute);

        const opTrxs = this.transactions.filter(t => {
            const tOpId = t.operator?.id || t.operatorId;
            const tOpName = t.operator?.name || t.operator;
            return String(tOpId) === String(operatorId) || tOpName === opName;
        });

        const totalOmset = opTrxs.reduce((sum, t) => sum + (Number(t.total ?? t.grandTotal ?? 0)), 0);
        const totalProfit = opTrxs.reduce((sum, t) => sum + (Number(t.grossProfit ?? t.computedLaba ?? 0)), 0);

        const bonusPercent = Number(salSetting.bonusPercent || 0);
        const bonusCalculated = Math.round((totalProfit * bonusPercent) / 100);

        const grandTotalSalary = baseSalaryCalculated + bonusCalculated;

        return {
            opName,
            opPhone,
            period,
            totalMinutes,
            ratePerMinute,
            baseSalaryCalculated,
            totalOmset,
            totalProfit,
            bonusPercent,
            bonusCalculated,
            grandTotalSalary
        };
    },

    // ==========================================
    // ACTION HANDLERS & AUTO SINKRONISASI LOGIC
    // ==========================================
    init() {
        window.KaryawanModule = this;

        // Listener Tab Switch
        document.querySelectorAll('.tab-karyawan-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.activeTab = e.currentTarget.getAttribute('data-tab');
                this.refreshView();
            });
        });

        // Form Add Shift
        document.getElementById('form-add-shift')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const operatorId = document.getElementById('shift-operator-id').value;
            const name = document.getElementById('shift-name').value.trim();
            const day = document.getElementById('shift-day').value;
            const startTime = document.getElementById('shift-start-time').value;
            const endTime = document.getElementById('shift-end-time').value;

            if (!operatorId) return alert('Pilih operator karyawan!');

            const newShift = {
                id: 'shift_' + Date.now(),
                operatorId,
                name,
                day,
                startTime,
                endTime
            };

            this.shifts.push(newShift);
            localStorage.setItem('edc_shifts', JSON.stringify(this.shifts));
            alert('Shift berhasil ditambahkan!');
            this.refreshView();
        });

        // OTOMATIS SINKRONISASI LOGIC (HARIAN, MINGGUAN, BULANAN)
        const inDaily = document.getElementById('gaji-daily');
        const inWeekly = document.getElementById('gaji-weekly');
        const inMonthly = document.getElementById('gaji-monthly');

        inDaily?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            if (inWeekly) inWeekly.value = Math.round(val * 6);    // 6 Hari Kerja
            if (inMonthly) inMonthly.value = Math.round(val * 25);  // 25 Hari Kerja
        });

        inWeekly?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            const daily = val / 6;
            if (inDaily) inDaily.value = Math.round(daily);
            if (inMonthly) inMonthly.value = Math.round(daily * 25);
        });

        inMonthly?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            const daily = val / 25;
            if (inDaily) inDaily.value = Math.round(daily);
            if (inWeekly) inWeekly.value = Math.round(daily * 6);
        });

        // Select Operator Gaji
        document.getElementById('select-operator-gaji')?.addEventListener('change', (e) => {
            this.selectedOperatorId = e.target.value;
            this.refreshView();
        });

        // Save Setting Gaji & Bonus
        document.getElementById('form-setting-gaji')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const dailyRate = Number(document.getElementById('gaji-daily').value || 0);
            const weeklyRate = Number(document.getElementById('gaji-weekly').value || 0);
            const monthlyRate = Number(document.getElementById('gaji-monthly').value || 0);
            const bonusPercent = Number(document.getElementById('bonus-percent').value || 0);

            const existingIdx = this.salaries.findIndex(s => String(s.operatorId) === String(this.selectedOperatorId));
            const salaryPayload = {
                operatorId: this.selectedOperatorId,
                dailyRate,
                weeklyRate,
                monthlyRate,
                bonusPercent
            };

            if (existingIdx >= 0) {
                this.salaries[existingIdx] = salaryPayload;
            } else {
                this.salaries.push(salaryPayload);
            }

            localStorage.setItem('edc_salaries', JSON.stringify(this.salaries));
            alert('Pengaturan Gaji & Bonus berhasil disimpan!');
            this.refreshView();
        });

        // Event Slip Gaji
        document.getElementById('slip-operator-id')?.addEventListener('change', (e) => {
            this.selectedOperatorId = e.target.value;
            this.refreshView();
        });

        document.getElementById('slip-period')?.addEventListener('change', (e) => {
            this.selectedPeriod = e.target.value;
            this.refreshView();
        });

        document.getElementById('btn-print-slip')?.addEventListener('click', () => {
            this.printSlipGaji();
        });

        document.getElementById('btn-send-wa-slip')?.addEventListener('click', () => {
            this.sendWASlipGaji();
        });
    },

    deleteShift(id) {
        if (!confirm('Hapus shift ini?')) return;
        this.shifts = this.shifts.filter(s => String(s.id) !== String(id));
        localStorage.setItem('edc_shifts', JSON.stringify(this.shifts));
        this.refreshView();
    },

    refreshAbsensi() {
        this.refreshView();
    },

    refreshView() {
        if (window.app && typeof window.app.loadModule === 'function') {
            window.app.loadModule('karyawan');
        }
    },

    printSlipGaji() {
        const data = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);
        const storeName = localStorage.getItem('edc_store_name') || 'POS EDC';

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Slip Gaji - ${data.opName}</title>
                <style>
                    body { font-family: monospace; padding: 20px; max-width: 300px; margin: auto; }
                    h3, p { text-align: center; margin: 2px 0; }
                    .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                    .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
                </style>
            </head>
            <body>
                <h3>${storeName.toUpperCase()}</h3>
                <p style="font-size:11px;">SLIP GAJI KARYAWAN</p>
                <div class="line"></div>
                <div class="row"><span>Nama:</span><b>${data.opName}</b></div>
                <div class="row"><span>Periode:</span><b>${data.period.toUpperCase()}</b></div>
                <div class="row"><span>Total Durasi:</span><b>${data.totalMinutes} Menit</b></div>
                <div class="row"><span>Tarif/Mnt:</span><b>Rp ${data.ratePerMinute.toFixed(1)}</b></div>
                <div class="line"></div>
                <div class="row"><span>Gaji Pokok:</span><span>Rp ${data.baseSalaryCalculated.toLocaleString('id-ID')}</span></div>
                <div class="row"><span>Bonus (${data.bonusPercent}%):</span><span>Rp ${data.bonusCalculated.toLocaleString('id-ID')}</span></div>
                <div class="line"></div>
                <div class="row" style="font-size:14px; font-weight:bold;"><span>TOTAL DITERIMA:</span><span>Rp ${data.grandTotalSalary.toLocaleString('id-ID')}</span></div>
                <div class="line"></div>
                <p style="font-size:10px; margin-top:15px;">Terima Kasih Atas Kerja Keras Anda!</p>
                <script>window.onload = function() { window.print(); window.close(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    sendWASlipGaji() {
        const data = this.calculateAutomatedSalary(this.selectedOperatorId, this.selectedPeriod);
        if (!data.opPhone || data.opPhone === '-') {
            return alert('Nomor HP/WA operator belum diisi! Silakan lengkapi di menu Setting -> Operator.');
        }

        const storeName = localStorage.getItem('edc_store_name') || 'POS EDC';
        let text = `*SLIP GAJI KARYAWAN - ${storeName.toUpperCase()}*\n\n`;
        text += `Nama: *${data.opName}*\n`;
        text += `Periode: *${data.period.toUpperCase()}*\n`;
        text += `Total Durasi Kerja: *${data.totalMinutes} Menit*\n`;
        text += `Tarif Per Menit: Rp ${data.ratePerMinute.toFixed(1)}/mnt\n`;
        text += `------------------------------------\n`;
        text += `Gaji Pokok: Rp ${data.baseSalaryCalculated.toLocaleString('id-ID')}\n`;
        text += `Bonus Transaksi (${data.bonusPercent}%): Rp ${data.bonusCalculated.toLocaleString('id-ID')}\n`;
        text += `------------------------------------\n`;
        text += `*TOTAL GAJI DITERIMA: Rp ${data.grandTotalSalary.toLocaleString('id-ID')}*\n\n`;
        text += `Terima kasih atas dedikasi dan kerja keras Anda! 🙏`;

        let cleanPhone = data.opPhone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    }
};

export default KaryawanModule;