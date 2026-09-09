/**
 * modules/ads.js - FINAL 728x90 AUTO REFRESH 30 DETIK
 * Key: 2914703854711ce514513a28a5b7ec52
 * Fix: 
 * 1. _loaded per container (bukan global) - jadi transaksi, produk, promosi bisa load semua
 * 2. Auto refresh tiap 30 detik (ganti iklan tanpa reload page)
 * 3. Bisa force refresh
 */

const ADSTERRA_KEY = '2914703854711ce514513a28a5b7ec52';
const ADSTERRA_SRC = 'https://www.highrevenueformat.com/2914703854711ce514513a28a5b7ec52/invoke.js';

const Ads = {
    _loaded: {}, // per containerId
    _intervals: {},

    loadScript() {
        return this.loadScriptFor('ad-160x600', true);
    },

    loadScriptProduk() {
        return this.loadScriptFor('ad-produk-728x90', true);
    },

    loadScriptPromosi() {
        return this.loadScriptFor('ad-promosi-728x90', true);
    },

    loadScriptFor(containerId, enableAutoRefresh = true) {
        // Jika sudah pernah load di container ini, jangan block - tapi allow refresh
        const alreadyLoaded = this._loaded[containerId];

        return new Promise((resolve) => {
            try {
                const container = document.getElementById(containerId);
                if (!container) {
                    console.warn('[Ads] container #'+containerId+' not found');
                    resolve();
                    return;
                }

                // Clear existing interval jika ada
                if (this._intervals[containerId]) {
                    clearInterval(this._intervals[containerId]);
                }

                const doLoad = () => {
                    try {
                        container.innerHTML = '';

                        window.atOptions = {
                            'key': ADSTERRA_KEY,
                            'format': 'iframe',
                            'height': 90,
                            'width': 728,
                            'params': {}
                        };

                        const s = document.createElement('script');
                        s.type = 'text/javascript';
                        s.src = ADSTERRA_SRC + '?t=' + Date.now(); // cache buster biar fresh
                        s.async = false;

                        s.onload = () => {
                            this._loaded[containerId] = true;
                            console.log('[Ads] 728x90 loaded in #'+containerId+' - key:', ADSTERRA_KEY);
                            setTimeout(() => {
                                const iframe = container.querySelector('iframe');
                                if (iframe) {
                                    iframe.style.width = '100%';
                                    iframe.style.maxWidth = '728px';
                                    iframe.style.height = '90px';
                                    iframe.style.border = 'none';
                                    iframe.style.borderRadius = '8px';
                                    iframe.style.display = 'block';
                                    iframe.style.margin = '0 auto';
                                }
                            }, 800);
                            resolve();
                        };

                        s.onerror = () => {
                            console.warn('[Ads] failed #'+containerId);
                            container.innerHTML = '<span style="font-size:10px; color:#94a3b8;">Iklan tidak tersedia</span>';
                            resolve();
                        };

                        container.appendChild(s);
                    } catch(e) {
                        console.warn('[Ads] exception', e);
                        resolve();
                    }
                };

                // Load pertama
                doLoad();

                // Auto refresh tiap 30 detik
                if (enableAutoRefresh) {
                    // interval 30 detik = 30000ms
                    this._intervals[containerId] = setInterval(() => {
                        const cont = document.getElementById(containerId);
                        if (!cont) return;
                        // Hanya refresh jika tab visible biar hemat
                        if (document.hidden) return;
                        console.log('[Ads] auto-refresh #'+containerId);
                        doLoad();
                    }, 30000);
                    console.log('[Ads] auto-refresh enabled for #'+containerId+' every 30s');
                }

                if (!document.getElementById('ads-style')) {
                    const style = document.createElement('style');
                    style.id = 'ads-style';
                    style.textContent = `
                        #ad-160x600, #ad-produk-728x90, #ad-promosi-728x90 { width:100% !important; min-height:90px !important; display:block !important; background:transparent !important; border-radius:8px; overflow:hidden; }
                        #ad-160x600 iframe, #ad-produk-728x90 iframe, #ad-promosi-728x90 iframe { width:100% !important; max-width:728px !important; height:90px !important; border:none !important; display:block !important; margin:0 auto !important; }
                        #ads-transaksi-wrapper, #ads-produk-wrapper, #ads-promosi-wrapper { width:100% !important; box-sizing:border-box !important; background:transparent !important; border:none !important; padding:0 !important; }
                    `;
                    document.head.appendChild(style);
                }

            } catch (e) {
                console.warn('[Ads] exception outer', e);
                resolve();
            }
        });
    },

    stopAutoRefresh(containerId) {
        if (containerId) {
            if (this._intervals[containerId]) {
                clearInterval(this._intervals[containerId]);
                delete this._intervals[containerId];
            }
        } else {
            Object.keys(this._intervals).forEach(id => {
                clearInterval(this._intervals[id]);
            });
            this._intervals = {};
        }
    },

    renderCard() {
        return '<div style="padding:10px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; margin-bottom:6px; font-size:0.75rem; width:100%; box-sizing:border-box;">Promo: Kertas Struk 58mm - 10 roll 45rb</div>';
    },

    async render() {
        return '<div id="ad-160x600" style="width:100%; height:90px; display:flex; align-items:center; justify-content:center; background:transparent; border-radius:8px;">Memuat iklan...</div>';
    },

    async init() {
        try { await this.loadScript(); } catch(e){}
    }
};

export default Ads;
