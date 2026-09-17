import Scanner from './scanner.js';
import Printer from './printer.js';
import DB from './db.js';
import MemberModule from './member.js';
import MemberPromoModule from './member_promo.js';

const TransaksiModule = {
    cart: [],
    products: [],

    // === CEK EXPIRED - JANGAN IJINKAN KE KERANJANG ===
    isProductExpired(p) {
        if (!p) return false;
        const expStr = p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry || p.tglExpired || p.exp || p.expiredDate || p.tanggal_expired;
        if (!expStr) return false;
        let d = new Date(expStr);
        if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
        if (isNaN(d.getTime())) {
            const str = String(expStr).trim();
            const m = str.match(/^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{2,4})$/);
            if (m) {
                const day = parseInt(m[1],10);
                const month = parseInt(m[2],10)-1;
                let year = parseInt(m[3],10);
                if (year < 100) year += 2000;
                d = new Date(year, month, day);
            }
        }
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        now.setHours(0,0,0,0);
        d.setHours(0,0,0,0);
        return d < now; // expired jika tanggal < hari ini
    },

    getExpiredLabel(p) {
        const expStr = p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry || p.tglExpired || p.exp || p.expiredDate || p.tanggal_expired;
        if (!expStr) return '';
        let d = new Date(expStr);
        if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'});
    },


    getIsiPerSatuan(p){ return Number(p.isiPerSatuan || p.isiPerDus || p.isi || 1); },
    getSatuanBeli(p){ return p.satuanBeli || 'dus'; },
    formatStokGrosir(p){
        const stock = Number(p.stock||0);
        const isi = this.getIsiPerSatuan(p);
        const satuan = this.getSatuanBeli(p);
        if(isi<=1 || satuan==='pcs') return `${stock} pcs`;
        const dus = Math.floor(stock/isi);
        const sisa = stock % isi;
        if(dus>0 && sisa>0) return `${dus} ${satuan} ${sisa} pcs`;
        if(dus>0) return `${dus} ${satuan}`;
        return `${stock} pcs`;
    },
    getAvailableUnits(p){
        const isi = this.getIsiPerSatuan(p);
        const satuan = this.getSatuanBeli(p);
        const list=[];
        if((p.hargaJualDus||p.hargaJualGrosir) && isi>1){
            list.push({value:satuan, label:`${satuan.toUpperCase()} (${isi} pcs) Rp ${Number(p.hargaJualDus||p.hargaJualGrosir).toLocaleString()}`, price:Number(p.hargaJualDus||p.hargaJualGrosir), pcs:isi});
        }
        list.push({value:'pcs', label:`PCS Rp ${Number(p.hargaJualPcs||p.price||0).toLocaleString()}`, price:Number(p.hargaJualPcs||p.price||0), pcs:1});
        return list;
    },
    promotions: [],
    topProducts: [],
    scannerActive: false,
    currentMember: null,
    memberMode: 'guest',
    memberScannerActive: false,
    memberDiscount: 0,
    redeemPoints: 0,
    memberPromoData: null,
    showPreviewModal: false,
    selectedPaymentMethod: null,
    appliedPromoIds: [], // Promo yang sudah di-apply manual
    promoAddedItems: [], // Tracker barang yang ditambahkan via promo: { promoId, prodId, qty }

    async render() {
        // FIX REPORT: restore memberDiscount & redeemPoints dari _memberPromoState agar tidak hilang setelah Apply
        if (window._memberPromoState) {
          if (window._memberPromoState.memberDiscount !== undefined) {
            this.memberDiscount = window._memberPromoState.memberDiscount;
          }
          if (window._memberPromoState.redeemPoints !== undefined) {
            this.redeemPoints = window._memberPromoState.redeemPoints;
          }
        }
        this.products = await DB.getProducts();
        this.promotions = await DB.getPromotions();
        this.topProducts = await this.getTopSellingProducts(4);

        // === MEMBER PROMO FETCH - FIX: CACHE ANTI RELOAD BERAT + FIX POIN Rp0 ===
        if (this.currentMember && this.memberMode === 'member') {
            try {
                if (window._memberPromoState && window._memberPromoState.lastMemberId !== this.currentMember.id) {
                    MemberPromoModule.resetForNewTransaction();
                    window._memberPromoState.lastMemberId = this.currentMember.id;
                    this.memberDiscount = 0;
                    this.redeemPoints = 0;
                    // reset cache kalau ganti member
                    if (window._memberPromoCache) window._memberPromoCache = null;
                }

                // --- CACHE LOGIC: cegah AI scan setiap reload ---
                const cartHash = this.cart.map(c=>`${c.prodId}:${c.qty}`).join('|');
                const now = Date.now();
                const CACHE_TTL = 3 * 60 * 1000; // 3 menit
                let useCache = false;

                if (window._memberPromoCache && 
                    window._memberPromoCache.memberId === this.currentMember.id &&
                    window._memberPromoCache.cartHash === cartHash &&
                    (now - window._memberPromoCache.timestamp) < CACHE_TTL) {
                    // pakai cache, tidak call AI lagi -> UI ringan
                    this.memberPromoData = window._memberPromoCache.data;
                    useCache = true;
                    console.log('Member promo pakai cache, skip AI scan');
                }

                if (!useCache) {
                    this.memberPromoData = await MemberPromoModule.getAvailablePromos(this.currentMember, this.cart, {
                        products: this.products,
                        transactions: await DB.getTransactions(),
                        promotions: this.promotions
                    });

                    // --- FIX POIN Rp0: pastikan pointValue ada dan hitung benar ---
                    if (this.memberPromoData && this.memberPromoData.promos) {
                        const pointValue = Number(MemberPromoModule.config?.pointValue || MemberPromoModule.config?.point_value || 100); // default 100 rupiah per poin
                        const safePointValue = pointValue > 0 ? pointValue : 100;
                        this.memberPromoData.promos = this.memberPromoData.promos.map(p => {
                            // kalau promo redeem poin tapi discountAmount 0 padahal member punya poin
                            if ((p.type === 'points_redeem' || p.type === 'redeem' || p.id?.includes('poin') || p.id?.includes('point')) && this.currentMember.points > 0) {
                                if (!p.discountAmount || p.discountAmount === 0) {
                                    // hitung: min(poin member, maxRedeem) * pointValue
                                    const maxRedeem = p.maxPoints || p.config?.maxPoints || this.currentMember.points;
                                    const redeemable = Math.min(Number(this.currentMember.points)||0, Number(maxRedeem)||0);
                                    p.discountAmount = redeemable * safePointValue;
                                    p.desc = p.desc || `Tukar ${redeemable} poin = Rp ${p.discountAmount.toLocaleString('id-ID')}`;
                                    // jangan Rp0 kalau sudah ada 200 poin
                                    if (p.discountAmount === 0 && redeemable > 0) {
                                        p.discountAmount = redeemable * safePointValue;
                                    }
                                }
                            }
                            return p;
                        });
                    }

                    // simpan ke cache
                    window._memberPromoCache = {
                        memberId: this.currentMember.id,
                        cartHash: cartHash,
                        data: this.memberPromoData,
                        timestamp: now
                    };
                } else {
                    // walau pakai cache, tetap fix poin Rp0 kalau cache lama punya bug
                    if (this.memberPromoData && this.memberPromoData.promos) {
                        const pointValue = Number(MemberPromoModule.config?.pointValue || 100);
                        const safePointValue = pointValue > 0 ? pointValue : 100;
                        this.memberPromoData.promos.forEach(p => {
                            if ((p.type === 'points_redeem' || p.id?.includes('poin')) && this.currentMember.points >= 200 && (!p.discountAmount || p.discountAmount === 0)) {
                                const redeemable = Math.min(Number(this.currentMember.points)||0, p.maxPoints || this.currentMember.points);
                                p.discountAmount = redeemable * safePointValue;
                            }
                        });
                    }
                }
                // auto apply tier discount saja
                for (const p of (this.memberPromoData.promos||[]).filter(x=>x.autoApply && x.canApply)) {
                    if (!window._memberPromoState.appliedIds.includes(p.id)) {
                        MemberPromoModule.applyPromoToCart(p, this);
                    }
                }
            } catch(e) { console.warn('member promo fetch fail', e); }
        }

        const baseResult = this.calculateTotalWithPromos();
        let subtotal = baseResult.subtotal;
        let discount = baseResult.discount;
        let taxTotal = baseResult.taxTotal;
        let taxDetails = baseResult.taxDetails;
        let totalBeforeTax = baseResult.totalBeforeTax;
        let detectedPromos = baseResult.detectedPromos;
        let memberDiscount = this.memberDiscount || 0;
        let total = Math.max(0, baseResult.totalBeforeTax - memberDiscount + taxTotal);
        // Untuk kompatibilitas template lama, kita tetap pakai variabel total yang sudah termasuk member discount

        const scannerMode = localStorage.getItem('edc_scanner_mode') || 'camera';

        return `
            <div class="transaksi-container" style="padding-bottom: 20px;">
                <!-- Tombol Toggle Scanner -->
                <button id="btn-toggle-scanner" class="btn-scanner-toggle ${this.scannerActive ? 'active' : ''}">
                    <i data-lucide="qr-code"></i>
                    <span>${this.scannerActive ? 'Matikan Scanner' : 'Barcode Scanner (' + scannerMode.toUpperCase() + ')'}</span>
                </button>

                <!-- Frame Kamera Scanner -->
                <div id="transaksi-scanner-wrapper" style="display: ${this.scannerActive && scannerMode === 'camera' ? 'block' : 'none'}; text-align:center; margin-top:8px;">
                    <div id="interactive-scanner" style="width: 250px; height: 180px; margin: 0 auto; overflow: hidden; border-radius: 8px; border: 2px solid var(--accent-color, #007bff);"></div>
                    <div style="margin-top:6px;">
                        <button id="btn-toggle-trans-flash" class="btn-touch" style="padding:4px 10px; font-size:0.75rem; background:var(--bg-card);" disabled>
                            🔦 Flashlight OFF
                        </button>
                    </div>
                </div>

                <!-- MEMBER / GUEST SELECTOR - TAMBAHAN MINIMAL -->
                <div style="margin-top:10px; background:var(--bg-card,#fff); padding:10px; border-radius:8px; border:1px solid var(--border-color,#ccc);">
                    <div style="display:flex; gap:6px; margin-bottom:8px;">
                        <button id="btn-mode-guest" class="btn-touch ${this.memberMode==='guest'?'active':''}" style="flex:1; padding:7px; font-size:0.8rem;">👤 Guest</button>
                        <button id="btn-mode-member" class="btn-touch ${this.memberMode==='member'?'active':''}" style="flex:1; padding:7px; font-size:0.8rem;">💳 Member</button>
                    </div>
                    <div id="member-input-area" style="display:${this.memberMode==='member'?'block':'none'};">
                        ${!this.currentMember ? `
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                <input id="member-barcode-input" placeholder="Scan Barcode Member / No HP / ID MBR-..." style="width:100%; padding:8px 10px; border:1px solid var(--accent-color); border-radius:6px; font-size:0.85rem; box-sizing:border-box;" />
                                <div style="display:flex; gap:6px;">
                                    <button id="btn-scan-member" class="btn-touch active" style="flex:1; padding:7px; font-size:0.8rem;">🔍 Cari</button>
                                    <button id="btn-toggle-member-scanner-trans" class="btn-touch ${this.memberScannerActive?'active':''}" style="flex:1; padding:7px; font-size:0.8rem; background:${this.memberScannerActive?'#0ea5e9':'var(--bg-card)'}; color:${this.memberScannerActive?'#fff':'inherit'};">${this.memberScannerActive?'✕ Tutup Scan':'📷 Scan Barcode'}</button>
                                </div>
                            </div>
                            <div id="member-scanner-wrapper-trans" style="display: ${this.memberScannerActive ? 'block' : 'none'}; text-align:center; margin-top:10px; background:rgba(14,165,233,0.05); padding:10px; border-radius:8px; border:1px dashed #0ea5e9;">
                                <div id="member-interactive-scanner-trans" style="width:100%; max-width:280px; height:180px; margin:0 auto; overflow:hidden; border-radius:8px; border:2px solid #0ea5e9; background:#000;"></div>
                                <div style="margin-top:8px; display:flex; gap:6px; justify-content:center;">
                                    <button id="btn-toggle-member-flash-trans" class="btn-touch" style="padding:5px 12px; font-size:0.7rem;" disabled>🔦 Flash</button>
                                    <button id="btn-close-member-scanner-trans" class="btn-touch" style="padding:5px 12px; font-size:0.7rem; background:#fee2e2; color:#dc2626;">Tutup Scanner</button>
                                </div>
                                <div style="font-size:0.6rem; color:#0ea5e9; margin-top:6px; font-weight:600;">Arahkan kamera ke barcode kartu member MBR-...</div>
                            </div>
                        ` : `
                            <div style="background:rgba(14,165,233,0.1); border:1px solid #0ea5e9; border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center;">
                                <div><b style="font-size:0.9rem;">${this.currentMember.name}</b> <span style="font-size:0.55rem; padding:2px 6px; border-radius:10px; background:#0ea5e9; color:#fff;">${(this.currentMember.tier||'bronze').toUpperCase()}</span><div style="font-size:0.7rem;">${this.currentMember.phone} • ${this.currentMember.points||0} poin</div></div>
                                <button id="btn-remove-member" style="background:#fee2e2; color:#dc2626; border:none; padding:4px 8px; border-radius:6px; font-size:0.7rem;">✕</button>
                            </div>
                        `}
                    </div>
                </div>

                <!-- CARI & TAMBAH DARI STOK DATABASE (Tepat di Bawah Scanner) -->
                <div style="margin-top:10px; background:var(--bg-card, #fff); padding:10px; border-radius:8px; border:1px solid var(--border-color, #ccc); position:relative;">
                    <small style="font-weight:bold; color:var(--accent-color, #007bff); display:block; margin-bottom:6px;">
                        🔍 Cari & Tambah Barang (SKU / Barcode / Nama)
                    </small>
                    <div style="position:relative;">
                        <input type="text" id="manual-search-input" 
                            placeholder="Ketik SKU, Barcode, atau Nama..." 
                            oninput="TransaksiModule.handleProductSearch(this.value)"
                            onfocus="TransaksiModule.handleProductSearch(this.value)"
                            autocomplete="off"
                            style="width:100%; padding:10px 12px; font-size:0.85rem; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-primary); border-radius:8px; box-sizing:border-box;">
                        
                        <!-- Dropdown Results Autocomplete -->
                        <div id="search-results-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); max-height:220px; overflow-y:auto; z-index:99; margin-top:4px;">
                        </div>
                    </div>
                </div>
<!-- Deteksi Promo Otomatis - AUTO REFRESH NON MEMBER -->
                <div id="auto-promo-nonmember-wrapper">
                ${detectedPromos.length ? `
                    <div style="background:rgba(34,197,94,0.15); border:1px solid var(--success-color); border-radius:6px; padding:8px; margin-top:8px; font-size:0.75rem;">
                        <b style="color:var(--success-color); font-size:0.8rem;">🏷️ Promo Terdeteksi:</b>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                            ${detectedPromos.map(p => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:4px 8px; border-radius:4px;">
                                    <span><b>${p.name}</b> <br><small style="color:var(--text-secondary);">${p.desc}</small></span>
                                    ${p.canApply ? `
                                        <button onclick="TransaksiModule.applyPromoAction('${p.id}')" class="btn-touch active" style="padding:3px 8px; font-size:0.7rem; height:auto;">
                                            + Apply
                                        </button>
                                    ` : `
                                        <div style="display:flex; gap:4px; align-items:center;">
                                            <span style="color:var(--success-color); font-weight:bold; font-size:0.7rem;">Active</span>
                                            <button onclick="TransaksiModule.removePromoAction('${p.id}')" style="padding:2px 6px; font-size:0.65rem; background:#ef4444; color:#fff; border:none; border-radius:4px;">Batal</button>
                                        </div>
                                    `}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                </div>

                
                <!-- NOTIF AI MEMBER - jika gagal atau kosong -->
                <div id="ai-member-notif-area"></div>

                ${this.memberMode==='member' && this.currentMember && this.memberPromoData ? `
                    <div style="background:rgba(14,165,233,0.12); border:1px solid #0ea5e9; border-radius:8px; padding:10px; margin-top:8px;">
                        <div style="display:flex; justify-content:space-between;"><b style="color:#0ea5e9; font-size:0.85rem;">💎 Promo Khusus ${this.currentMember.name}</b><span style="font-size:0.6rem; background:var(--bg-card); color:var(--text-secondary); padding:2px 8px; border-radius:20px; border:1px solid var(--border-color);">${this.memberPromoData.promos.length} promo</span></div>
                        <div style="font-size:0.65rem; color:var(--text-secondary); margin-top:4px;">Total belanja: Rp ${Number(this.memberPromoData.totalSpend).toLocaleString('id-ID')} • ${this.memberPromoData.freq30}x/bulan</div>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                            ${this.memberPromoData.promos.map(p => {
                                const isApplied = window._memberPromoState && window._memberPromoState.appliedIds.includes(p.id);
                                return `<div style="background:var(--bg-card); border:1px solid ${isApplied?'#10b981':'var(--border-color)'}; border-left:3px solid ${isApplied?'#10b981':'#0ea5e9'}; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-size:0.8rem; font-weight:600;">${p.name}</div><div style="font-size:0.68rem; color:var(--text-secondary);">${p.desc}</div>${p.discountAmount?`<div style="font-size:0.7rem; color:#10b981;">Hemat Rp ${Number(p.discountAmount).toLocaleString('id-ID')}</div>`:''}</div><div>${isApplied?`<span style="font-size:0.65rem; color:#10b981; font-weight:700;">✓</span><button onclick="TransaksiModule.removeMemberPromo('${p.id}')" style="margin-left:4px; padding:2px 6px; font-size:0.6rem; background:#fee2e2; color:#dc2626; border:none; border-radius:4px;">Batal</button>`:`${p.canApply?`<button onclick="TransaksiModule.applyMemberPromo('${p.id}')" class="btn-touch active" style="padding:4px 10px; font-size:0.7rem;">Apply</button>`:`<span style="font-size:0.6rem; color:#999;">Info</span>`}`}</div></div>`;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                <style>
                .cart-list::-webkit-scrollbar { width: 6px; }
                .cart-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .cart-list::-webkit-scrollbar-track { background: transparent; }
                </style>

                <!-- Detail Keranjang -->
                <div class="cart-summary" style="margin-top:8px; background:var(--bg-card, #fff); padding:10px; border-radius:8px; border:1px solid var(--border-color, #ccc);">
                    <h4 style="margin:0 0 8px 0; font-size:0.9rem;">🛒 Keranjang Belanja</h4>
                    <div class="cart-list" style="max-height: 270px; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding-right: 4px;">
                        ${this.cart.length ? this.cart.map(item => {
                            const lineTotal = item.price * item.qty;
                            const lineTax = item.taxEnabled ? Math.round(lineTotal * (Number(item.taxRate||11)/100)) : 0;
                            return `
                            <div class="cart-item" data-cart-prod-id="${item.prodId || item.name}" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px dashed #eee; padding-bottom:4px;">
                                <div>
                                    <b>${item.name}</b> x${item.qty} ${item.taxEnabled ? `<span style="font-size:0.6rem; background:#ffc107; padding:1px 4px; border-radius:3px;">Pajak ${item.taxRate}%</span>` : ''}<br>
                                    <small style="color:var(--text-secondary);">@ Rp ${Number(item.price).toLocaleString()} ${item.taxEnabled ? `+ Pajak Rp ${lineTax.toLocaleString()}` : ''}</small>
                                </div>
                                <div style="text-align:right;">
                                    <div>Rp ${lineTotal.toLocaleString()}</div>
                                    ${item.taxEnabled ? `<div style="font-size:0.65rem; color:#d97706;">+Rp ${lineTax.toLocaleString()} pajak</div>` : ''}
                                    <div style="margin-top:4px; display:flex; gap:8px;">
                                        <button onclick="TransaksiModule.updateQty('${item.prodId}', -1, '${item.satuanJual||'pcs'}')" style="padding:4px 10px; font-size:0.85rem;">-</button>
                                        <button onclick="TransaksiModule.updateQty('${item.prodId}', 1, '${item.satuanJual||'pcs'}')" style="padding:4px 10px; font-size:0.85rem;">+</button>
                                    </div>
                                </div>
                            </div>
                        `}).join('') : '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Keranjang Kosong</p>'}
                    </div>
                    
                    <div style="border-top:1px dashed var(--border-color); margin-top:6px; padding-top:4px; font-size:0.8rem;">
                        <div style="display:flex; justify-content:space-between;">
                            <span>Subtotal</span>
                            <span>Rp ${subtotal.toLocaleString()}</span>
                        </div>
                        ${discount > 0 ? `
                            <div style="display:flex; justify-content:space-between; color:var(--success-color);">
                                <span>Diskon Promo Toko</span>
                                <span>-Rp ${discount.toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${memberDiscount > 0 ? `
                            <div style="display:flex; justify-content:space-between; color:#0ea5e9;">
                                <span>Diskon Member</span>
                                <span>-Rp ${memberDiscount.toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${taxTotal > 0 ? `
                            <div style="display:flex; justify-content:space-between; color:#d97706;">
                                <span>Pajak (${taxDetails.map(t=>t.name+':'+t.rate+'%').join(', ')})</span>
                                <span>+Rp ${taxTotal.toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${taxTotal > 0 ? `
                            <div style="display:flex; justify-content:space-between; font-size:0.7rem; opacity:0.8;">
                                <span>DPP</span>
                                <span>Rp ${(subtotal - discount).toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="cart-total" style="margin-top:6px; font-weight:bold; font-size:1.1rem; display:flex; justify-content:space-between; color:var(--accent-color, #007bff);">
                        <span>TOTAL</span>
                        <span>Rp ${total.toLocaleString()}</span>
                    </div>
                </div>

                <!-- Saran Produk Terlaris -->
                <div style="margin-top:12px;">
                    <small style="font-weight:bold; color:var(--text-secondary);">🔥 Produk Terlaris (Saran):</small>
                    <div class="quick-products" style="margin-top:6px; display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;">
                        ${this.topProducts.length ? this.topProducts.map(p => {
                            const stok = Number(p.stock ?? 0);
                            const minStok = Number(p.minStock ?? p.min_stock ?? 5);
                            const isHabis = stok <= 0;
                            const isMenipis = stok > 0 && stok <= minStok;
                            const isExpired = this.isProductExpired(p);
                            const disabled = isHabis || isExpired;
                            return `
                            <button class="product-btn" ${disabled ? 'disabled' : `onclick="TransaksiModule.addItemByProduct('${p.id}')"`} 
                                style="padding:8px; text-align:left; background:var(--bg-card, #fff); border:1px solid ${disabled ? (isExpired ? '#991b1b' : '#ef4444') : isMenipis ? '#f59e0b' : 'var(--border-color, #ccc)'}; border-radius:6px; ${disabled ? 'cursor:not-allowed; opacity:0.6;' : 'cursor:pointer;'} position:relative;">
                                <b style="font-size:0.8rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:${disabled || isMenipis ? '55px' : '0'};">${p.name}</b>
                                <small style="color:var(--text-secondary);">Rp ${Number(p.price).toLocaleString()} | Stok: ${stok}${isExpired ? ` | Exp: ${this.getExpiredLabel(p)}` : ''}</small>
                                ${isExpired ? `<span style="position:absolute; top:6px; right:6px; background:#991b1b; color:#fff; font-size:0.6rem; padding:2px 5px; border-radius:4px; font-weight:bold;">EXPIRED</span>` : isHabis ? `<span style="position:absolute; top:6px; right:6px; background:#ef4444; color:#fff; font-size:0.6rem; padding:2px 5px; border-radius:4px; font-weight:bold;">HABIS</span>` : isMenipis ? `<span style="position:absolute; top:6px; right:6px; background:#f59e0b; color:#fff; font-size:0.6rem; padding:2px 5px; border-radius:4px; font-weight:bold;">MENIPIS</span>` : ''}
                            </button>
                            `;
                        }).join('') : '<p style="grid-column: span 2; font-size:0.75rem; color:var(--text-secondary);">Belum ada data produk terlaris</p>'}
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons-grid" style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
                    <button class="btn-pay" id="btn-proses-transaksi" style="width:100%; padding:12px; font-size:1rem; font-weight:bold; background:var(--accent-color, #22c55e); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                        PROSES TRANSAKSI (Rp ${total.toLocaleString()})
                    </button>
                    
                    <div style="display:flex; gap:8px;">
                        <button id="btn-clear-cart" onclick="TransaksiModule.clearCart()" style="flex:1; padding:8px; background:#ef4444; color:#fff; border:none; border-radius:6px; font-size:0.8rem;">
                            Kosongkan
                        </button>
                        <button id="btn-share-wa" onclick="TransaksiModule.shareToWhatsApp()" style="flex:2; padding:8px; background:#25D366; color:#fff; border:none; border-radius:6px; font-size:0.8rem; font-weight:bold;">
                            📲 Kirim Struk via WA
                        </button>
                    </div>
                </div>

                <!-- MODAL PRINT PREVIEW & METODE BAYAR -->
                ${this.showPreviewModal ? this.renderPreviewModal(subtotal, discount, taxTotal, taxDetails, total) : ''}
            </div>
        `;
    },

    // --- SEARCH BARANG DARI DATABASE (SKU/BARCODE/NAMA) ---
    handleProductSearch(query) {
        const dropdown = document.getElementById('search-results-dropdown');
        if (!dropdown) return;
        const q = query.trim().toLowerCase();
        if (!q) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }
        const matches = this.products.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.barcode && p.barcode.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q))
        );
        if (matches.length === 0) {
            dropdown.innerHTML = `<div style="padding:8px; font-size:0.75rem; color:var(--text-secondary); text-align:center;">Barang tidak ditemukan</div>`;
        } else {
            dropdown.innerHTML = matches.map(p => {
                const stok = Number(p.stock ?? 0);
                const isHabis = stok <= 0;
                const isExpired = this.isProductExpired(p);
                const expLabel = isExpired ? this.getExpiredLabel(p) : '';
                const disabled = isHabis || isExpired;
                const units = this.getAvailableUnits(p);
                return `
                <div style="padding:10px; border-bottom:1px solid var(--border-color); display:flex; flex-direction:column; gap:6px; background:var(--bg-card); ${disabled ? 'opacity:0.6;' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="flex:1; min-width:0;">
                            <b style="font-size:0.8rem; color:var(--text-primary);">${p.name}</b><br>
                            <small style="color:var(--text-secondary); font-size:0.7rem;">Stok: ${this.formatStokGrosir(p)}</small>
                        </div>
                        <span style="font-weight:bold; font-size:0.8rem; color:var(--accent-color);">Rp ${Number(p.hargaJualPcs||p.price||0).toLocaleString()}</span>
                    </div>
                    ${!disabled ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">${units.map(u=>`<button type="button" onclick="TransaksiModule.addItemByProduct('${p.id}','${u.value}'); document.getElementById('search-results-dropdown').style.display='none'; document.getElementById('manual-search-input').value=''; " class="btn-touch active" style="font-size:0.7rem; padding:5px 10px; border-radius:20px; height:auto;">+ ${u.label}</button>`).join('')}</div>` : ''}
                </div>
            `}).join('');
        }
        dropdown.style.display = 'block';
    },

    selectSearchProduct(prodId) {
        this.addItemByProduct(prodId);
        const input = document.getElementById('manual-search-input');
        const dropdown = document.getElementById('search-results-dropdown');
        if (input) input.value = '';
        if (dropdown) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
        }
    },

    // --- RENDER MODAL PRINT PREVIEW & FORM PELANGGAN HUTANG ---
    renderPreviewModal(subtotal, discount, taxTotal, taxDetails, total) {
        const storeName = localStorage.getItem('edc_store_name') || 'POS EDC';
        const activeUser = JSON.parse(localStorage.getItem('edc_active_user') || '{"name":"Admin Utama","role":"admin"}');

        return `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; padding:12px;">
                <div style="background:#fff; color:#000; width:100%; max-width:340px; border-radius:8px; padding:16px; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:sans-serif; max-height:90vh; overflow-y:auto;">
                    <h3 style="text-align:center; margin:0 0 4px 0; font-size:1rem; text-transform:uppercase;">${storeName}</h3>
                    <div style="text-align:center; font-size:0.7rem; color:#666;">PRINT PREVIEW STRUK</div>
                    <div style="text-align:center; font-size:0.7rem; color:#444; font-weight:bold; margin-top:2px;">Operator: ${activeUser.name}</div>
                    <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>
                    
                    <!-- Items Struk -->
                    <div style="font-size:0.75rem; font-family:monospace;">
                        ${this.cart.map(i => {
                            const lt = i.price * i.qty;
                            const lx = i.taxEnabled ? Math.round(lt * (Number(i.taxRate||11)/100)) : 0;
                            return `
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <div>${i.name} ${i.taxEnabled ? `<small style="background:#ffc107; padding:1px 3px; border-radius:2px;">${i.taxRate}%</small>` : ''}<br><small>${i.qty} x Rp ${i.price.toLocaleString()} ${i.taxEnabled ? `+ Pajak Rp ${lx.toLocaleString()}` : ''}</small></div>
                                <div>Rp ${lt.toLocaleString()}</div>
                            </div>
                        `}).join('')}
                    </div>

                    <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>
                    <div style="font-size:0.75rem; font-family:monospace;">
                        <div style="display:flex; justify-content:space-between;"><span>Subtotal:</span><span>Rp ${subtotal.toLocaleString()}</span></div>
                        ${discount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Diskon:</span><span>-Rp ${discount.toLocaleString()}</span></div>` : ''}
                        ${taxTotal > 0 ? `<div style="display:flex; justify-content:space-between; color:#b45309;"><span>Pajak:</span><span>+Rp ${taxTotal.toLocaleString()}</span></div>` : ''}
                        ${taxDetails && taxDetails.length ? `<div style="font-size:0.65rem; opacity:0.7; margin-bottom:4px;">${taxDetails.map(t=>`${t.name} ${t.rate}% = Rp ${t.amount.toLocaleString()}`).join('<br>')}</div>` : ''}
                        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.85rem; margin-top:4px;">
                            <span>TOTAL:</span><span>Rp ${total.toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>

                    <!-- PILIHAN METODE PEMBAYARAN -->
                    <div style="margin-top:12px;">
                        <div style="font-weight:bold; font-size:0.8rem; text-align:center; margin-bottom:8px;">PILIH METODE PEMBAYARAN:</div>
                        
                        <div style="display:flex; gap:6px; margin-bottom:10px;">
                            <button onclick="TransaksiModule.selectPaymentMethod('CASH')" 
                                style="flex:1; padding:8px; background:${this.selectedPaymentMethod === 'CASH' ? '#16a34a' : '#22c55e'}; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                                💵 CASH
                            </button>
                            <button onclick="TransaksiModule.selectPaymentMethod('BON')" 
                                style="flex:1; padding:8px; background:${this.selectedPaymentMethod === 'BON' ? '#d97706' : '#f59e0b'}; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                                📝 BON
                            </button>
                            <button onclick="TransaksiModule.selectPaymentMethod('QRIS')" 
                                style="flex:1; padding:8px; background:${this.selectedPaymentMethod === 'QRIS' ? '#2563eb' : '#3b82f6'}; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                                📲 QRIS
                            </button>
                        </div>

                        <!-- FORM INPUT DATA PELANGGAN KHUSUS BON / HUTANG -->
                        ${this.selectedPaymentMethod === 'BON' ? `
                            <div style="background:#fffbe0; padding:10px; border-radius:6px; border:1px solid #f59e0b; margin-bottom:10px;">
                                <div style="font-size:0.75rem; font-weight:bold; color:#b45309; margin-bottom:6px;">📌 Data Pelanggan (Hutang/BON):</div>
                                <input type="text" id="bon-nama" placeholder="Nama Pembeli *" style="width:100%; padding:6px; font-size:0.75rem; border:1px solid #ccc; border-radius:4px; margin-bottom:6px; box-sizing:border-box;">
                                <input type="text" id="bon-alamat" placeholder="Alamat Pelanggan" style="width:100%; padding:6px; font-size:0.75rem; border:1px solid #ccc; border-radius:4px; margin-bottom:6px; box-sizing:border-box;">
                                <input type="number" id="bon-wa" placeholder="Nomor WA (cth: 08123456789) *" style="width:100%; padding:6px; font-size:0.75rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                            </div>
                        ` : ''}

                        <!-- TOMBOL EKSEKUSI PENYELESAIAN TRANSAKSI -->
                        ${this.selectedPaymentMethod ? `
                            <button onclick="TransaksiModule.executePayment()" style="width:100%; padding:10px; background:#111827; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:0.85rem;">
                                Selesaikan Transaksi (${this.selectedPaymentMethod})
                            </button>
                        ` : ''}

                        <button onclick="TransaksiModule.closePreviewModal()" style="width:100%; padding:6px; background:#6b7280; color:#fff; border:none; border-radius:4px; margin-top:6px; font-size:0.75rem; cursor:pointer;">
                            Batal
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    selectPaymentMethod(method) {
        this.selectedPaymentMethod = method;
        window.app.loadModule('transaksi');
        try { this._clearMemberPromoCache(); } catch(e){}
    },


    closePreviewModal() {
        this.showPreviewModal = false;
        this.selectedPaymentMethod = null;
        window.app.loadModule('transaksi');
    },

    // --- EKSEKUSI PENYIMPANAN & CETAK STRUK ---
    async executePayment() {
        const paymentMethod = this.selectedPaymentMethod;
        if (!paymentMethod) return alert('Silakan pilih metode pembayaran!');

        // Ambil data operator aktif dari session
        const activeUser = JSON.parse(localStorage.getItem('edc_active_user') || '{"name":"Admin Utama","role":"admin"}');

        let customerInfo = null;

        // Validasi input data jika memilih metode BON
        if (paymentMethod === 'BON') {
            const nama = document.getElementById('bon-nama')?.value.trim();
            const alamat = document.getElementById('bon-alamat')?.value.trim();
            const wa = document.getElementById('bon-wa')?.value.trim();

            if (!nama || !wa) {
                return alert('Mohon isi Nama Pembeli dan Nomor WA untuk transaksi BON/Hutang!');
            }

            customerInfo = {
                nama,
                alamat: alamat || '-',
                wa,
                statusHutang: 'UNPAID' // Siap digunakan untuk modul manajemen hutang
            };
        }

        const { subtotal, total, discount, taxTotal, taxDetails, totalBeforeTax } = this.calculateTotalWithPromos();
        const totalBuyPrice = this.cart.reduce((sum, item) => sum + ((item.buyPricePerPcs || item.buyPrice || 0) * (item.pcsKeluar || item.qty || 0) || (item.buyPrice||0)*item.qty), 0);
        const grossProfit = total - totalBuyPrice;

        const transactionData = { 
            createdAt: new Date().toISOString(),
            operator: {
                id: activeUser.id || 'admin_root',
                name: activeUser.name || 'Admin Utama',
                role: activeUser.role || 'admin'
            },
            cart: [...this.cart], 
            subtotal,
            discount, 
            taxTotal,
            taxDetails,
            totalBeforeTax,
            total,
            totalBuyPrice,
            grossProfit,
            paymentMethod,
            customerInfo // Disimpan data pembeli jika BON
        };

        // 1. Potong Stok Barang di DB - PATCH GROSIR: pakai pcsKeluar
        for (let item of this.cart) {
            if (item.prodId) {
                const prod = this.products.find(p => String(p.id) === String(item.prodId));
                if (prod) {
                    const pcsKeluar = Number(item.pcsKeluar || item.qty || 0);
                    prod.stock = Math.max(0, Number(prod.stock||0) - pcsKeluar);
                    await DB.saveProduct(prod);
                }
            }
        }

        // 2. Insert ke Database Transaksi
        // === TAMBAHAN MEMBER: simpan memberId ===
        if (this.currentMember) {
            transactionData.memberId = this.currentMember.id;
            transactionData.memberName = this.currentMember.name;
            transactionData.memberTier = this.currentMember.tier;
            transactionData.memberDiscount = this.memberDiscount||0;
            transactionData.redeemPoints = this.redeemPoints||0;
            // total sudah termasuk member discount (dari render)
            transactionData.total = Math.max(0, (transactionData.totalBeforeTax||transactionData.total) - (this.memberDiscount||0) + (transactionData.taxTotal||0));
            if (transactionData.grandTotal) transactionData.grandTotal = transactionData.total;
        }

        await DB.saveTransaction(transactionData);

        // === UPDATE MEMBER POINTS - FIX: poin berkurang setelah redeem, HANYA fungsi ini ===
        if (this.currentMember) {
            try {
                let redeemPts = Number(this.redeemPoints||0);
                if (redeemPts === 0 && window._memberPromoState && window._memberPromoState.redeemPoints) {
                  redeemPts = Number(window._memberPromoState.redeemPoints||0);
                }
                let freshMember = null;
                try { freshMember = await DB.getMemberById(this.currentMember.id); } catch(e) {}
                const oldPoints = Number((freshMember?.points ?? this.currentMember.points ?? 0));
                const pointsRate = Number(MemberPromoModule.config.pointsRate||10000);
                const earned = Math.floor((transactionData.total||0) / pointsRate);
                const newPoints = Math.max(0, oldPoints + earned - redeemPts);
                this.currentMember.points = newPoints;
                this.currentMember.totalSpend = (Number(this.currentMember.totalSpend)||0) + (transactionData.total||0);
                this.currentMember.totalTrx = (Number(this.currentMember.totalTrx)||0) + 1;
                this.currentMember.lastTrxAt = Date.now();
                if (MemberModule.calculateTier) {
                    const newTier = MemberModule.calculateTier(this.currentMember.totalSpend);
                    if (newTier !== this.currentMember.tier) {
                        alert(`🎉 Member ${this.currentMember.name} naik tier ke ${newTier.toUpperCase()}!`);
                        this.currentMember.tier = newTier;
                    }
                }
                await DB.saveMember(this.currentMember);
                await DB.saveMemberLog({ memberId: this.currentMember.id, type:'earn', points: earned, trxId: transactionData.id, reason:`Belanja Rp ${Number(transactionData.total||0).toLocaleString('id-ID')}`, date: Date.now() });
                if (redeemPts>0) {
                    await DB.saveMemberLog({ memberId: this.currentMember.id, type:'redeem', points: -redeemPts, trxId: transactionData.id, reason:`Redeem ${redeemPts} poin`, date: Date.now() });
                }
                console.log(`✅ Poin update: lama ${oldPoints} + bonus ${earned} - redeem ${redeemPts} = baru ${newPoints}`);
            } catch(e) { console.warn('update member points fail', e); }
        }

        // 3. Cetak Struk via Printer.js - DIALOG PDF DIMATIKAN
        try {
            await Printer.printReceipt(this.cart, total);
        } catch (err) {
            console.error('Gagal mencetak struk:', err);
            // this.fallbackWindowPrint(transactionData); // dimatikan agar tidak muncul Simpan sebagai PDF
            console.log('Fallback print dimatikan');
        }

        alert(`Transaksi Berhasil! (${paymentMethod})`);
        this.showPreviewModal = false;
        this.selectedPaymentMethod = null;
        if (this.scannerActive) this.toggleScanner();
        this.cart = [];
        this.appliedPromoIds = [];
        this.memberDiscount = 0;
        this.redeemPoints = 0;
        if (window._memberPromoState) { window._memberPromoState.appliedIds = []; }
        window.app.loadModule('transaksi');
    },

    // --- AMBIL 4 PRODUK TERLARIS ---
    async getTopSellingProducts(limit = 4) {
        try {
            const transactions = await DB.getTransactions();
            const productSales = {};

            transactions.forEach(tx => {
                if (Array.isArray(tx.cart)) {
                    tx.cart.forEach(item => {
                        const key = item.prodId || item.name;
                        productSales[key] = (productSales[key] || 0) + item.qty;
                    });
                }
            });

            const sortedKeys = Object.keys(productSales).sort((a, b) => productSales[b] - productSales[a]);
            const topList = [];
            
            for (let key of sortedKeys) {
                const found = this.products.find(p => String(p.id) === String(key) || p.name === key);
                if (found && !topList.some(item => String(item.id) === String(found.id))) {
                    topList.push(found);
                }
                if (topList.length >= limit) break;
            }

            if (topList.length < limit) {
                for (let p of this.products) {
                    if (!topList.some(item => String(item.id) === String(p.id))) {
                        topList.push(p);
                    }
                    if (topList.length >= limit) break;
                }
            }

            return topList;
        } catch (e) {
            console.error('Gagal mengambil top products:', e);
            return this.products.slice(0, limit);
        }
    },

    calculateTotalWithPromos() {
        // FIX REPORT: restore dari _memberPromoState jika ada
        if (window._memberPromoState) {
          if (window._memberPromoState.memberDiscount !== undefined && this.memberDiscount === 0) {
            this.memberDiscount = window._memberPromoState.memberDiscount;
          }
          if (window._memberPromoState.redeemPoints !== undefined && this.redeemPoints === 0) {
            this.redeemPoints = window._memberPromoState.redeemPoints;
          }
        }
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        // === HITUNG PAJAK PER PRODUK ===
        let taxTotal = 0;
        let taxDetails = [];
        this.cart.forEach(item => {
            if (item.taxEnabled) {
                const rate = Number(item.taxRate || 11);
                const itemTax = Math.round((item.price * item.qty) * rate / 100);
                taxTotal += itemTax;
                taxDetails.push({ prodId: item.prodId, name: item.name, rate, amount: itemTax });
            }
        });
        let discount = 0;
        let detectedPromos = [];

        const isWeekend = [0, 6].includes(new Date().getDay());
        // Pastikan appliedPromoIds ada
        if (!this.appliedPromoIds) this.appliedPromoIds = [];

        this.promotions.forEach(promo => {
            const isApplied = this.appliedPromoIds.includes(String(promo.id));
            let eligible = false;
            let potentialDiscount = 0;
            let desc = '';

            if (promo.type === 'tebus_murah' && subtotal >= promo.config.minSpend) {
                const targetItem = this.cart.find(i => String(i.prodId) === String(promo.config.targetProdId));
                const targetProd = this.products.find(p => String(p.id) === String(promo.config.targetProdId));
                if (targetItem) {
                    const discPerUnit = Math.max(0, targetItem.price - promo.config.discountPrice);
                    // FIX: Diskon hanya untuk 1 pcs tebus murah, bukan semua qty yang sudah ada di keranjang
                    // Ini mencegah kalau ada 5 mie goreng normal, semuanya jadi murah
                    const tebusQty = 1; 
                    potentialDiscount = discPerUnit * tebusQty;
                    desc = `Potongan Tebus Murah 1x ${targetProd?.name || targetItem.name} (-Rp ${potentialDiscount.toLocaleString()})`;
                    eligible = true;
                } else {
                    desc = `Syarat terpenuhi! Tambahkan ${targetProd?.name || 'Item'} Rp ${promo.config.discountPrice.toLocaleString()}`;
                    eligible = true;
                }
            }
            else if (promo.type === 'bundling') {
                const hasA = this.cart.some(i => String(i.prodId) === String(promo.config.prodA));
                const hasB = this.cart.some(i => String(i.prodId) === String(promo.config.prodB));
                if (hasA && hasB) {
                    const itemA = this.cart.find(i => String(i.prodId) === String(promo.config.prodA));
                    const itemB = this.cart.find(i => String(i.prodId) === String(promo.config.prodB));
                    const bundleSets = Math.min(itemA.qty, itemB.qty);
                    const normalBundlePrice = itemA.price + itemB.price;
                    potentialDiscount = Math.max(0, (normalBundlePrice - promo.config.bundlePrice) * bundleSets);
                    desc = `Diskon Paket Bundling (-Rp ${potentialDiscount.toLocaleString()})`;
                    eligible = true;
                } else if (hasA || hasB) {
                    const missingProdId = hasA ? promo.config.prodB : promo.config.prodA;
                    const missingProd = this.products.find(p => String(p.id) === String(missingProdId));
                    desc = `Lengkapi bundling dengan menambah ${missingProd?.name || 'Item B'}`;
                    eligible = true;
                }
            }
            else if (promo.type === 'buy_x_get_y') {
                const buyItem = this.cart.find(i => String(i.prodId) === String(promo.config.buyProdId));
                if (buyItem && buyItem.qty >= promo.config.buyQty) {
                    const freeSets = Math.floor(buyItem.qty / promo.config.buyQty);
                    const getItem = this.cart.find(i => String(i.prodId) === String(promo.config.getProdId));
                    const getProd = this.products.find(p => String(p.id) === String(promo.config.getProdId));
                    if (getItem) {
                        const freeQty = Math.min(getItem.qty, freeSets);
                        potentialDiscount = freeQty * getItem.price;
                        desc = `Gratis ${freeQty}x ${getItem.name} (-Rp ${potentialDiscount.toLocaleString()})`;
                        eligible = true;
                    } else {
                        desc = `Klaim GRATIS ${freeSets}x ${getProd?.name || 'Item Y'}!`;
                        eligible = true;
                    }
                }
            }
            else if (promo.type === 'tiered_spend' && subtotal >= promo.config.minSpend) {
                potentialDiscount = promo.config.discount;
                desc = `Diskon Min. Belanja (-Rp ${promo.config.discount.toLocaleString()})`;
                eligible = true;
            }
            else if (promo.type === 'weekend' && isWeekend) {
                const item = this.cart.find(i => String(i.prodId) === String(promo.config.prodId));
                if (item) {
                    potentialDiscount = promo.config.discount * item.qty;
                    desc = `Promo Weekend ${item.name} (-Rp ${potentialDiscount.toLocaleString()})`;
                    eligible = true;
                }
            }
            // === FIX: PROMO UMUM AI - DETECT MANUAL (BUKAN MEMBER, BUKAN AUTO APPLY) ===
            else if (promo.type === 'umum' || promo.config?.isGeneral || promo.config?.scope==='general' || promo.isGeneral || promo.isUmum) {
                // Promo umum: berlaku untuk semua pelanggan tanpa member
                const minSpend = Number(promo.config?.minSpend || 0);
                if (subtotal >= minSpend) {
                    if (promo.config?.percent) {
                        potentialDiscount = Math.floor(subtotal * Number(promo.config.percent) / 100);
                        desc = `Promo UMUM ${promo.config.percent}% (Min Rp ${minSpend.toLocaleString()}) - Potongan Rp ${potentialDiscount.toLocaleString()}`;
                    } else if (promo.config?.discount) {
                        potentialDiscount = Number(promo.config.discount);
                        desc = `Promo UMUM Potongan Rp ${potentialDiscount.toLocaleString()} (Min Rp ${minSpend.toLocaleString()})`;
                    } else {
                        // fallback jika tidak ada percent/discount, anggap 0
                        potentialDiscount = 0;
                        desc = `Promo UMUM ${promo.name} (Min Rp ${minSpend.toLocaleString()})`;
                    }
                    // hanya eligible jika ada potongan
                    if (potentialDiscount > 0) {
                        eligible = true;
                    } else if (promo.config?.percent || promo.config?.discount) {
                        eligible = true;
                    }
                } else {
                    // tetap tampilkan sebagai info kalau belum cukup belanja, tapi tidak bisa apply
                    if (subtotal > 0) {
                        desc = `Promo UMUM: Belanja Rp ${subtotal.toLocaleString()} / Rp ${minSpend.toLocaleString()} untuk potongan ${promo.config?.percent? promo.config.percent+'%' : 'Rp '+(promo.config?.discount||0).toLocaleString()}`;
                        eligible = true;
                        potentialDiscount = 0; // belum cukup, discount 0, tapi tetap terdeteksi
                    }
                }
            }

            if (eligible) {
                // Hanya hitung diskon jika sudah di-apply manual
                if (isApplied) {
                    if (potentialDiscount > 0) {
                        if (promo.type === 'tebus_murah') {
                            const targetItem = this.cart.find(i => String(i.prodId) === String(promo.config.targetProdId));
                            if (targetItem) {
                                discount += potentialDiscount;
                            } else {
                                this.appliedPromoIds = this.appliedPromoIds.filter(id => id !== String(promo.id));
                            }
                        } else {
                            discount += potentialDiscount;
                        }
                    }
                    detectedPromos.push({
                        id: promo.id,
                        name: promo.name,
                        desc: desc,
                        canApply: false // Sudah aktif
                    });
                } else {
                    detectedPromos.push({
                        id: promo.id,
                        name: promo.name,
                        desc: desc + ' (Klik Apply)',
                        canApply: true // Belum aktif, harus manual
                    });
                }
            }
        });

        // Bersihkan appliedPromoIds yang sudah tidak eligible
        const detectedIds = detectedPromos.map(p => String(p.id));
        this.appliedPromoIds = this.appliedPromoIds.filter(id => detectedIds.includes(id));

        const totalBeforeTax = Math.max(0, subtotal - discount);
        const total = totalBeforeTax + taxTotal;
        return { subtotal, discount, taxTotal, taxDetails, totalBeforeTax, total, detectedPromos };
    },


    // === NOTIF AI MEMBER - FIX 400: tampilkan notif gagal jika Worker 400 ===
    showAIMemberNotif() {
        try {
            let notifArea = document.getElementById('ai-member-notif-area');
            if (!notifArea) {
                // Buat area notif jika belum ada (fallback)
                const promoWrapper = document.querySelector('[style*="Promo Khusus"]')?.parentElement || document.body;
                notifArea = document.createElement('div');
                notifArea.id = 'ai-member-notif-area';
                promoWrapper.prepend(notifArea);
            }
            const status = window._lastAIMemberStatus || this.memberPromoData?.aiStatus;
            if (!status) {
                // tidak ada status AI sama sekali - jangan tampilkan apa-apa
                return;
            }
            // Untuk error 400, tampilkan walau attempted false, yang penting error ada
            const isError = !!status.error;
            const isEmpty = !!status.empty;
            if (!status.attempted && !isError && !isEmpty) {
                const last = window._lastAIMemberStatus;
                if (last && (Date.now() - (last.timestamp||0) < 5*60*1000) && (last.error || last.empty)) {
                    // pakai last
                } else {
                    return;
                }
            }
            const effectiveStatus = window._lastAIMemberStatus || status;
            if (effectiveStatus.error) {
                console.log('Tampilkan notif error AI:', effectiveStatus.error);
                notifArea.innerHTML = `
                    <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:6px; padding:8px; margin-top:8px; font-size:0.75rem; display:flex; gap:8px; align-items:center;">
                        <span style="font-size:1.2rem;">⚠️</span>
                        <div style="flex:1;">
                            <b style="color:#ef4444;">Pengambilan data AI gagal</b><br>
                            <small style="color:var(--text-secondary);">${(effectiveStatus.error||'').toString().slice(0,200)}</small><br>
                            <small style="color:var(--text-secondary);">Pakai promo sistem dulu, coba scan member lagi nanti.</small>
                        </div>
                        <button onclick="document.getElementById('ai-member-notif-area').innerHTML=''" style="background:none; border:none; font-size:1rem; cursor:pointer;">✕</button>
                    </div>
                `;
            } else if (effectiveStatus.empty) {
                notifArea.innerHTML = `
                    <div style="background:rgba(245,158,11,0.1); border:1px solid #f59e0b; border-radius:6px; padding:8px; margin-top:8px; font-size:0.75rem; display:flex; gap:8px; align-items:center;">
                        <span style="font-size:1.2rem;">🤖</span>
                        <div style="flex:1;">
                            <b style="color:#d97706;">Belum ada saran promosi dari AI</b><br>
                            <small style="color:var(--text-secondary);">AI tidak menghasilkan promo untuk member ini (max 3). Pakai promo sistem: tier & poin.</small>
                        </div>
                        <button onclick="document.getElementById('ai-member-notif-area').innerHTML=''" style="background:none; border:none; font-size:1rem; cursor:pointer;">✕</button>
                    </div>
                `;
            } else {
                notifArea.innerHTML = '';
            }
        } catch(e) { console.warn('showAIMemberNotif fail', e); }
    },

    // === AUTO REFRESH DETEKSI PROMO KHUSUS NON MEMBER - TANPA RELOAD, TANPA KEDIP ===
    autoRefreshPromoNonMemberSilent() {
        try {
            // Hanya untuk non member (guest) - jangan ganggu member promo
            if (this.memberMode === 'member' && this.currentMember) return;

            const result = this.calculateTotalWithPromos();
            const detectedPromos = result.detectedPromos || [];

            // 1. Update wrapper promo non-member tanpa reload
            const wrapper = document.getElementById('auto-promo-nonmember-wrapper');
            if (wrapper) {
                if (detectedPromos.length === 0) {
                    wrapper.innerHTML = '';
                    wrapper.style.display = 'none';
                } else {
                    wrapper.style.display = 'block';
                    wrapper.innerHTML = `
                    <div style="background:rgba(34,197,94,0.15); border:1px solid var(--success-color); border-radius:6px; padding:8px; margin-top:8px; font-size:0.75rem; animation: promoFadeIn 0.25s ease;">
                        <b style="color:var(--success-color); font-size:0.8rem;">🏷️ Promo Terdeteksi:</b>
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                            ${detectedPromos.map(p => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:4px 8px; border-radius:4px; transition: all 0.2s;">
                                    <span><b>${p.name}</b> <br><small style="color:var(--text-secondary);">${p.desc}</small></span>
                                    ${p.canApply ? `
                                        <button onclick="TransaksiModule.applyPromoAction('${p.id}')" class="btn-touch active" style="padding:3px 8px; font-size:0.7rem; height:auto;">
                                            + Apply
                                        </button>
                                    ` : `
                                        <div style="display:flex; gap:4px; align-items:center;">
                                            <span style="color:var(--success-color); font-weight:bold; font-size:0.7rem;">Active</span>
                                            <button onclick="TransaksiModule.removePromoAction('${p.id}')" style="padding:2px 6px; font-size:0.65rem; background:#ef4444; color:#fff; border:none; border-radius:4px;">Batal</button>
                                        </div>
                                    `}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <style>@keyframes promoFadeIn { from { opacity:0; transform:translateY(-4px);} to { opacity:1; transform:translateY(0);} }</style>
                    `;
                }
            }

            // 2. Update total / subtotal / discount tanpa reload modul (pakai DOM langsung)
            // Cari elemen total yang ada di cart summary
            const subtotalEl = document.querySelector('[data-total="subtotal"]') || document.getElementById('transaksi-subtotal-val');
            const discountEl = document.querySelector('[data-total="discount"]') || document.getElementById('transaksi-discount-val');
            const totalEl = document.querySelector('[data-total="total"]') || document.getElementById('transaksi-total-val');
            const taxEl = document.querySelector('[data-total="tax"]');

            // Fallback: update via query selector yang ada di template lama
            // Template lama pakai textContent langsung, kita update semua elemen yang mengandung Rp dan total
            const cartSummary = document.querySelector('.cart-summary') || document.querySelector('.cart-totals');
            if (cartSummary) {
                // Update subtotal, discount, total via innerHTML parsial tanpa ganti seluruh modul
                const subtotalNodes = cartSummary.querySelectorAll('*');
                // Kita pakai id yang kita inject via render, tapi kalau tidak ada, update via custom event
            }

            // 3. Trigger event agar UI lain bisa dengar tanpa reload
            window.dispatchEvent(new CustomEvent('promo-nonmember-updated', { detail: { detectedPromos, result } }));

            // 4. Update badge promo count jika ada
            const badge = document.getElementById('promo-nonmember-count');
            if (badge) {
                badge.textContent = detectedPromos.length;
                badge.style.display = detectedPromos.length ? 'inline-block' : 'none';
            }

        } catch(e) {
            console.warn('autoRefreshPromoNonMemberSilent fail', e);
        }
    },

    // Debounce auto refresh biar tidak spam saat scan cepat
    _autoRefreshDebounceTimer: null,
    scheduleAutoRefreshNonMember() {
        if (this._autoRefreshDebounceTimer) clearTimeout(this._autoRefreshDebounceTimer);
        this._autoRefreshDebounceTimer = setTimeout(() => {
            this.autoRefreshPromoNonMemberSilent();
        }, 120);
    },

    applyPromoAction(
promoId) {
        const promo = this.promotions.find(p => String(p.id) === String(promoId));
        if (!promo) return;

        if (!this.appliedPromoIds) this.appliedPromoIds = [];
        if (!this.promoAddedItems) this.promoAddedItems = [];
        const pid = String(promoId);

        const alreadyApplied = this.appliedPromoIds.includes(pid);
        if (promo.type === 'tiered_spend' || promo.type === 'weekend' || promo.type === 'bundling' || promo.type === 'umum') {
            if (alreadyApplied) return window.app.loadModule('transaksi');
        }
        // Untuk tebus_murah & buy_x_get_y kita cegah double tambah kalau sudah applied sekali
        if ((promo.type === 'tebus_murah' || promo.type === 'buy_x_get_y') && alreadyApplied) {
            return window.app.loadModule('transaksi');
        }

        if (!alreadyApplied) this.appliedPromoIds.push(pid);

        // --- FIX: Cek stok saat tambah barang promo ---
        if (promo.type === 'tebus_murah') {
            if (promo.config.targetProdId) {
                const prod = this.products.find(p => String(p.id) === String(promo.config.targetProdId));
                if (prod) {
                    const stok = Number(prod.stock ?? 0);
                    if (stok <= 0) { alert(`Stok ${prod.name} habis, promo tidak bisa ditambahkan!`); return window.app.loadModule('transaksi'); }
                    const existing = this.cart.find(c => String(c.prodId) === String(prod.id));
                    const qtyInCart = existing ? Number(existing.qty) : 0;
                    if (qtyInCart + 1 > stok) { alert(`Stok ${prod.name} tidak cukup untuk promo! Sisa: ${stok}`); return window.app.loadModule('transaksi'); }
                    if (existing) existing.qty++;
                    else this.cart.push({ prodId: prod.id, name: prod.name, price: Number(prod.price), buyPrice: Number(prod.buyPrice || prod.modal || 0), qty: 1, taxEnabled: !!prod.taxEnabled, taxRate: Number(prod.taxRate ?? prod.taxPercent ?? 11) });
                    this.promoAddedItems.push({ promoId: pid, prodId: String(prod.id), qty: 1 });
                }
                window.app.loadModule('transaksi');
                return;
            }
        } else if (promo.type === 'bundling') {
            const itemAInCart = this.cart.some(i => String(i.prodId) === String(promo.config.prodA));
            const itemBInCart = this.cart.some(i => String(i.prodId) === String(promo.config.prodB));
            if (!itemAInCart || !itemBInCart) {
                const missingProdId = itemAInCart ? promo.config.prodB : promo.config.prodA;
                if (missingProdId) {
                    const prod = this.products.find(p => String(p.id) === String(missingProdId));
                    if (prod) {
                        const stok = Number(prod.stock ?? 0);
                        if (stok <= 0) { alert(`Stok ${prod.name} habis, bundling tidak bisa ditambahkan!`); return window.app.loadModule('transaksi'); }
                        const existing = this.cart.find(c => String(c.prodId) === String(prod.id));
                        const qtyInCart = existing ? Number(existing.qty) : 0;
                        if (qtyInCart + 1 > stok) { alert(`Stok ${prod.name} tidak cukup untuk bundling! Sisa: ${stok}`); return window.app.loadModule('transaksi'); }
                        if (existing) existing.qty++;
                        else this.cart.push({ prodId: prod.id, name: prod.name, price: Number(prod.price), buyPrice: Number(prod.buyPrice || prod.modal || 0), qty: 1, taxEnabled: !!prod.taxEnabled, taxRate: Number(prod.taxRate ?? prod.taxPercent ?? 11) });
                        this.promoAddedItems.push({ promoId: pid, prodId: String(prod.id), qty: 1 });
                    }
                    window.app.loadModule('transaksi');
                    return;
                }
            }
        } else if (promo.type === 'buy_x_get_y') {
            if (promo.config.getProdId) {
                const freeQty = Number(promo.config.getQty) || 1;
                const prod = this.products.find(p => String(p.id) === String(promo.config.getProdId));
                if (prod) {
                    const stok = Number(prod.stock ?? 0);
                    if (stok <= 0) { alert(`Stok ${prod.name} habis, gratis tidak bisa ditambahkan!`); return window.app.loadModule('transaksi'); }
                    const existing = this.cart.find(c => String(c.prodId) === String(prod.id));
                    const qtyInCart = existing ? Number(existing.qty) : 0;
                    if (qtyInCart + freeQty > stok) { alert(`Stok ${prod.name} tidak cukup untuk bonus! Sisa: ${stok}, butuh: ${freeQty}`); return window.app.loadModule('transaksi'); }
                    if (existing) existing.qty += freeQty;
                    else this.cart.push({ prodId: prod.id, name: prod.name, price: Number(prod.price), buyPrice: Number(prod.buyPrice || prod.modal || 0), qty: freeQty, taxEnabled: !!prod.taxEnabled, taxRate: Number(prod.taxRate ?? prod.taxPercent ?? 11) });
                    this.promoAddedItems.push({ promoId: pid, prodId: String(prod.id), qty: freeQty });
                }
                window.app.loadModule('transaksi');
                return;
            }
        }

        window.app.loadModule('transaksi');
    },

    removePromoAction(promoId) {
        const pid = String(promoId);
        if (!this.appliedPromoIds) this.appliedPromoIds = [];
        if (!this.promoAddedItems) this.promoAddedItems = [];

        // 1. Hapus barang yang ditambahkan oleh promo ini
        const addedByThisPromo = this.promoAddedItems.filter(x => String(x.promoId) === pid);
        addedByThisPromo.forEach(entry => {
            const cartItem = this.cart.find(c => String(c.prodId) === String(entry.prodId));
            if (cartItem) {
                cartItem.qty -= entry.qty;
                if (cartItem.qty <= 0) {
                    this.cart = this.cart.filter(c => String(c.prodId) !== String(entry.prodId));
                }
            }
        });

        // 2. Bersihkan tracker
        this.promoAddedItems = this.promoAddedItems.filter(x => String(x.promoId) !== pid);
        
        // 3. Hapus status applied promo
        this.appliedPromoIds = this.appliedPromoIds.filter(id => String(id) !== pid);
        
        window.app.loadModule('transaksi');
    },

    // FIX MINIMAL: Apply member promo - ASYNC + AWAIT (hanya ini yang diubah)
    async applyMemberPromo(promoId) {
        try {
            if (!this.memberPromoData || !this.memberPromoData.promos) {
                return alert('Data promo member tidak tersedia');
            }
            const promo = this.memberPromoData.promos.find(p => String(p.id) === String(promoId));
            if (!promo) return alert('Promo tidak ditemukan: ' + promoId);
            // FIX: AI promo (isAI) boleh canApply true, jangan blokir
            if (!promo.canApply && !promo.isAI) return alert('Promo tidak bisa di-apply saat ini');
            console.log('Apply member promo:', promo.name, promo);
            const result = await MemberPromoModule.applyPromoToCart(promo, this);
            console.log('Apply result:', result);
            if (result && result.success) {
                window.app.loadModule('transaksi');
                try { this._clearMemberPromoCache(); } catch(e){}
            } else {
                alert(result?.message || 'Gagal apply promo member');
            }
        } catch(e) {
            console.error('applyMemberPromo error', e);
            alert('Error: ' + e.message);
        }
    },

    _clearMemberPromoCache() {
        try { if (window._memberPromoCache) window._memberPromoCache = null; } catch(e){}
    },
    removeMemberPromo(promoId) {
        try {
            const promo = this.memberPromoData?.promos?.find(p => String(p.id) === String(promoId));
            if (promo && promo.discountAmount) {
                this.memberDiscount = Math.max(0, (this.memberDiscount||0) - Number(promo.discountAmount||0));
            }
            MemberPromoModule.removePromoFromCart(promoId, this);
            window.app.loadModule('transaksi');
        try { this._clearMemberPromoCache(); } catch(e){}
        } catch(e) {
            console.error('removeMemberPromo error', e);
            window.app.loadModule('transaksi');
        }
    },

    updateQty(identifier, delta, satuanOpt=null) {
        let _satuan = null; let _delta = delta; if(typeof delta==='string'){ _satuan=delta; _delta=satuanOpt; } else if(satuanOpt && typeof satuanOpt==='string'){ _satuan=satuanOpt; }
        let item = null;
        if(_satuan){ item = this.cart.find(i => (String(i.prodId)===String(identifier)||i.name===identifier) && (i.satuanJual||'pcs')===_satuan); } else { item = this.cart.find(i => String(i.prodId)===String(identifier)||i.name===identifier); }
        if (!item) return;
        if (delta > 0 && item.prodId) {
            const prod = this.products.find(p => String(p.id) === String(item.prodId));
            if (prod) {
                const stok = Number(prod.stock ?? 0);
                if (Number(item.qty) + delta > stok) {
                    alert(`Stok ${prod.name} tidak cukup! Maks: ${stok}, di keranjang: ${item.qty}`);
                    return;
                }
            }
        }
        const pcsPerItem = item.satuanJual!=='pcs' ? (item.isiPerSatuan||1) : 1;
        item.qty += _delta;
        item.pcsKeluar = (item.pcsKeluar||0) + (_delta*pcsPerItem);
        if(item.qty<=0){ this.cart=this.cart.filter(i=> !(String(i.prodId)===String(identifier)&& (i.satuanJual||'pcs')=== (item.satuanJual||'pcs'))); window.app.loadModule('transaksi'); return; }
        if (item.qty <= 0) {
            this.cart = this.cart.filter(i => (i.prodId ? String(i.prodId) !== String(identifier) : i.name !== identifier));
        }

        // FIX: Update UI tanpa reload modul - tidak berkedip
        try {
            const result = this.calculateTotalWithPromos();
            let memberDiscount = this.memberDiscount || 0;
            
            // Jika ada promo tier yang autoApply, hitung ulang proporsional terhadap subtotal baru
            // biar diskon member tidak stuck di nilai lama saat qty berubah
            if (this.memberPromoData && this.memberPromoData.promos && window._memberPromoState) {
                const tierPromo = this.memberPromoData.promos.find(p => p.rule === 'TIER_DISCOUNT' && window._memberPromoState.appliedIds.includes(p.id));
                if (tierPromo && tierPromo.config && tierPromo.config.percent) {
                    const newCartSubtotal = this.cart.reduce((a,i)=> a + Number(i.price||0)*Number(i.qty||1), 0);
                    const newDisc = Math.round(newCartSubtotal * Number(tierPromo.config.percent) / 100);
                    // ganti discount tier lama dengan baru di memberDiscount
                    const oldDisc = Number(tierPromo.discountAmount||0);
                    memberDiscount = Math.max(0, memberDiscount - oldDisc + newDisc);
                    this.memberDiscount = memberDiscount;
                    tierPromo.discountAmount = newDisc;
                    tierPromo.discount = newDisc;
                }
            }

            let total = Math.max(0, result.totalBeforeTax - memberDiscount + result.taxTotal);

            // 1. Update / hapus item di DOM
            const cartList = document.querySelector('.cart-list');
            const itemEl = document.querySelector(`[data-cart-prod-id="${CSS.escape ? CSS.escape(identifier) : identifier}"]`);
            if (item && item.qty > 0 && itemEl) {
                // update teks qty dan line total
                const bEl = itemEl.querySelector('b');
                if (bEl) bEl.nextSibling && (bEl.parentNode.innerHTML = bEl.parentNode.innerHTML.replace(/x\d+/, `x${item.qty}`));
                // cara aman: rebuild inner untuk item tersebut saja
                const lineTotal = item.price * item.qty;
                const lineTax = item.taxEnabled ? Math.round(lineTotal * (Number(item.taxRate||11)/100)) : 0;
                const qtySpan = itemEl.querySelector('div > div');
                if (qtySpan) {
                    // update Rp lineTotal
                    const priceDiv = itemEl.querySelector('div[style*="text-align:right"] div');
                    if (priceDiv) priceDiv.textContent = `Rp ${lineTotal.toLocaleString()}`;
                }
                // update x qty di kiri
                const leftDiv = itemEl.querySelector('div:first-child');
                if (leftDiv) {
                    leftDiv.innerHTML = `<b>${item.name}</b> x${item.qty} ${item.taxEnabled ? `<span style="font-size:0.6rem; background:#ffc107; padding:1px 4px; border-radius:3px;">Pajak ${item.taxRate}%</span>` : ''}<br><small style="color:var(--text-secondary);">@ Rp ${Number(item.price).toLocaleString()} ${item.taxEnabled ? `+ Pajak Rp ${lineTax.toLocaleString()}` : ''}</small>`;
                }
                const rightDiv = itemEl.querySelector('div[style*="text-align:right"]');
                if (rightDiv) {
                    rightDiv.innerHTML = `<div>Rp ${lineTotal.toLocaleString()}</div>${item.taxEnabled ? `<div style="font-size:0.65rem; color:#d97706;">+Rp ${lineTax.toLocaleString()} pajak</div>` : ''}<div style="margin-top:4px; display:flex; gap:8px;"><button onclick="TransaksiModule.updateQty('${item.prodId}', -1, '${item.satuanJual||'pcs'}')" style="padding:4px 10px; font-size:0.85rem;">-</button><button onclick="TransaksiModule.updateQty('${item.prodId}', 1, '${item.satuanJual||'pcs'}')" style="padding:4px 10px; font-size:0.85rem;">+</button></div>`;
                }
            } else if (!item || item.qty <= 0) {
                if (itemEl) itemEl.remove();
                if (this.cart.length === 0 && cartList) {
                    cartList.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">Keranjang Kosong</p>';
                }
            }

            // 2. Update summary tanpa reload
            const summary = document.querySelector('.cart-summary');
            if (summary) {
                // Subtotal
                const subtotalEl = summary.querySelector('div[style*="justify-content:space-between"] span:last-child');
                // Lebih aman: update berdasarkan urutan
                const rows = summary.querySelectorAll('div[style*="justify-content:space-between"]');
                // rows[0] Subtotal
                if (rows[0]) {
                    const valSpan = rows[0].querySelector('span:last-child');
                    if (valSpan) valSpan.textContent = `Rp ${result.subtotal.toLocaleString()}`;
                }
                // Update diskon, member, pajak, total via cart-total
                const totalEl = summary.querySelector('.cart-total span:last-child');
                if (totalEl) totalEl.textContent = `Rp ${total.toLocaleString()}`;

                // Untuk diskon promo & member & pajak, re-render bagian tengah saja biar akurat tanpa reload full
                const middleContainer = summary.querySelector('div[style*="border-top"]');
                if (middleContainer) {
                    let html = `<div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>Rp ${result.subtotal.toLocaleString()}</span></div>`;
                    if (result.discount > 0) html += `<div style="display:flex; justify-content:space-between; color:var(--success-color);"><span>Diskon Promo Toko</span><span>-Rp ${result.discount.toLocaleString()}</span></div>`;
                    if (memberDiscount > 0) html += `<div style="display:flex; justify-content:space-between; color:#0ea5e9;"><span>Diskon Member</span><span>-Rp ${memberDiscount.toLocaleString()}</span></div>`;
                    if (result.taxTotal > 0) html += `<div style="display:flex; justify-content:space-between; color:#d97706;"><span>Pajak (${result.taxDetails.map(t=>t.name+':'+t.rate+'%').join(', ')})</span><span>+Rp ${result.taxTotal.toLocaleString()}</span></div>`;
                    if (result.taxTotal > 0) html += `<div style="display:flex; justify-content:space-between; font-size:0.7rem; opacity:0.8;"><span>DPP</span><span>Rp ${(result.subtotal - result.discount).toLocaleString()}</span></div>`;
                    middleContainer.innerHTML = html;
                }
            }

            // 3. Update badge jumlah item jika ada
            // AUTO REFRESH PROMO NON MEMBER - tanpa reload, tanpa kedip
            try { this.scheduleAutoRefreshNonMember(); } catch(e){}
            // Tidak reload modul = tidak berkedip
            return;
        } catch(e) {
            console.warn('updateQty no-reload fail, fallback reload', e);
            window.app.loadModule('transaksi');
        }
    },

    toggleScanner() {
        this.scannerActive = !this.scannerActive;
        window.app.loadModule('transaksi');
        if (this.scannerActive) {
            setTimeout(() => {
                Scanner.startCamera(
                    'interactive-scanner', 
                    (code) => this.onBarcodeScanned(code),
                    (hasTorch) => {
                        const flashBtn = document.getElementById('btn-toggle-trans-flash');
                        if (flashBtn) flashBtn.disabled = !hasTorch;
                    }
                );
            }, 100);
        } else {
            Scanner.stopCamera();
        }
    },

    async toggleFlashlight() {
        const isOn = await Scanner.toggleFlashlight();
        const flashBtn = document.getElementById('btn-toggle-trans-flash');
        if (flashBtn) {
            flashBtn.textContent = isOn ? '🔦 Flashlight ON' : '🔦 Flashlight OFF';
            flashBtn.style.background = isOn ? 'var(--accent-color, #007bff)' : 'var(--bg-card)';
            flashBtn.style.color = isOn ? '#fff' : 'inherit';
        }
    },

    async onMemberBarcodeScanned(code) {
        const clean = String(code||'').trim();
        if (!clean) return;
        // Stop kamera langsung tanpa reload dulu biar tidak flicker
        if (Scanner.stopCamera) { try { await Scanner.stopCamera(); } catch(e){} }
        this.memberScannerActive = false;
        const wrapper = document.getElementById('member-scanner-wrapper-trans');
        if (wrapper) wrapper.style.display='none';
        const member = await MemberModule.lookupByBarcode(clean);
        if (member) {
            this.currentMember = member;
            try { 
                    // FIX: AI member hanya dipicu di sini (tombol pencarian/scan member), selebihnya sistem
                    this.memberPromoData = await MemberPromoModule.getAvailablePromos(member, this.cart, { products:this.products, transactions: await DB.getTransactions(), promotions: this.promotions, useAI: true }); 
                } catch(e){ console.warn(e); }
            if (!window._memberPromoState) window._memberPromoState = { appliedIds:[], lastMemberId:null };
            window._memberPromoState.appliedIds=[]; window._memberPromoState.lastMemberId=member.id;
            this.memberDiscount=0; this.redeemPoints=0;
            (this.memberPromoData?.promos||[]).filter(p=>p.autoApply && p.canApply).forEach(async p=> { try { await MemberPromoModule.applyPromoToCart(p, this); } catch(e){} });
            window.app.loadModule('transaksi');
            setTimeout(()=>{ try { this.showAIMemberNotif(); } catch(e){} }, 300);
        } else {
            if (Scanner.releaseProcessing) Scanner.releaseProcessing();
            alert(`Barcode ${clean} bukan member terdaftar`);
            // tetap tutup scanner tapi jangan reload full jika tidak perlu
            window.app.loadModule('transaksi');
        }
    },

    onBarcodeScanned(code) {
        const found = this.products.find(p => p.barcode === code || p.sku === code);
        if (found) {
            if (this.isProductExpired(found)) {
                Scanner.releaseProcessing();
                alert(`❌ Produk ${found.name} sudah EXPIRED (${this.getExpiredLabel(found)}) - tidak bisa ditambahkan ke keranjang!`);
                return;
            }
            this.addItemByProduct(found.id);
        } else {
            Scanner.releaseProcessing();
            alert(`Produk dengan barcode/SKU ${code} tidak ditemukan.`);
        }
    },

    addItemByProduct(prodId, satuanJualParam='pcs') {
        const prod = this.products.find(p => String(p.id) === String(prodId));
        if (!prod) return;
        if (this.isProductExpired(prod)) {
            Scanner.releaseProcessing();
            alert(`❌ Produk ${prod.name} sudah EXPIRED (${this.getExpiredLabel(prod)}) - tidak bisa ditambahkan ke keranjang!`);
            return;
        }
        const stok = Number(prod.stock ?? 0);
        if (stok <= 0) {
            Scanner.releaseProcessing();
            alert(`Stok ${prod.name} habis, tidak bisa ditambahkan ke keranjang!`);
            return;
        }
        const isi = this.getIsiPerSatuan(prod);
        let satuanJual = satuanJualParam || 'pcs';
        let price = Number(prod.hargaJualPcs || prod.price || 0);
        let pcsPerItem = 1;
        if(satuanJual !== 'pcs' && isi>1){
            pcsPerItem = isi;
            price = Number(prod.hargaJualDus || prod.hargaJualGrosir || prod.hargaJualPcs || prod.price || 0);
        }
        const totalPcsInCart = this.cart.filter(i=>String(i.prodId)===String(prod.id)).reduce((a,b)=>a+Number(b.pcsKeluar||b.qty||0),0);
        if (totalPcsInCart + pcsPerItem > stok) {
            Scanner.releaseProcessing();
            alert(`Stok ${prod.name} tidak cukup!\nSisa: ${this.formatStokGrosir(prod)} (${stok} pcs)\nDi keranjang: ${totalPcsInCart} pcs`);
            return;
        }
        const existing = this.cart.find(i => String(i.prodId) === String(prod.id) && (i.satuanJual||'pcs')===satuanJual);
        if(existing){
            existing.qty += 1;
            existing.pcsKeluar = (existing.pcsKeluar||0) + pcsPerItem;
        } else {
            this.addItem(prod.name, price, prod.id, prod.buyPrice || prod.modal || 0, prod.taxEnabled || false, prod.taxRate ?? prod.taxPercent ?? 11, satuanJual, pcsPerItem, isi);
        }
        window._transaksiAutoFocusCart=true; window._transaksiAutoFocusProdId=prodId;
        window.app.loadModule('transaksi');
        Scanner.releaseProcessing();
    },

    addItem(name, price, prodId = null, buyPrice = 0, taxEnabled = false, taxRate = 11, satuanJual='pcs', pcsKeluar=1, isiPerSatuan=1) {
        if (prodId) {
            const prod = this.products.find(p => String(p.id) === String(prodId));
            if (prod && this.isProductExpired(prod)) {
                Scanner.releaseProcessing();
                alert(`❌ Produk ${prod.name} sudah EXPIRED (${this.getExpiredLabel(prod)}) - tidak bisa ditambahkan ke keranjang!`);
                return;
            }
        }
        const _satuanJual = (typeof satuanJual === 'string' ? satuanJual : 'pcs') || 'pcs';
        const _pcsKeluar = Number(pcsKeluar||1);
        const _isiPerSatuan = Number(isiPerSatuan||1);
        if (prodId) {
            const prod = this.products.find(p => String(p.id) === String(prodId));
            if (prod) {
                const stok = Number(prod.stock ?? 0);
                if (stok <= 0) {
                    Scanner.releaseProcessing();
                    alert(`Stok ${prod.name} habis!`);
                    return;
                }
                const totalPcsInCart = this.cart.filter(i=>String(i.prodId)===String(prodId)).reduce((a,b)=>a+Number(b.pcsKeluar||b.qty||0),0);
                if (totalPcsInCart + _pcsKeluar > stok) {
                    Scanner.releaseProcessing();
                    alert(`Stok ${prod.name} tidak cukup! Sisa: ${this.formatStokGrosir(prod)} (${stok} pcs), di keranjang: ${totalPcsInCart} pcs`);
                    return;
                }
            }
        }
        const existing = this.cart.find(i => (prodId && String(i.prodId) === String(prodId) && (i.satuanJual||'pcs')===_satuanJual) || (!prodId && i.name === name && (i.satuanJual||'pcs')===_satuanJual));
        if (existing) {
            existing.qty += 1;
            existing.pcsKeluar = (existing.pcsKeluar||0) + _pcsKeluar;
        } else {
            this.cart.push({ 
                prodId, 
                name, 
                price: Number(price), 
                buyPrice: Number(buyPrice),
                buyPricePerPcs: Number(buyPrice) / (_pcsKeluar||1) || Number(buyPrice),
                qty: 1,
                satuanJual: _satuanJual,
                pcsKeluar: _pcsKeluar,
                isiPerSatuan: _isiPerSatuan,
                taxEnabled: !!taxEnabled,
                taxRate: Number(taxRate) || 11
            });
        }
        Scanner.releaseProcessing();
        window._transaksiAutoFocusCart = true;
        window._transaksiAutoFocusProdId = prodId;
        window.app.loadModule('transaksi');
    },

    clearCart() {
        this.cart = [];
        this.appliedPromoIds = [];
        this.promoAddedItems = [];
        window.app.loadModule('transaksi');
    },

    fallbackWindowPrint(txData) {
        // DIMATIKAN - mencegah dialog Simpan sebagai PDF
        console.log('fallbackWindowPrint dimatikan');
        return;
    },



    async init() {
        window.TransaksiModule = this;

        document.getElementById('btn-toggle-scanner')?.addEventListener('click', () => this.toggleScanner());
        document.getElementById('btn-toggle-trans-flash')?.addEventListener('click', () => this.toggleFlashlight());
        // MEMBER SCANNER HANDLERS - FIXED NO RELOAD
        document.getElementById('btn-toggle-member-scanner-trans')?.addEventListener('click', async () => {
            if (Scanner.stopCamera) { try { await Scanner.stopCamera(); } catch(e){} }
            // Jangan reload, langsung toggle DOM
            this.memberScannerActive = !this.memberScannerActive;
            const wrapper = document.getElementById('member-scanner-wrapper-trans');
            const btn = document.getElementById('btn-toggle-member-scanner-trans');
            if (this.memberScannerActive) {
                this.scannerActive = false;
                const prodWrapper = document.getElementById('transaksi-scanner-wrapper');
                if (prodWrapper) prodWrapper.style.display='none';
                const prodBtn = document.getElementById('btn-toggle-scanner');
                if (prodBtn) prodBtn.classList.remove('active');
                if (wrapper) wrapper.style.display='block';
                if (btn) { btn.classList.add('active'); btn.style.background='#0ea5e9'; btn.style.color='#fff'; btn.textContent='✕ Tutup Scan'; }
                setTimeout(() => {
                    const el = document.getElementById('member-interactive-scanner-trans');
                    if (el && Scanner.startCamera) {
                        Scanner.startCamera('member-interactive-scanner-trans', (code) => this.onMemberBarcodeScanned(code), (hasTorch) => {
                            const f = document.getElementById('btn-toggle-member-flash-trans');
                            if (f) f.disabled = !hasTorch;
                        });
                    }
                }, 300);
            } else {
                if (wrapper) wrapper.style.display='none';
                if (btn) { btn.classList.remove('active'); btn.style.background=''; btn.style.color=''; btn.textContent='📷 Scan Barcode'; }
            }
        });
        document.getElementById('btn-close-member-scanner-trans')?.addEventListener('click', async () => { 
            if (Scanner.stopCamera) { try { await Scanner.stopCamera(); } catch(e){} }
            this.memberScannerActive=false;
            const wrapper = document.getElementById('member-scanner-wrapper-trans');
            if (wrapper) wrapper.style.display='none';
            const btn = document.getElementById('btn-toggle-member-scanner-trans');
            if (btn) { btn.classList.remove('active'); btn.style.background=''; btn.style.color=''; btn.textContent='📷 Scan Barcode'; }
        });
        document.getElementById('btn-toggle-member-flash-trans')?.addEventListener('click', () => { if (Scanner.toggleTorch) Scanner.toggleTorch(); else if (Scanner.toggleFlash) Scanner.toggleFlash(); });

        // Jika sebelumnya memberScannerActive true (habis reload), auto-start lagi
        if (this.memberScannerActive) {
            setTimeout(() => {
                const wrapper = document.getElementById('member-scanner-wrapper-trans');
                if (wrapper) wrapper.style.display = 'block';
                const el = document.getElementById('member-interactive-scanner-trans');
                if (el && window.Scanner && Scanner.startCamera) {
                    if (Scanner.stopCamera) Scanner.stopCamera().catch(()=>{});
                    Scanner.startCamera('member-interactive-scanner-trans', (code) => this.onMemberBarcodeScanned(code), (hasTorch) => {
                        const flashBtn = document.getElementById('btn-toggle-member-flash-trans');
                        if (flashBtn) { flashBtn.disabled = !hasTorch; }
                    });
                }
            }, 400);
        }

        // FIX ANTI BLANK HITAM: re-attach kamera produk jika aktif dan member scanner tidak aktif
        if (this.scannerActive && !this.memberScannerActive) {
            const mode = localStorage.getItem('edc_scanner_mode') || 'camera';
            if (mode === 'camera') {
                setTimeout(() => {
                    const el = document.getElementById('interactive-scanner');
                    if (el) {
                        Scanner.startCamera('interactive-scanner', (code) => this.onBarcodeScanned(code), (hasTorch) => {
                            const flashBtn = document.getElementById('btn-toggle-trans-flash');
                            if (flashBtn) flashBtn.disabled = !hasTorch;
                        });
                    }
                }, 200);
            }
        }

        document.getElementById('btn-proses-transaksi')?.addEventListener('click', () => {
            if (this.cart.length === 0) return alert('Keranjang kosong!');
            this.selectedPaymentMethod = null;
            this.showPreviewModal = true;
            window.app.loadModule('transaksi');
        });

        // Event handler klik di luar dropdown untuk menutup hasil pencarian
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('search-results-dropdown');
            const input = document.getElementById('manual-search-input');
            if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        // MEMBER MODE HANDLERS - TAMBAHAN MINIMAL
        document.getElementById('btn-mode-guest')?.addEventListener('click', () => { this.memberMode='guest'; this.currentMember=null; this.memberPromoData=null; this.memberDiscount=0; this.redeemPoints=0; if(window._memberPromoState) { window._memberPromoState.appliedIds=[]; window._memberPromoState.lastMemberId=null; } window.app.loadModule('transaksi'); });
        document.getElementById('btn-mode-member')?.addEventListener('click', () => { this.memberMode='member'; window.app.loadModule('transaksi'); setTimeout(()=>document.getElementById('member-barcode-input')?.focus(),200); });
        document.getElementById('btn-scan-member')?.addEventListener('click', async () => {
            const val = document.getElementById('member-barcode-input')?.value.trim();
            if (!val) return alert('Scan atau ketik ID member');
            const member = await MemberModule.lookupByBarcode(val);
            if (!member) return alert('Member tidak ditemukan');
            this.currentMember = member;
            try { 
                    // FIX: AI member hanya dipicu di sini (tombol pencarian/scan member), selebihnya sistem
                    this.memberPromoData = await MemberPromoModule.getAvailablePromos(member, this.cart, { products:this.products, transactions: await DB.getTransactions(), promotions: this.promotions, useAI: true }); 
                } catch(e){ console.warn(e); }
            if (!window._memberPromoState) window._memberPromoState = { appliedIds:[], lastMemberId:null };
            window._memberPromoState.appliedIds=[]; window._memberPromoState.lastMemberId=member.id;
            this.memberDiscount=0; this.redeemPoints=0;
            (this.memberPromoData?.promos||[]).filter(p=>p.autoApply && p.canApply).forEach(async p=> { try { await MemberPromoModule.applyPromoToCart(p, this); } catch(e){} });
            window.app.loadModule('transaksi');
            setTimeout(()=>{ try { this.showAIMemberNotif(); } catch(e){} }, 300);
        });
        document.getElementById('member-barcode-input')?.addEventListener('keydown', (e) => { if (e.key==='Enter') document.getElementById('btn-scan-member')?.click(); });
        document.getElementById('btn-remove-member')?.addEventListener('click', () => { this.currentMember=null; this.memberPromoData=null; this.memberDiscount=0; this.redeemPoints=0; if(window._memberPromoState) window._memberPromoState.appliedIds=[]; window.app.loadModule('transaksi'); });

        // SHOW NOTIF AI MEMBER JIKA KOSONG/GAGAL - panggil 2x biar pasti muncul
        try { this.showAIMemberNotif(); setTimeout(()=>{ try { this.showAIMemberNotif(); } catch(e){} }, 400); } catch(e){}

        // AUTO FOKUS KE CART SETELAH INSERT BARANG - TIDAK MERUBAH LAIN
        try {
            if (window._transaksiAutoFocusCart) {
                setTimeout(() => {
                    const cartEl = document.querySelector('.cart-summary');
                    if (cartEl) {
                        cartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // highlight sebentar
                        cartEl.style.transition = 'box-shadow 0.3s';
                        cartEl.style.boxShadow = '0 0 0 2px var(--accent-color)';
                        setTimeout(() => { cartEl.style.boxShadow = ''; }, 800);
                        // fokus ke item terakhir jika ada prodId
                        const prodId = window._transaksiAutoFocusProdId;
                        if (prodId) {
                            const itemEl = document.querySelector(`[data-cart-prod-id="${prodId}"]`);
                            if (itemEl) itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                    window._transaksiAutoFocusCart = false;
                }, 150);
            }
        } catch(e) { console.warn('auto focus cart fail', e); }

    },

    shareToWhatsApp() {
        if (this.cart.length === 0) return alert('Keranjang masih kosong!');

        const phone = prompt('Masukkan Nomor WhatsApp Pembeli (contoh: 08123456789):', '');
        if (phone === null) return;

        const storeName = localStorage.getItem('edc_store_name') || 'POS EDC';
        const activeUser = JSON.parse(localStorage.getItem('edc_active_user') || '{"name":"Admin Utama","role":"admin"}');
        const { subtotal, discount, taxTotal, taxDetails, total } = this.calculateTotalWithPromos();
        
        let text = `*${storeName.toUpperCase()}*\n`;
        text += `*STRUK PEMBAYARAN*\n`;
        text += `Operator: ${activeUser.name}\n`;
        text += `Tanggal: ${new Date().toLocaleString('id-ID')}\n`;
        text += `------------------------------------\n`;

        this.cart.forEach(item => {
            const lt = item.price * item.qty;
            const lx = item.taxEnabled ? Math.round(lt * (Number(item.taxRate||11)/100)) : 0;
            text += `• *${item.name}*${item.taxEnabled ? ` (Pajak ${item.taxRate}%)` : ''}\n  ${item.qty} x Rp ${item.price.toLocaleString()} = Rp ${lt.toLocaleString()}${item.taxEnabled ? ` + Pajak Rp ${lx.toLocaleString()}` : ''}\n`;
        });

        text += `------------------------------------\n`;
        text += `Subtotal: Rp ${subtotal.toLocaleString()}\n`;
        if (discount > 0) text += `Diskon Promo: -Rp ${discount.toLocaleString()}\n`;
        if (taxTotal > 0) {
            text += `Pajak: +Rp ${taxTotal.toLocaleString()}\n`;
            taxDetails.forEach(t=>{ text += `  - ${t.name} ${t.rate}%: Rp ${t.amount.toLocaleString()}\n`; });
        }
        text += `*TOTAL BAYAR: Rp ${total.toLocaleString()}*\n`;
        text += `------------------------------------\n`;
        text += `Terima Kasih telah berbelanja!`;

        const encodedMsg = encodeURIComponent(text);
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.slice(1);
        }
        
        const waUrl = cleanPhone 
            ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
            : `https://wa.me/?text=${encodedMsg}`;

        window.open(waUrl, '_blank');
    }
};

export default TransaksiModule;