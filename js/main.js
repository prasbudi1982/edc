import DB from './modules/db.js';
import Scanner from './modules/scanner.js';
import ThemeManager from './modules/theme.js';

class Router {
    constructor() {
        try { ThemeManager.init(); } catch(e) { console.warn('Theme init gagal:', e); }
        this.contentArea = document.getElementById('app-content');
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.modules = {};
        this.currentModule = null;
        
        this.deferredPrompt = null;
        this.initPwaInstallPrompt();
        
        if (!localStorage.getItem('edc_admin_account')) {
            localStorage.setItem('edc_admin_account', JSON.stringify({ username: 'admin', pin: '1234' }));
        }

        this.currentUser = JSON.parse(localStorage.getItem('edc_active_user') || 'null');
        this.startClock();
        this.cleanHeaderIcons();
        
        if (!this.currentUser) {
            this.hideSplashScreen();
            this.renderLoginModal();
        } else {
            this.initApp();
        }
    }

    initPwaInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.renderInstallBanner();
        });
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.remove();
        });
    }

    renderInstallBanner() {
        if (document.getElementById('pwa-install-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            background: #0f172a; color: #ffffff; padding: 14px 18px;
            border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            display: flex; align-items: center; gap: 12px;
            font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
            border: 1px solid #334155; animation: pwaSlideUp 0.3s ease-out;
        `;
        banner.innerHTML = `
            <style>@keyframes pwaSlideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>
            <div><strong style="display:block; font-size: 14px; margin-bottom: 2px;">Install POS EDC App</strong><span style="color: #94a3b8; font-size: 12px;">Pasang aplikasi di layar utama untuk akses cepat.</span></div>
            <div style="display: flex; gap: 6px; margin-left: 8px;">
                <button id="btn-pwa-install" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px;">Install</button>
                <button id="btn-pwa-dismiss" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">Nanti</button>
            </div>
        `;
        document.body.appendChild(banner);
        document.getElementById('btn-pwa-install')?.addEventListener('click', async () => {
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            this.deferredPrompt = null;
            banner.remove();
        });
        document.getElementById('btn-pwa-dismiss')?.addEventListener('click', () => banner.remove());
    }

    hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 500);
        }
    }

    cleanHeaderIcons() {
        const iconsToRemove = document.querySelectorAll('[data-lucide="wifi"], [data-lucide="battery"], [data-lucide="battery-charging"], .status-icon-wifi, .status-icon-battery');
        iconsToRemove.forEach(el => el.remove());
    }

    renderLoginModal() {
        // FIX OPERATOR SYNC: render LS dulu biar gak stuck splash, sync cloud di background
        const getLS = () => { try { return JSON.parse(localStorage.getItem('edc_operators') || '[]'); } catch(e){ return []; } };
        let operators = getLS();

        const existingModal = document.getElementById('login-modal-overlay');
        if (existingModal) existingModal.remove();

        // Background sync dari IndexedDB/Cloud tanpa blokir splash
        if ((localStorage.getItem('edc_db_mode')||'local')==='cloud' && typeof DB!=='undefined' && DB.getOperators) {
            DB.getOperators().then(cloudOps=>{
                if (cloudOps && cloudOps.length>0 && cloudOps.length!==operators.length) {
                    try { localStorage.setItem('edc_operators', JSON.stringify(cloudOps)); } catch(e){}
                    // re-render hanya jika modal masih ada dan data beda
                    const stillOpen = document.getElementById('login-modal-overlay');
                    if (stillOpen) {
                        // update select options tanpa recreate modal penuh
                        const sel = document.getElementById('login-operator-id') || document.getElementById('select-operator');
                        if (sel) {
                            sel.innerHTML = cloudOps.map(op=>`<option value="${op.id}">${op.name}</option>`).join('') || '<option value="">-- Belum ada operator --</option>';
                        }
                    }
                }
            }).catch(e=>console.warn('Sync operator cloud gagal', e));
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'login-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; font-family: system-ui, -apple-system, sans-serif;
        `;
        const operatorOptions = operators.length > 0 
            ? operators.map(op => `<option value="${op.id}">${op.name}</option>`).join('')
            : '<option value="">-- Belum ada operator terdaftar --</option>';

        modalOverlay.innerHTML = `
            <div id="login-modal-card" style="background: var(--bg-card, #242f42); width: 100%; max-width: 380px; padding: 28px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); border: 1px solid var(--border-color, #2e3a4e);">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="width: 48px; height: 48px; background: var(--accent-color, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2"/></svg>
                    </div>
                    <h2 style="margin: 0 0 6px 0; color: var(--text-primary, #ffffff); font-size: 20px; font-weight: 700;">Masuk Sesi POS EDC</h2>
                    <p style="margin: 0; color: var(--text-secondary, #8e9baf); font-size: 13px;">Pilih peran akun dan masukkan PIN autentikasi</p>
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 20px; background: var(--bg-primary, #121824); padding: 4px; border-radius: 10px; border: 1px solid var(--border-color, #2e3a4e);">
                    <button type="button" id="tab-role-admin" style="flex: 1; padding: 9px; border: none; border-radius: 7px; font-weight: 600; font-size: 13px; cursor: pointer; background: var(--bg-card, #242f42); color: var(--text-primary, #ffffff); box-shadow: 0 1px 3px rgba(0,0,0,0.2);">Admin</button>
                    <button type="button" id="tab-role-kasir" style="flex: 1; padding: 9px; border: none; border-radius: 7px; font-weight: 600; font-size: 13px; cursor: pointer; background: transparent; color: var(--text-secondary, #8e9baf);">Kasir / Operator</button>
                </div>
                <form id="form-login-auth">
                    <div id="field-operator-select" style="display: none; margin-bottom: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #8e9baf); margin-bottom: 6px;">Pilih Akun Operator</label>
                        <select id="login-operator-id" style="width: 100%; padding: 11px 12px; border: 1px solid var(--border-color, #2e3a4e); border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; background: var(--bg-primary, #121824); color: var(--text-primary, #fff);">
                            ${operatorOptions}
                        </select>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label id="label-pin" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #8e9baf); margin-bottom: 6px;">PIN Administrator</label>
                        <input type="password" id="login-pin" placeholder="Masukkan PIN" required style="width: 100%; padding: 11px 12px; border: 1px solid var(--border-color, #2e3a4e); border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; background: var(--bg-primary, #121824); color: var(--text-primary, #fff);">
                    </div>
                    <button type="submit" style="width: 100%; padding: 11px; background: var(--accent-color, #2563eb); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;">Masuk Sistem</button>
                </form>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        let activeRoleMode = 'admin';
        const tabAdmin = document.getElementById('tab-role-admin');
        const tabKasir = document.getElementById('tab-role-kasir');
        const opSelectGroup = document.getElementById('field-operator-select');
        const labelPin = document.getElementById('label-pin');

        tabAdmin.addEventListener('click', () => {
            activeRoleMode = 'admin';
            tabAdmin.style.background = 'var(--bg-card, #242f42)'; tabAdmin.style.color = 'var(--text-primary, #ffffff)'; tabAdmin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
            tabKasir.style.background = 'transparent'; tabKasir.style.color = 'var(--text-secondary, #8e9baf)'; tabKasir.style.boxShadow = 'none';
            opSelectGroup.style.display = 'none'; labelPin.textContent = 'PIN Administrator';
        });
        tabKasir.addEventListener('click', () => {
            activeRoleMode = 'kasir';
            tabKasir.style.background = 'var(--bg-card, #242f42)'; tabKasir.style.color = 'var(--text-primary, #ffffff)'; tabKasir.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
            tabAdmin.style.background = 'transparent'; tabAdmin.style.color = 'var(--text-secondary, #8e9baf)'; tabAdmin.style.boxShadow = 'none';
            opSelectGroup.style.display = 'block'; labelPin.textContent = 'PIN Operator';
        });

        document.getElementById('form-login-auth').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pinVal = document.getElementById('login-pin').value;

            if (activeRoleMode === 'admin') {
                const adminAcc = JSON.parse(localStorage.getItem('edc_admin_account') || '{"username":"admin","pin":"1234"}');
                if (pinVal === adminAcc.pin) {
                    const loginTime = new Date().toISOString();
                    const attId = 'att_' + Date.now();
                    // FIX: Admin juga dicatat jika ingin terlihat di modul karyawan (opsional). Kalau tidak mau, hapus blok attendance admin ini.
                    const adminAtt = {
                        id: attId,
                        operatorId: 'admin_root',
                        operatorName: 'Admin Utama',
                        loginTime: loginTime,
                        logoutTime: null,
                        isPaid: false,
                        role: 'admin'
                    };
                    const attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
                    attendances.push(adminAtt);
                    localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                    try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(adminAtt); } catch(err) {}

                    this.currentUser = { id: 'admin_root', name: 'Admin Utama', role: 'admin', loginTime: loginTime, sessionKey: attId };
                    localStorage.setItem('edc_active_user', JSON.stringify(this.currentUser));
                    localStorage.setItem('edc_active_operator', JSON.stringify({ ...this.currentUser, loginTime, sessionKey: attId }));
                    modalOverlay.remove();
                    this.initApp();
                } else {
                    alert('PIN Administrator salah! Default PIN: 1234');
                }
            } else {
                const selectedOpId = document.getElementById('login-operator-id').value;
                const foundOp = operators.find(op => String(op.id) === String(selectedOpId));
                if (foundOp && String(foundOp.pin) === String(pinVal)) {
                    if (this.currentUser && String(this.currentUser.id) === String(foundOp.id)) {
                        alert(`Operator ${foundOp.name} sudah login di sesi ini.`); return;
                    }
                    const loginTime = new Date().toISOString();
                    const attId = 'att_' + Date.now();

                    this.currentUser = { ...foundOp, role: 'operator', id: foundOp.id, name: foundOp.name, pin: foundOp.pin, loginTime: loginTime, sessionKey: attId };
                    localStorage.setItem('edc_active_user', JSON.stringify(this.currentUser));
                    localStorage.setItem('edc_active_operator', JSON.stringify({ ...this.currentUser, loginTime: loginTime, sessionKey: attId }));

                    const newAttRecord = {
                        id: attId,
                        sessionKey: attId,
                        operatorId: foundOp.id,
                        operatorName: foundOp.name,
                        loginTime: loginTime,
                        logoutTime: null,
                        isPaid: false,
                        role: 'operator'
                    };
                    const attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
                    attendances.push(newAttRecord);
                    localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                    try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(newAttRecord); } catch(err) {}

                    modalOverlay.remove();
                    this.initApp();
                } else {
                    alert('PIN Operator tidak sesuai!');
                }
            }
        });
    }

    renderAbsenModal() {
        const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
        const existingModal = document.getElementById('absen-modal-overlay');
        if (existingModal) existingModal.remove();
        if (operators.length === 0) { alert('Belum ada operator terdaftar di database.'); return; }

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'absen-modal-overlay';
        modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9999; font-family: system-ui, -apple-system, sans-serif;`;
        const activeOpId = this.currentUser ? String(this.currentUser.id) : String(operators[0].id);
        const operatorOptions = operators.map(op => {
            const isSelected = String(op.id) === activeOpId ? 'selected' : '';
            return `<option value="${op.id}" ${isSelected}>${op.name}</option>`;
        }).join('');

        modalOverlay.innerHTML = `
            <div style="background: var(--bg-card, #242f42); width: 100%; max-width: 380px; padding: 24px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); border: 1px solid var(--border-color, #2e3a4e);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #ffffff); font-size: 18px; font-weight: 700; display:flex; align-items:center; gap:8px;"><i data-lucide="clock" style="width: 20px; height: 20px; color: #10b981;"></i> Absen & Switch Operator</h3>
                    <button id="btn-close-absen-modal" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; padding: 8px;">✕</button>
                </div>
                <form id="form-absen-operator">
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #8e9baf); margin-bottom: 6px;">Pilih Nama Karyawan</label>
                        <select id="absen-operator-id" style="width: 100%; padding: 11px 12px; border: 1px solid var(--border-color, #2e3a4e); border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; background: var(--bg-primary, #121824); color: var(--text-primary, #fff);">${operatorOptions}</select>
                    </div>
                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #8e9baf); margin-bottom: 6px;">PIN Autentikasi</label>
                        <input type="password" id="absen-pin" placeholder="Masukkan PIN" required style="width: 100%; padding: 11px 12px; border: 1px solid var(--border-color, #2e3a4e); border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; background: var(--bg-primary, #121824); color: var(--text-primary, #fff);">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #8e9baf); margin-bottom: 6px;">Aksi</label>
                        <select id="absen-action-type" style="width: 100%; padding: 11px 12px; border: 1px solid var(--border-color, #2e3a4e); border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; background: var(--bg-primary, #121824); color: var(--text-primary, #fff);"></select>
                    </div>
                    <button type="submit" style="width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;">Proses Aksi</button>
                </form>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        if (window.lucide) lucide.createIcons();

        const updateActionOptions = () => {
            const selectOpEl = document.getElementById('absen-operator-id');
            const actionSelectEl = document.getElementById('absen-action-type');
            if (!selectOpEl || !actionSelectEl) return;
            const selectedId = selectOpEl.value;
            const attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
            const activeAtt = attendances.find(a => String(a.operatorId) === String(selectedId) && !a.logoutTime);
            const isCurrentlyActiveUser = this.currentUser && String(this.currentUser.id) === String(selectedId);
            const activeSessions = attendances.filter(a => !a.logoutTime);

            if (!activeAtt) {
                actionSelectEl.innerHTML = `<option value="in">Absen Masuk (Masuk Shift)</option>`;
            } else {
                if (isCurrentlyActiveUser) {
                    if (activeSessions.length > 1) {
                        actionSelectEl.innerHTML = `<option value="" disabled selected>Kasir aktif tidak dapat keluar (Sesi lain aktif)</option>`;
                    } else {
                        actionSelectEl.innerHTML = `<option value="out">Absen Keluar Shift</option>`;
                    }
                } else {
                    actionSelectEl.innerHTML = `<option value="switch">Switch Kasir Aktif</option><option value="out">Absen Keluar Shift</option>`;
                }
            }
        };
        updateActionOptions();
        document.getElementById('absen-operator-id')?.addEventListener('change', updateActionOptions);
        document.getElementById('btn-close-absen-modal')?.addEventListener('click', () => modalOverlay.remove());

        document.getElementById('form-absen-operator')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedId = document.getElementById('absen-operator-id').value;
            const pinVal = document.getElementById('absen-pin').value;
            const actionType = document.getElementById('absen-action-type').value;
            if (!actionType) { alert('Aksi tidak diperbolehkan!'); return; }
            const targetOp = operators.find(op => String(op.id) === String(selectedId));
            if (!targetOp || String(targetOp.pin) !== String(pinVal)) { alert('PIN Operator tidak valid!'); return; }

            let attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');

            if (actionType === 'in') {
                const now = new Date().toISOString();
                const newRecord = { id: 'att_' + Date.now(), sessionKey: 'att_' + Date.now(), operatorId: targetOp.id, operatorName: targetOp.name, loginTime: now, logoutTime: null, isPaid: false, role: 'operator' };
                newRecord.id = newRecord.sessionKey; // samakan
                attendances.push(newRecord);
                localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(newRecord); } catch(err) {}
                modalOverlay.remove();
                alert(`Absen MASUK berhasil untuk operator ${targetOp.name}.`);

            } else if (actionType === 'out') {
                const activeSessions = attendances.filter(a => !a.logoutTime);
                const isCurrentlyActiveUser = this.currentUser && String(this.currentUser.id) === String(targetOp.id);
                if (isCurrentlyActiveUser && activeSessions.length > 1) {
                    alert('Akses Ditolak! Kasir aktif tidak boleh keluar jika masih ada sesi aktif operator lain.'); return;
                }
                const lastAtt = [...attendances].reverse().find(a => String(a.operatorId) === String(targetOp.id) && !a.logoutTime);
                if (lastAtt) {
                    lastAtt.logoutTime = new Date().toISOString();
                } else {
                    const now = new Date().toISOString();
                    const newClosed = { id: 'att_' + Date.now(), operatorId: targetOp.id, operatorName: targetOp.name, loginTime: now, logoutTime: now, isPaid: false, role: 'operator' };
                    attendances.push(newClosed);
                }
                localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                try {
                    if (DB && typeof DB.saveAttendance === 'function') {
                        const toSave = attendances.filter(a => String(a.operatorId) === String(targetOp.id)).slice(-1)[0];
                        if (toSave) await DB.saveAttendance(toSave);
                    }
                } catch(err) {}

                const remainingActive = attendances.filter(a => !a.logoutTime);
                if (remainingActive.length === 0) {
                    // FIX: JANGAN HAPUS edc_attendances, hanya hapus session aktif
                    localStorage.removeItem('edc_active_user');
                    localStorage.removeItem('edc_active_operator');
                    this.currentUser = null;
                    modalOverlay.remove();
                    alert(`Kasir ${targetOp.name} telah absen keluar. Sesi aplikasi selesai.`);
                    location.reload();
                    return;
                }
                modalOverlay.remove();
                alert(`Absen KELUAR berhasil dicatat untuk ${targetOp.name}.`);

            } else if (actionType === 'switch') {
                let activeAtt = attendances.find(a => String(a.operatorId) === String(targetOp.id) && !a.logoutTime);
                if (!activeAtt) {
                    const now = new Date().toISOString();
                    const newSwRec = { id: 'att_' + Date.now(), sessionKey: 'att_' + Date.now(), operatorId: targetOp.id, operatorName: targetOp.name, loginTime: now, logoutTime: null, isPaid: false, role: 'operator' };
                    newSwRec.id = newSwRec.sessionKey;
                    attendances.push(newSwRec);
                    localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                    try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(newSwRec); } catch(err) {}
                    activeAtt = newSwRec;
                }
                const newActiveUser = { ...targetOp, role: 'operator', id: targetOp.id, name: targetOp.name, pin: targetOp.pin, loginTime: activeAtt.loginTime, sessionKey: activeAtt.id };
                this.currentUser = newActiveUser;
                localStorage.setItem('edc_active_user', JSON.stringify(newActiveUser));
                localStorage.setItem('edc_active_operator', JSON.stringify({ ...newActiveUser, loginTime: activeAtt.loginTime, sessionKey: activeAtt.id }));
                modalOverlay.remove();
                await this.updateHeaderStore();
                if (this.currentModule) await this.loadModule(this.currentModule, true);
                alert(`Berhasil ganti kasir aktif menjadi ${targetOp.name}`);
            }
        });
    }

    initApp() {
        // SAFETY: paksa hide splash maksimal 2s
        setTimeout(()=> this.hideSplashScreen(), 2000);
        this.applyPermissionUI();
        this.initNav();
        this.updateHeaderStore();
        let initialModule = this.checkCloudConfig() ? 'transaksi' : 'setting';
        const r = this.currentUser?.role;
        if (r === 'kasir' || r === 'operator') initialModule = 'transaksi';
        this.setActiveNav(initialModule);
        this.loadModule(initialModule);
        setTimeout(() => this.hideSplashScreen(), 1200);
        setTimeout(() => this.initSyncEngine(), 1000);
    }

    async executeLogout() {
        // FIX: catat logoutTime sebelum hapus session
        try {
            const attendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
            const activeUser = this.currentUser || JSON.parse(localStorage.getItem('edc_active_user') || 'null');
            if (activeUser) {
                const lastOpen = [...attendances].reverse().find(a => String(a.operatorId) === String(activeUser.id) && !a.logoutTime);
                if (lastOpen) {
                    lastOpen.logoutTime = new Date().toISOString();
                    localStorage.setItem('edc_attendances', JSON.stringify(attendances));
                    try { if (DB && typeof DB.saveAttendance === 'function') await DB.saveAttendance(lastOpen); } catch(e) {}
                }
            }
        } catch(e) { console.warn('Gagal catat logout:', e); }

        if (Scanner && typeof Scanner.stopCamera === 'function') await Scanner.stopCamera();
        localStorage.removeItem('edc_active_user');
        localStorage.removeItem('edc_active_operator');
        this.currentUser = null;
        location.reload();
    }

    async logout() {
        if (this.currentUser && this.currentUser.role !== 'admin') {
            alert('Akses Ditolak! Kasir aktif tidak diperbolehkan keluar (logout) dari aplikasi.');
            return;
        }
        if (confirm(`Keluar dari akun (${this.currentUser?.name || 'User'})?`)) await this.executeLogout();
    }

    async updateHeaderStore() {
        const el = document.getElementById('header-store-name');
        if (!el) return;
        let storeName = 'POS EDC';
        try { if (typeof DB.getStoreInfo === 'function') { const info = await DB.getStoreInfo(); if (info && info.name) storeName = info.name; } } catch (err) {}
        if (storeName === 'POS EDC') storeName = localStorage.getItem('edc_store_name') || 'POS EDC';
        const isAdmin = this.currentUser?.role === 'admin';
        const roleLabel = isAdmin ? '(admin)' : `(${this.currentUser?.name || 'operator'})`;
        el.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 14px;';
        el.innerHTML = `
            <span style="font-weight: 700; color: #ffffff; font-size: 15px; letter-spacing: -0.01em;">${storeName}</span>
            <span style="color: #94a3b8; font-weight: 500; font-size: 13px; margin-right: 4px;">${roleLabel}</span>
            ${isAdmin ? `<button id="btn-logout" type="button" title="Keluar / Ganti Akun" style="background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="log-out" style="width: 14px; height: 14px;"></i> Out</button>` : ''}
        `;
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.addEventListener('click', (e) => { e.preventDefault(); this.logout(); });
        if (window.lucide) lucide.createIcons();
    }

    applyPermissionUI() {
        // Refresh navButtons to include dynamically added absen tab
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.navButtons.forEach(btn => {
            const mod = btn.getAttribute('data-module');
            const role = this.currentUser?.role;
            const isOperator = role === 'operator' || role === 'kasir';
            const isAdmin = role === 'admin';
            if (isAdmin) {
                // Admin tidak melihat tab absen
                btn.style.display = mod === 'absen' ? 'none' : 'flex';
            } else if (isOperator) {
                // Operator hanya melihat Transaksi + Absen
                btn.style.display = (mod === 'transaksi' || mod === 'absen') ? 'flex' : 'none';
            } else {
                btn.style.display = mod === 'transaksi' ? 'flex' : 'none';
            }
        });
    }

    checkCloudConfig() {
        const mode = localStorage.getItem('edc_db_mode') || 'local';
        if (mode === 'cloud') {
            const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');
            if (!config.apiKey || !config.projectId) return false;
        }
        return true;
    }

    initNav() {
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const moduleName = btn.getAttribute('data-module');
                
                // === TAB ABSEN KHUSUS ===
                if (moduleName === 'absen') {
                    const roleCheck = this.currentUser?.role;
                    const isOp = roleCheck === 'operator' || roleCheck === 'kasir';
                    if (!isOp) {
                        alert('Akses Ditolak! Hanya Operator yang boleh absen.');
                        return;
                    }
                    // Jangan pindah module, hanya buka modal absen
                    this.renderAbsenModal();
                    return;
                }

                const roleCheck = this.currentUser?.role;
                const isOp = roleCheck === 'operator' || roleCheck === 'kasir';
                if (isOp) {
                    if (!['transaksi','absen'].includes(moduleName)) { alert(`Akses Ditolak! Operator "${this.currentUser.name}" hanya boleh akses Transaksi & Absen.`); return; }
                }
                if (moduleName !== 'setting' && !this.checkCloudConfig()) {
                    alert('Konfigurasi Firebase belum lengkap. Anda dialihkan ke Pengaturan.');
                    this.setActiveNav('setting'); this.loadModule('setting'); return;
                }
                this.setActiveNav(moduleName); this.loadModule(moduleName);
            });
        });
    }

    setActiveNav(name) {
        this.navButtons.forEach(b => {
            if (b.getAttribute('data-module') === name) b.classList.add('active'); else b.classList.remove('active');
        });
    }

    async loadModule(name, forceReload = false) {
        const isSameModuleReload = this.currentModule === name;
        if (!isSameModuleReload || forceReload) {
            if (Scanner && typeof Scanner.stopCamera === 'function') {
                try { if (Scanner.mode === 'camera') await Scanner.stopCamera(); else if (typeof Scanner.releaseProcessing === 'function') Scanner.releaseProcessing(); } catch (err) {}
            }
        } else {
            if (Scanner && typeof Scanner.releaseProcessing === 'function') Scanner.releaseProcessing();
        }
        let savedVideo = null, savedStream = null;
        if (Scanner && Scanner.nativeVideo && Scanner.isScanning && Scanner.nativeStream) { savedVideo = Scanner.nativeVideo; savedStream = Scanner.nativeStream; }
        const userRole = this.currentUser?.role;
        const isOperatorRole = userRole === 'operator' || userRole === 'kasir';
        if (isOperatorRole) { if (!['transaksi'].includes(name)) { name = 'transaksi'; this.setActiveNav('transaksi'); } }
        this.contentArea.innerHTML = `<div class="loader">Memuat modul ${name}...</div>`;
        if (savedVideo && savedStream) { Scanner.nativeVideo = savedVideo; Scanner.nativeStream = savedStream; }
        const loadTimeout = setTimeout(() => { if (this.contentArea.querySelector('.loader')) this.renderErrorFallback(name, new Error('Waktu pemuatan modul habis (Timeout).')); }, 4000);
        try {
            if (!this.modules[name]) { const module = await import(`./modules/${name}.js`); this.modules[name] = module.default; }
            this.currentModule = name;
            const renderedHtml = await this.modules[name].render();
            clearTimeout(loadTimeout);
            this.contentArea.innerHTML = renderedHtml;
            if (typeof this.modules[name].init === 'function') await this.modules[name].init();
            if (window.lucide) lucide.createIcons();
            this.updateDBIndicator();
        } catch (error) {
            clearTimeout(loadTimeout);
            this.renderErrorFallback(name, error);
        }
    }

    renderErrorFallback(name, error) {
        this.contentArea.innerHTML = `<div style="text-align:center; padding: 30px; background: #fff; border-radius: 8px; margin: 20px;"><h3 style="color:var(--danger-color, #ef4444);">Gagal Memuat Modul "${name}"</h3><p style="font-size: 13px; color: #666; background: #f8fafc; padding: 10px; border-radius: 6px; font-family: monospace;">${error.message || error}</p><div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;"><button id="btn-fallback-retry" style="padding: 8px 16px; cursor: pointer;">Coba Lagi</button>${this.currentUser?.role === 'admin' ? '<button id="btn-fallback-setting" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Buka Pengaturan</button>' : ''}</div></div>`;
        document.getElementById('btn-fallback-retry')?.addEventListener('click', () => this.loadModule(name));
        document.getElementById('btn-fallback-setting')?.addEventListener('click', () => { this.setActiveNav('setting'); this.loadModule('setting'); });
        if (window.lucide) lucide.createIcons();
    }

    startClock() {
        const clockEl = document.getElementById('system-clock');
        if (!clockEl) return;
        const updateClock = () => { clockEl.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };
        updateClock(); setInterval(updateClock, 10000);
    }

    updateDBIndicator() {
        const indicator = document.getElementById('db-indicator');
        if (indicator) { const mode = localStorage.getItem('edc_db_mode') || 'local'; indicator.textContent = `[${mode.toUpperCase()}]`; indicator.style.color = mode === 'cloud' ? '#3b82f6' : 'var(--success-color, #10b981)'; }
    }

    initSyncEngine() {
        try {
            DB.syncPendingData();
            DB.listenCloudChanges((updatedStore) => {
                const activeBtn = document.querySelector('.nav-btn.active');
                const activeModule = activeBtn ? activeBtn.getAttribute('data-module') : null;
                if (activeModule === updatedStore) this.loadModule(activeModule);
            });
            window.addEventListener('online', () => DB.syncPendingData());
        } catch (err) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try { ThemeManager.init(); } catch(e){}
    window.app = new Router();
});
