import DB from './modules/db.js';
import Scanner from './modules/scanner.js';

class Router {
    constructor() {
        this.contentArea = document.getElementById('app-content');
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.modules = {};
        this.currentModule = null;
        
        // PWA Install Prompt State
        this.deferredPrompt = null;
        this.initPwaInstallPrompt();
        
        // Inisialisasi Akun Admin Default
        if (!localStorage.getItem('edc_admin_account')) {
            localStorage.setItem('edc_admin_account', JSON.stringify({ username: 'admin', pin: '1234' }));
        }

        // Ambil sesi user aktif
        this.currentUser = JSON.parse(localStorage.getItem('edc_active_user') || 'null');

        this.startClock();
        this.cleanHeaderIcons();
        
        // Verifikasi Sesi Login
        if (!this.currentUser) {
            this.hideSplashScreen();
            this.renderLoginModal();
        } else {
            this.initApp();
        }
    }

    /* =========================================================
     * PWA INSTALLATION PROMPT HANDLING
     * ========================================================= */
    initPwaInstallPrompt() {
        // Tangkap event sebelum browser menampilkan prompt default
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.renderInstallBanner();
        });

        // Event saat aplikasi berhasil diinstall
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.remove();
            console.log('Aplikasi berhasil diinstall sebagai PWA.');
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
            <style>
                @keyframes pwaSlideUp {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
            <div>
                <strong style="display:block; font-size: 14px; margin-bottom: 2px;">Install POS EDC App</strong>
                <span style="color: #94a3b8; font-size: 12px;">Pasang aplikasi di layar utama untuk akses cepat.</span>
            </div>
            <div style="display: flex; gap: 6px; margin-left: 8px;">
                <button id="btn-pwa-install" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px;">
                    Install
                </button>
                <button id="btn-pwa-dismiss" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    Nanti
                </button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('btn-pwa-install')?.addEventListener('click', async () => {
            if (!this.deferredPrompt) return;
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`Pilihan user untuk install PWA: ${outcome}`);
            this.deferredPrompt = null;
            banner.remove();
        });

        document.getElementById('btn-pwa-dismiss')?.addEventListener('click', () => {
            banner.remove();
        });
    }

    hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.remove();
            }, 500);
        }
    }

    cleanHeaderIcons() {
        const iconsToRemove = document.querySelectorAll('[data-lucide="wifi"], [data-lucide="battery"], [data-lucide="battery-charging"], .status-icon-wifi, .status-icon-battery');
        iconsToRemove.forEach(el => el.remove());
    }

    renderLoginModal() {
        const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
        
        const existingModal = document.getElementById('login-modal-overlay');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'login-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; font-family: system-ui, -apple-system, sans-serif;
        `;

        const operatorOptions = operators.length > 0 
            ? operators.map(op => `<option value="${op.id}">${op.name}</option>`).join('')
            : '<option value="">-- Belum ada operator terdaftar --</option>';

        modalOverlay.innerHTML = `
            <div style="background: #ffffff; width: 100%; max-width: 380px; padding: 28px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="margin: 0 0 6px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Masuk Sesi POS EDC</h2>
                    <p style="margin: 0; color: #64748b; font-size: 13px;">Pilih peran akun dan masukkan PIN autentikasi</p>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 20px; background: #f1f5f9; padding: 4px; border-radius: 8px;">
                    <button type="button" id="tab-role-admin" style="flex: 1; padding: 8px; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; background: #ffffff; color: #1e293b; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">Admin</button>
                    <button type="button" id="tab-role-kasir" style="flex: 1; padding: 8px; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; background: transparent; color: #64748b;">Kasir / Operator</button>
                </div>

                <form id="form-login-auth">
                    <div id="field-operator-select" style="display: none; margin-bottom: 16px;">
                        <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px;">Pilih Akun Operator</label>
                        <select id="login-operator-id" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; background: #fff;">
                            ${operatorOptions}
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label id="label-pin" style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px;">PIN Administrator</label>
                        <input type="password" id="login-pin" placeholder="Masukkan PIN" required style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box;">
                    </div>

                    <button type="submit" style="width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.2s;">
                        Masuk Sistem
                    </button>
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
            tabAdmin.style.background = '#ffffff';
            tabAdmin.style.color = '#1e293b';
            tabAdmin.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            tabKasir.style.background = 'transparent';
            tabKasir.style.color = '#64748b';
            tabKasir.style.boxShadow = 'none';
            opSelectGroup.style.display = 'none';
            labelPin.textContent = 'PIN Administrator';
        });

        tabKasir.addEventListener('click', () => {
            activeRoleMode = 'kasir';
            tabKasir.style.background = '#ffffff';
            tabKasir.style.color = '#1e293b';
            tabKasir.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            tabAdmin.style.background = 'transparent';
            tabAdmin.style.color = '#64748b';
            tabAdmin.style.boxShadow = 'none';
            opSelectGroup.style.display = 'block';
            labelPin.textContent = 'PIN Operator';
        });

        document.getElementById('form-login-auth').addEventListener('submit', (e) => {
            e.preventDefault();
            const pinVal = document.getElementById('login-pin').value;

            if (activeRoleMode === 'admin') {
                const adminAcc = JSON.parse(localStorage.getItem('edc_admin_account') || '{"username":"admin","pin":"1234"}');
                if (pinVal === adminAcc.pin) {
                    this.currentUser = { id: 'admin_root', name: 'Admin Utama', role: 'admin' };
                    localStorage.setItem('edc_active_user', JSON.stringify(this.currentUser));
                    modalOverlay.remove();
                    this.initApp();
                } else {
                    alert('PIN Administrator salah! Default PIN: 1234');
                }
            } else {
                const selectedOpId = document.getElementById('login-operator-id').value;
                const foundOp = operators.find(op => op.id === selectedOpId || op.pin === pinVal);
                
                if (foundOp && foundOp.pin === pinVal) {
                    // FIX: role belum di set - set role operator secara eksplisit
                    this.currentUser = { ...foundOp, role: 'operator', id: foundOp.id, name: foundOp.name, pin: foundOp.pin };
                    localStorage.setItem('edc_active_user', JSON.stringify(this.currentUser));
                    modalOverlay.remove();
                    this.initApp();
                } else {
                    alert('PIN Operator tidak sesuai!');
                }
            }
        });
    }

    initApp() {
        this.applyPermissionUI();
        this.initNav();
        this.updateHeaderStore();
        
        let initialModule = this.checkCloudConfig() ? 'transaksi' : 'setting';
        const r = this.currentUser?.role;
        if (r === 'kasir' || r === 'operator') {
            initialModule = 'transaksi';
        }

        this.setActiveNav(initialModule);
        this.loadModule(initialModule);

        // Menghilangkan splash screen secara halus setelah inisialisasi selesai
        setTimeout(() => {
            this.hideSplashScreen();
        }, 1200);

        setTimeout(() => this.initSyncEngine(), 1000);
    }

    async logout() {
        if (confirm(`Keluar dari akun (${this.currentUser?.name || 'User'})?`)) {
            // Matikan kamera saat logout jika aktif
            if (Scanner && typeof Scanner.stopCamera === 'function') {
                await Scanner.stopCamera();
            }
            localStorage.removeItem('edc_active_user');
            this.currentUser = null;
            location.reload();
        }
    }

    async updateHeaderStore() {
        const el = document.getElementById('header-store-name');
        if (!el) return;

        let storeName = 'POS EDC';

        try {
            if (typeof DB.getStoreInfo === 'function') {
                const info = await DB.getStoreInfo();
                if (info && info.name) {
                    storeName = info.name;
                }
            }
        } catch (err) {
            console.warn('Gagal membaca toko dari DB, mencoba localStorage:', err);
        }

        if (storeName === 'POS EDC') {
            storeName = localStorage.getItem('edc_store_name') || 'POS EDC';
        }

        const roleLabel = this.currentUser?.role === 'admin' ? '(admin)' : '(operator)';

        el.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 14px;';
        el.innerHTML = `
            <span style="font-weight: 700; color: #ffffff; font-size: 15px; letter-spacing: -0.01em;">${storeName}</span>
            <span style="color: #94a3b8; font-weight: 500; font-size: 13px; margin-right: 6px;">${roleLabel}</span>
            <button id="btn-logout" title="Keluar / Ganti Akun" style="background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                <i data-lucide="log-out" style="width: 14px; height: 14px;"></i> Out
            </button>
        `;

        document.getElementById('btn-logout')?.addEventListener('click', () => {
            this.logout();
        });

        if (window.lucide) lucide.createIcons();
    }

    applyPermissionUI() {
        this.navButtons.forEach(btn => {
            const mod = btn.getAttribute('data-module');
            const role = this.currentUser?.role;
            const isOperator = role === 'operator' || role === 'kasir';
            const isAdmin = role === 'admin';
            if (isAdmin) {
                // admin full kontrol semua menu
                btn.style.display = 'flex';
            } else if (isOperator) {
                // RALAT: operator hanya transaksi
                if (mod === 'transaksi') {
                    btn.style.display = 'flex';
                } else {
                    btn.style.display = 'none';
                }
            } else {
                // fallback keamanan: hanya transaksi
                if (mod === 'transaksi') {
                    btn.style.display = 'flex';
                } else {
                    btn.style.display = 'none';
                }
            }
        });
    }

    checkCloudConfig() {
        const mode = localStorage.getItem('edc_db_mode') || 'local';
        if (mode === 'cloud') {
            const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');
            if (!config.apiKey || !config.projectId) {
                console.warn('Mode Cloud aktif tetapi konfigurasi Firebase belum diisi.');
                return false;
            }
        }
        return true;
    }

    initNav() {
        this.navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const moduleName = btn.getAttribute('data-module');

                const roleCheck = this.currentUser?.role;
                const isOp = roleCheck === 'operator' || roleCheck === 'kasir';
                if (isOp) {
                    const allowedModules = ['transaksi'];
                    if (!allowedModules.includes(moduleName)) {
                        alert(`Akses Ditolak! Operator "${this.currentUser.name}" hanya boleh akses Transaksi. Tidak bisa akses ${moduleName.toUpperCase()}.`);
                        return;
                    }
                }
                
                if (moduleName !== 'setting' && !this.checkCloudConfig()) {
                    alert('Konfigurasi Firebase belum lengkap. Anda dialihkan ke Pengaturan.');
                    this.setActiveNav('setting');
                    this.loadModule('setting');
                    return;
                }

                this.setActiveNav(moduleName);
                this.loadModule(moduleName);
            });
        });
    }

    setActiveNav(name) {
        this.navButtons.forEach(b => {
            if (b.getAttribute('data-module') === name) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }

    async loadModule(name) {
        const isSameModuleReload = this.currentModule === name;
        
        if (!isSameModuleReload) {
            if (Scanner && typeof Scanner.stopCamera === 'function') {
                try {
                    if (Scanner.mode === 'camera') {
                        await Scanner.stopCamera();
                    } else {
                        if (typeof Scanner.releaseProcessing === 'function') Scanner.releaseProcessing();
                    }
                } catch (err) {
                    console.warn('Gagal mematikan kamera saat alih modul:', err);
                }
            }
        } else {
            if (Scanner && typeof Scanner.releaseProcessing === 'function') {
                Scanner.releaseProcessing();
            }
        }

        // FIX BLANK HITAM: simpan video element sebelum ganti innerHTML
        let savedVideo = null;
        let savedStream = null;
        if (Scanner && Scanner.nativeVideo && Scanner.isScanning && Scanner.nativeStream) {
            savedVideo = Scanner.nativeVideo;
            savedStream = Scanner.nativeStream;
        }

        // RALAT: operator hanya transaksi, admin full
        const userRole = this.currentUser?.role;
        const isOperatorRole = userRole === 'operator' || userRole === 'kasir';
        if (isOperatorRole) {
            const allowed = ['transaksi'];
            if (!allowed.includes(name)) {
                console.warn(`Operator ${this.currentUser?.name} tidak boleh akses ${name}, dialihkan ke transaksi`);
                name = 'transaksi';
                this.setActiveNav('transaksi');
            }
        }

        this.contentArea.innerHTML = `<div class="loader">Memuat modul ${name}...</div>`;
        if (savedVideo && savedStream) {
            Scanner.nativeVideo = savedVideo;
            Scanner.nativeStream = savedStream;
        }
        
        const loadTimeout = setTimeout(() => {
            if (this.contentArea.querySelector('.loader')) {
                console.warn(`Pemuatan modul ${name} mengalami timeout.`);
                this.renderErrorFallback(name, new Error('Waktu pemuatan modul habis (Timeout).'));
            }
        }, 4000);

        try {
            if (!this.modules[name]) {
                const module = await import(`./modules/${name}.js`);
                this.modules[name] = module.default;
            }
            
            this.currentModule = name;
            const renderedHtml = await this.modules[name].render();
            clearTimeout(loadTimeout);
            
            this.contentArea.innerHTML = renderedHtml;
            
            if (typeof this.modules[name].init === 'function') {
                await this.modules[name].init();
            }

            if (window.lucide) lucide.createIcons();
            this.updateDBIndicator();

        } catch (error) {
            clearTimeout(loadTimeout);
            console.error(`Gagal memuat modul ${name}:`, error);
            this.renderErrorFallback(name, error);
        }
    }

    renderErrorFallback(name, error) {
        this.contentArea.innerHTML = `
            <div style="text-align:center; padding: 30px; background: #fff; border-radius: 8px; margin: 20px;">
                <h3 style="color:var(--danger-color, #ef4444); margin-bottom: 10px;">Gagal Memuat Modul "${name}"</h3>
                <p style="font-size: 13px; color: #666; background: #f8fafc; padding: 10px; border-radius: 6px; font-family: monospace;">
                    ${error.message || error}
                </p>
                <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-fallback-retry" style="padding: 8px 16px; cursor: pointer;">Coba Lagi</button>
                    ${this.currentUser?.role === 'admin' ? '<button id="btn-fallback-setting" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Buka Pengaturan</button>' : ''}
                </div>
            </div>`;

        document.getElementById('btn-fallback-retry')?.addEventListener('click', () => {
            this.loadModule(name);
        });

        document.getElementById('btn-fallback-setting')?.addEventListener('click', () => {
            this.setActiveNav('setting');
            this.loadModule('setting');
        });

        if (window.lucide) lucide.createIcons();
    }

    startClock() {
        const clockEl = document.getElementById('system-clock');
        if (!clockEl) return;
        const updateClock = () => {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        };
        updateClock();
        setInterval(updateClock, 10000);
    }

    updateDBIndicator() {
        const indicator = document.getElementById('db-indicator');
        if (indicator) {
            const mode = localStorage.getItem('edc_db_mode') || 'local';
            indicator.textContent = `[${mode.toUpperCase()}]`;
            indicator.style.color = mode === 'cloud' ? '#3b82f6' : 'var(--success-color, #10b981)';
        }
    }

    initSyncEngine() {
        try {
            DB.syncPendingData();

            DB.listenCloudChanges((updatedStore) => {
                const activeBtn = document.querySelector('.nav-btn.active');
                const activeModule = activeBtn ? activeBtn.getAttribute('data-module') : null;
                
                if (activeModule === updatedStore) {
                    this.loadModule(activeModule);
                }
            });

            window.addEventListener('online', () => {
                console.log('Online: Menjalankan sync...');
                DB.syncPendingData();
            });
        } catch (err) {
            console.warn('Sync engine di-bypass:', err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new Router();
});