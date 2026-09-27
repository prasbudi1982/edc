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

    async renderLoginModal() {
        // FIX: ambil operator dari IndexedDB / Cloud dulu, fallback LS
        let operators = [];
        try {
            if (typeof DB !== 'undefined' && DB.getOperators) {
                operators = await DB.getOperators();
                if (operators && operators.length > 0) {
                    try { localStorage.setItem('edc_operators', JSON.stringify(operators)); } catch(e){}
                }
            }
        } catch(e) { console.warn('Gagal load operator dari DB, pakai LS', e); }
        if (!operators || operators.length === 0) {
            try { operators = JSON.parse(localStorage.getItem('edc_operators') || '[]'); } catch(e){ operators=[]; }
        }
        const existingModal = document.getElementById('login-modal-overlay');
        if (existingModal) existingModal.remove();

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

[... 336 lines truncated ...]
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
