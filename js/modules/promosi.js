import DB from './db.js';

if (!window._promosiState) {
    window._promosiState = {
        detectionPeriod: 'weekly', // harian, mingguan, bulanan - default mingguan
        lastCleanup: null
    };
}

const PromosiModule = {
    get detectionPeriod() { return window._promosiState.detectionPeriod; },
    set detectionPeriod(val) { window._promosiState.detectionPeriod = val; },
    promotions: [],
    products: [],
    autoSuggestions: [],
    lastAnalysis: null,

    async render() {
        this.promotions = await DB.getPromotions() || [];
        this.products = await DB.getProducts() || [];

        // === FIX BERTUMPUK: deduplicate promo berjalan untuk render ===
        const dedupMap = new Map();
        const dedupedForRender = [];
        (this.promotions||[]).forEach(p=>{
            const c=p.config||{};
            const key=`${p.type}:${c.targetProdId||c.prodA||c.prodId||c.buyProdId||''}:${c.prodB||c.getProdId||''}`;
            if(!dedupMap.has(key)){
                dedupMap.set(key,true);
                dedupedForRender.push(p);
            }
        });
        const promotionsForRender = dedupedForRender;

        if (!this.lastAnalysis) {
            try {
                this.lastAnalysis = await this.analyzeLaporanData({ silent: true });
            } catch(e) { console.warn('auto analysis fail', e) }
        }
        const pendingCount = (this.autoSuggestions || []).filter(s => s.status === 'suggested').length;

        return `
            <div class="setting-section" style="display:flex; flex-direction:column; gap:10px;">
                <!-- Header sama seperti modul lain -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
                    <h3 style="margin:0; font-size:1rem; color:var(--text-primary); letter-spacing:0.2px;">Program Promosi</h3>
                    <button class="btn-touch active" id="btn-open-add-promo" style="padding:7px 12px; font-size:0.75rem; min-width:90px;">+ Buat Promo</button>
                </div>

                <!-- ================= AUTO DETECT - SELARAS TEMA EDC ================= -->
                <div class="setting-card" style="border:1px solid var(--border-color); border-left:3px solid var(--accent-color); padding:10px; background:var(--bg-secondary);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">Auto Detect</span>
                                <span style="font-size:0.6rem; padding:2px 6px; border-radius:20px; background:var(--bg-card); color:var(--text-secondary); border:1px solid var(--border-color);">berdasarkan laporan</span>
                                ${pendingCount ? `<span style="font-size:0.6rem; padding:2px 6px; border-radius:20px; background:var(--danger-color); color:white;">${pendingCount} baru</span>` : ''}
                            </div>
                            <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:3px; line-height:1.2;">Analisa penjualan & stok untuk rekomendasi promo otomatis</div>
                        </div>
                        <button class="btn-touch active" id="btn-auto-scan" style="padding:6px 12px; font-size:0.7rem; white-space:nowrap;">Scan</button>
                    </div>

                    <!-- PILIHAN PERIODE DETEKSI -->
                    <div style="margin-top:10px;">
                        <div style="font-size:0.68rem; color:var(--text-secondary); margin-bottom:4px;">Periode Deteksi:</div>
                        <div class="option-group" style="margin-top:0;">
                            <button class="btn-touch ${this.detectionPeriod === 'daily' ? 'active' : ''}" data-period="daily" id="btn-period-daily" style="font-size:0.7rem; padding:6px;">Harian</button>
                            <button class="btn-touch ${this.detectionPeriod === 'weekly' ? 'active' : ''}" data-period="weekly" id="btn-period-weekly" style="font-size:0.7rem; padding:6px;">Mingguan</button>
                            <button class="btn-touch ${this.detectionPeriod === 'monthly' ? 'active' : ''}" data-period="monthly" id="btn-period-monthly" style="font-size:0.7rem; padding:6px;">Bulanan</button>
                        </div>
                        <div style="font-size:0.62rem; color:var(--text-secondary); margin-top:4px; opacity:0.8;">
                            ${this.detectionPeriod === 'daily' ? '• Analisa 1 hari terakhir, promo expired 24 jam' : this.detectionPeriod === 'weekly' ? '• Default: analisa 7 hari terakhir, promo expired 7 hari' : '• Analisa 30 hari terakhir, promo expired 30 hari'}
                        </div>
                    </div>

                    <div id="auto-insight-summary" style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px;">
                        ${this.renderInsightSummary()}
                    </div>

                    <div id="auto-suggestions-area" style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
                        ${this.renderAutoSuggestionsHTML()}
                    </div>

                    <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                        <button class="btn-touch" id="btn-apply-all-suggested" style="font-size:0.7rem; padding:6px 10px; ${pendingCount ? '' : 'display:none'}">Terapkan Semua (${pendingCount})</button>
                        <button class="btn-touch" id="btn-auto-create-deadstock" style="font-size:0.7rem; padding:6px 10px;">Dead Stock</button>
                        <label style="display:flex; align-items:center; gap:5px; font-size:0.68rem; color:var(--text-secondary); margin-left:auto; cursor:pointer;">
                            <input type="checkbox" id="chk-auto-create" style="accent-color:var(--accent-color);" /> Auto-create
                        </label>
                    </div>
                </div>

                <!-- Form Buat Promo Manual - pakai setting-card juga -->
                <div id="form-promo-card" class="setting-card" style="display:none;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h4 style="margin:0; font-size:0.85rem; color:var(--text-primary);">Tambah Promosi Baru</h4>
                        <span style="font-size:0.6rem; color:var(--text-secondary); border:1px solid var(--border-color); padding:2px 6px; border-radius:10px;">Manual</span>
                    </div>
                    <input type="hidden" id="promo-id">
                    
                    <label style="font-size:0.7rem; color:var(--text-secondary);">Nama Promo</label>
                    <input type="text" id="promo-name" class="form-control" placeholder="Contoh: Tebus Murah Minyak">
                    
                    <label style="font-size:0.7rem; color:var(--text-secondary); margin-top:8px; display:block;">Jenis Promosi</label>
                    <select id="promo-type" class="form-control">
                        <option value="tebus_murah">Tebus Murah</option>
                        <option value="bundling">Paket Bundling</option>
                        <option value="buy_x_get_y">Beli X Gratis Y</option>
                        <option value="tiered_spend">Diskon Min. Belanja</option>
                        <option value="weekend">Promo Akhir Pekan</option>
                    </select>

                    <div id="promo-config-area" style="margin-top:8px;"></div>

                    <div style="display:flex; gap:6px; margin-top:10px;">
                        <button class="btn-touch active" id="btn-save-promo" style="flex:1;">Simpan</button>
                        <button class="btn-touch" id="btn-cancel-promo" style="flex:1;">Batal</button>
                    </div>
                </div>

                <!-- Daftar Promo - pakai style sama seperti laporan -->
                <div class="setting-card" style="padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h4 style="margin:0; font-size:0.8rem; color:var(--text-primary);">Daftar Promo Berjalan</h4>
                        <span style="font-size:0.65rem; color:var(--text-secondary); background:var(--bg-card); border:1px solid var(--border-color); padding:2px 6px; border-radius:10px;">${promotionsForRender.length} aktif</span>
                    </div>
                    
                    ${this.promotions.length ? `
                        <div style="display:flex; flex-direction:column; gap:6px;">
                        ${promotionsForRender.map(p => `
                            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:8px; display:flex; justify-content:space-between; gap:8px;">
                                <div style="flex:1; min-width:0;">
                                    <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                                        <b style="font-size:0.8rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${p.name}</b>
                                        ${p.autoGenerated ? `<span style="font-size:0.55rem; background:rgba(37,99,235,0.15); color:var(--accent-color); border:1px solid rgba(37,99,235,0.3); padding:1px 5px; border-radius:10px;">AUTO</span>` : ''}
                                        <span style="font-size:0.55rem; background:var(--bg-primary); color:var(--text-secondary); padding:1px 5px; border-radius:10px; border:1px solid var(--border-color);">${p.type.toUpperCase().replace(/_/g,' ')}</span>
                                    </div>
                                    <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:3px; line-height:1.2;">${this.getPromoDescription(p)}</div>
                                    ${p.autoReason ? `<div style="font-size:0.65rem; color:var(--accent-color); margin-top:2px; opacity:0.9;">↳ ${p.autoReason}</div>` : ''}
                                </div>
                                <button onclick="PromosiModule.deletePromo('${p.id}')" style="background:none; border:1px solid var(--border-color); color:var(--danger-color); border-radius:6px; padding:4px 8px; font-size:0.65rem; height:fit-content; cursor:pointer;">Hapus</button>
                            </div>
                        `).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding:16px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-secondary); font-size:0.75rem;">
                            Belum ada promo aktif<br><small style="font-size:0.65rem;">Buat manual atau scan auto detect</small>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    init() {
        window.PromosiModule = this;

        document.getElementById('btn-open-add-promo')?.addEventListener('click', () => {
            const card = document.getElementById('form-promo-card');
            card.style.display = card.style.display === 'none' ? 'block' : 'none';
            if (card.style.display === 'block') this.renderConfigFields();
        });

        document.getElementById('btn-cancel-promo')?.addEventListener('click', () => {
            document.getElementById('form-promo-card').style.display = 'none';
        });

        document.getElementById('promo-type')?.addEventListener('change', () => {
            this.renderConfigFields();
        });

        document.getElementById('btn-save-promo')?.addEventListener('click', async () => {
            await this.savePromo();
        });

        document.getElementById('btn-auto-scan')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-auto-scan');
            const oldText = btn.innerHTML;
            btn.innerHTML = '...';
            btn.disabled = true;
            try {
                await this.analyzeLaporanData({ silent: false });
                document.getElementById('auto-suggestions-area').innerHTML = this.renderAutoSuggestionsHTML();
                document.getElementById('auto-insight-summary').innerHTML = this.renderInsightSummary();
                this.initAutoButtons();
                window.app?.loadModule?.('promosi');
            } catch(e){
                console.error(e);
                alert('Gagal scan: ' + e.message);
            } finally {
                btn.innerHTML = oldText;
                btn.disabled = false;
            }
        });

        document.getElementById('btn-apply-all-suggested')?.addEventListener('click', async () => {
            await this.applyAllSuggestions();
        });

        document.getElementById('btn-auto-create-deadstock')?.addEventListener('click', async () => {
            const deadstock = this.autoSuggestions.filter(s => s.rule === 'DEAD_STOCK');
            if (!deadstock.length) return alert('Tidak ada dead stock saat ini');
            if (!confirm(`Buat ${deadstock.length} promo dead stock otomatis?`)) return;
            for (const s of deadstock) await this.applySuggestion(s.id, true);
            window.app?.loadModule?.('promosi');
        });

        // Period selector
        document.querySelectorAll('[data-period]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const period = e.currentTarget.dataset.period;
                this.detectionPeriod = period;
                console.log('Periode deteksi diubah ke:', period);
                // Update UI active
                document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                // Update label
                const labelEl = e.currentTarget.closest('.setting-card')?.querySelector('div[style*="font-size:0.62rem"]');
                if (labelEl) {
                    const cfg = this.getPeriodConfig();
                    labelEl.textContent = `• Analisa ${cfg.days} hari terakhir, promo expired ${cfg.expiryDays} hari`;
                }
                // Auto scan ulang dengan periode baru jika silent false
                if (!silent) {
                    // optional auto-scan, biarkan user klik scan manual biar tidak berat
                }
                // Re-render untuk update badge periode
                // window.app?.loadModule?.('promosi'); // jangan full reload, cukup update active class
            });
        });

        this.initAutoButtons();
    },

    initAutoButtons() {
        document.querySelectorAll('.btn-apply-suggestion').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                await this.applySuggestion(id);
                window.app?.loadModule?.('promosi');
            });
        });
        document.querySelectorAll('.btn-ignore-suggestion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.autoSuggestions = this.autoSuggestions.filter(s => s.id !== id);
                document.getElementById('auto-suggestions-area').innerHTML = this.renderAutoSuggestionsHTML();
                document.getElementById('auto-insight-summary').innerHTML = this.renderInsightSummary();
                this.initAutoButtons();
                const pending = this.autoSuggestions.filter(s => s.status === 'suggested').length;
                const btnAll = document.getElementById('btn-apply-all-suggested');
                if (btnAll) {
                    btnAll.style.display = pending ? '' : 'none';
                    btnAll.textContent = `Terapkan Semua (${pending})`;
                }
            });
        });
    },

    async analyzeLaporanData({ silent = false } = {}) {
        const transactions = await DB.getTransactions() || [];
        const products = await DB.getProducts() || [];
        this.products = products;
        this.promotions = await DB.getPromotions() || [];
        const promoIndex = new Map();
        this.promotions.forEach(p=>{
            const c=p.config||{};
            const pids=[c.targetProdId,c.prodA,c.prodId,c.buyProdId,c.getProdId,c.prodB].filter(Boolean).map(String);
            pids.forEach(pid=>promoIndex.set(`${p.type}:${pid}`, true));
            if(c.prodA && c.prodB) promoIndex.set(`${p.type}:${c.prodA}+${c.prodB}`, true);
        });
        const alreadyHasPromo = (type, prodIds) => {
            for(const pid of prodIds){
                if(promoIndex.has(`${type}:${pid}`)) return true;
            }
            if(prodIds.length===2){
                if(promoIndex.has(`${type}:${prodIds[0]}+${prodIds[1]}`)) return true;
            }
            return false;
        };
        const now = new Date();
        const periodCfg = this.getPeriodConfig();
        const periodDays = periodCfg.days;
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(now.getDate() - periodDays);
        const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(now.getDate() - (periodDays * 2));
        const recentTrx = transactions.filter(t => {
            const timeStr = t.createdAt || t.timestamp || t.waktu || t.date;
            if (!timeStr) return true;
            let d = new Date(timeStr);
            if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) d = new Date(Number(timeStr));
            return !isNaN(d.getTime()) ? d >= thirtyDaysAgo : true;
        });
        const sixtyDaysTrx = transactions.filter(t => {
            const timeStr = t.createdAt || t.timestamp || t.waktu || t.date;
            if (!timeStr) return true;
            let d = new Date(timeStr);
            if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) d = new Date(Number(timeStr));
            return !isNaN(d.getTime()) ? d >= sixtyDaysAgo : true;
        });
        const soldQtyMap30 = {};
        const soldQtyMap60 = {};
        const lastSoldDateMap = {};
        const coOccurrence = {};
        const countSales = (trxList, targetMap) => {
            trxList.forEach(trx => {
                const items = trx.items || trx.cart || trx.produk || [];
                if (!Array.isArray(items)) return;
                items.forEach(item => {
                    const pid = String(item.docId || item.id || item.prodId || item.productId || item.product_id || '');
                    if (!pid) return;
                    const qty = Number(item.qty ?? item.quantity ?? item.jumlah ?? 1) || 1;
                    targetMap[pid] = (targetMap[pid] || 0) + qty;
                    const timeStr = trx.createdAt || trx.timestamp || trx.waktu;
                    let d = new Date(timeStr);
                    if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) d = new Date(Number(timeStr));
                    if (!isNaN(d.getTime())) {
                        if (!lastSoldDateMap[pid] || d > lastSoldDateMap[pid]) lastSoldDateMap[pid] = d;
                    }
                });
                const idsInTrx = (items || []).map(i => String(i.docId || i.id || i.prodId || i.productId || '')).filter(Boolean);
                for (let i = 0; i < idsInTrx.length; i++) {
                    for (let j = i+1; j < idsInTrx.length; j++) {
                        const a = idsInTrx[i], b = idsInTrx[j];
                        if (!coOccurrence[a]) coOccurrence[a] = {};
                        if (!coOccurrence[b]) coOccurrence[b] = {};
                        coOccurrence[a][b] = (coOccurrence[a][b] || 0) + 1;
                        coOccurrence[b][a] = (coOccurrence[b][a] || 0) + 1;
                    }
                }
            });
        };
        countSales(recentTrx, soldQtyMap30);
        countSales(sixtyDaysTrx, soldQtyMap60);
        const suggestions = [];
        let totalDeadStock = 0, totalOverstock = 0, totalSlow = 0, totalHighMargin = 0, totalExpired = 0;
        const expiredList = products.filter(p=>{
            const info = this.getProductExpiredInfo(p);
            const stock = this.getProductStock(p);
            return info.isPriority && stock>0;
        }).sort((a,b)=>this.getProductExpiredInfo(a).daysToExpired - this.getProductExpiredInfo(b).daysToExpired);
        expiredList.forEach(p=>{
            const pid = String(p.docId||p.id||'');
            if(alreadyHasPromo('tebus_murah',[pid, String(p.id||p.docId)])) return;
            const stock = this.getProductStock(p);
            const cost = this.getProductCost(p);
            const price = this.getProductPrice(p);
            const expInfo = this.getProductExpiredInfo(p);
            totalExpired++;
            const priceBalikModal = Math.round(cost);
            const cross = this.calculateCrossSubsidyProfit('tebus_murah', {minSpend:50000, targetProdId:pid, discountPrice:priceBalikModal}, {targetProd:p});
            if (cross.isAccumulatedProfitable) {
                suggestions.push({
                    id: 'AUTO-EXP-TEBUS-'+pid,
                    rule: 'EXPIRED_CLEARANCE',
                    priority: 100,
                    status: 'suggested',
                    confidence: expInfo.isExpired?100:95,
                    productIds: [pid],
                    productNames: [p.name||p.nama||pid],
                    promoType: 'tebus_murah',
                    promoName: `${expInfo.isExpired?'EXPIRED':'Near Exp'} Tebus - ${p.name} (${expInfo.label})`,
                    config: {minSpend:50000, targetProdId:p.id||p.docId, discountPrice:priceBalikModal},
                    reason: `${expInfo.label}, stok ${stock}. Balik modal Rp${priceBalikModal.toLocaleString()} - Cross subsidi untung Rp${cross.accumulatedProfit.toLocaleString()}`,
                    estimasi: `Selamatkan modal Rp${(stock*cost).toLocaleString()}`,
                    autoReason: expInfo.label,
                    isExpiredPromo: true
                });
            }
            const topLaris = products.filter(o=>{
                if (String(o.docId||o.id)===pid) return false;
                if (this.getProductStock(o) <= this.getProductMinStock(o)) return false;
                if (this.getProductExpiredInfo(o).isPriority) return false;
                return true;
            }).sort((a,b)=>(soldQtyMap30[String(b.docId||b.id)]||0)-(soldQtyMap30[String(a.docId||a.id)]||0))[0];
            if (topLaris) {
                if(alreadyHasPromo('bundling',[pid, String(topLaris.id||topLaris.docId)])) return;
                const costBundle = cost + this.getProductCost(topLaris);
                const bundlePrice = Math.round(costBundle);
                suggestions.push({
                    id: `AUTO-EXP-BUNDLE-${pid}-${topLaris.id||topLaris.docId}`,
                    rule: 'EXPIRED_BUNDLE',
                    priority: 99,
                    status: 'suggested',
                    confidence: 90,
                    productIds: [pid, String(topLaris.docId||topLaris.id)],
                    productNames: [p.name, topLaris.name],
                    promoType: 'bundling',
                    promoName: `Bundle Clearance ${p.name} + ${topLaris.name}`,
                    config: {prodA:p.id||p.docId, prodB:topLaris.id||topLaris.docId, bundlePrice:bundlePrice},
                    reason: `Clearance ${expInfo.label}. Bundle balik modal Rp${bundlePrice.toLocaleString()}`,
                    estimasi: `Habiskan expired`,
                    autoReason: 'Expired+Lariss',
                    isExpiredPromo: true
                });
            }
        });

        products.forEach(p => {
            const expCheck = this.getProductExpiredInfo(p);
            if (expCheck.isPriority) return;
            const pid = String(p.docId || p.id || '');
            if(alreadyHasPromo('tebus_murah',[pid]) || alreadyHasPromo('weekend',[pid]) || alreadyHasPromo('bundling',[pid])) return;

            const stock = Number(p.stock ?? p.stok ?? 0) || 0;
            const minStock = Number(p.minStock ?? p.min_stock ?? 5) || 5;
            if (stock <= 0 || stock <= minStock) {
                return;
            }
            const price = Number(p.price ?? p.hargaJual ?? 0) || 0;
            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? p.hpp ?? 0) || 0;
            const margin = price > 0 ? (price - cost) / price : 0;
            const sold30 = soldQtyMap30[pid] || 0;
            const lastSold = lastSoldDateMap[pid];
            const daysSinceSold = lastSold ? Math.floor((now - lastSold) / (1000*60*60*24)) : 999;
            if (stock > 0 && daysSinceSold >= periodCfg.deadThreshold) {
                totalDeadStock++;
                const discountPrice = Math.max(cost + (price - cost) * 0.2, cost * 1.05);
                // === PROFIT CHECK DEAD STOCK ===
                {
                    const tempCfg = { minSpend: 50000, targetProdId: p.id || p.docId, discountPrice: Math.round(discountPrice) };
                    const profitCheck = this.checkProfitability('tebus_murah', tempCfg, { targetProd: p });
                    if (!profitCheck.isProfitable) {
                        // Auto-adjust ke harga minimal untung
                        const minPrice = profitCheck.maxAllowedDiscount || Math.ceil(this.getProductCost(p) * 1.05);
                        tempCfg.discountPrice = minPrice;
                        const recheck = this.checkProfitability('tebus_murah', tempCfg, { targetProd: p });
                        if (!recheck.isProfitable) {
                            console.warn(`Skip dead stock ${p.name}: ${profitCheck.reason}`);
                        } else {
                            suggestions.push({
                                id: 'AUTO-DEAD-' + pid,
                                rule: 'DEAD_STOCK',
                                priority: 95,
                                status: 'suggested',
                                confidence: 80,
                                productIds: [pid],
                                productNames: [p.name || p.nama || pid],
                                promoType: 'tebus_murah',
                                promoName: `Tebus Murah - ${p.name || 'Produk'} (${daysSinceSold}h)`,
                                config: tempCfg,
                                reason: `Tidak laku ${daysSinceSold} hari, stok ${stock} pcs. (Harga disesuaikan agar tetap untung 5%)`,
                                estimasi: `Cair Rp ${(stock * tempCfg.discountPrice).toLocaleString('id-ID')} - Modal Rp ${(stock * this.getProductCost(p)).toLocaleString('id-ID')}`,
                                autoReason: `Dead ${daysSinceSold} hari`
                            });
                        }
                    } else {
                        suggestions.push({
                            id: 'AUTO-DEAD-' + pid,
                            rule: 'DEAD_STOCK',
                            priority: 95,
                            status: 'suggested',
                            confidence: 95,
                            productIds: [pid],
                            productNames: [p.name || p.nama || pid],
                            promoType: 'tebus_murah',
                            promoName: `Tebus Murah - ${p.name || 'Produk'} (${daysSinceSold}h)`,
                            config: tempCfg,
                            reason: `Tidak laku ${daysSinceSold} hari, stok ${stock} pcs.`,
                            estimasi: `Cair Rp ${(stock * tempCfg.discountPrice).toLocaleString('id-ID')}`,
                            autoReason: `Dead ${daysSinceSold} hari`
                        });
                    }
                }
            } else if (stock > 0 && sold30 > 0 && stock > sold30 * 3) {
                totalOverstock++;
                // === PROFIT CHECK OVERSTOCK - JANGAN BIKIN BOGO RUGI ===
                {
                    let overCfg = { buyProdId: p.id || p.docId, buyQty: 2, getProdId: p.id || p.docId, getQty: 1 };
                    let profitCheck = this.checkProfitability('buy_x_get_y', overCfg, { buyProd: p, getProd: p });
                    if (!profitCheck.isProfitable) {
                        // Coba fallback ke Buy 3 Get 1 (lebih aman)
                        overCfg = { buyProdId: p.id || p.docId, buyQty: 3, getProdId: p.id || p.docId, getQty: 1 };
                        profitCheck = this.checkProfitability('buy_x_get_y', overCfg, { buyProd: p, getProd: p });
                        if (!profitCheck.isProfitable) {
                            // Fallback lagi ke diskon weekend kecil yang masih untung
                            const maxDisc = profitCheck.maxAllowedDiscount || Math.floor(this.getProductPrice(p) - this.getProductCost(p) * 1.05);
                            if (maxDisc > 0) {
                                suggestions.push({
                                    id: 'AUTO-OVER-DISC-' + pid,
                                    rule: 'OVERSTOCK',
                                    priority: 75,
                                    status: 'suggested',
                                    confidence: 70,
                                    productIds: [pid],
                                    productNames: [p.name || pid],
                                    promoType: 'weekend',
                                    promoName: `Diskon Overstock - ${p.name} (Aman)`,
                                    config: { prodId: p.id || p.docId, discount: maxDisc },
                                    reason: `Overstock ${stock} pcs tapi margin tipis (modal ${this.getProductCost(p)}, jual ${this.getProductPrice(p)}). BOGO rugi, diganti diskon aman Rp${maxDisc.toLocaleString()}.`,
                                    estimasi: `Tetap untung 5% per pcs`,
                                    autoReason: `Overstock - disesuaikan profit`
                                });
                            } else {
                                console.warn(`Skip overstock ${p.name}: margin terlalu tipis untuk promo apapun - ${profitCheck.reason}`);
                            }
                        } else {
                            suggestions.push({
                                id: 'AUTO-OVER-' + pid,
                                rule: 'OVERSTOCK',
                                priority: 85,
                                status: 'suggested',
                                confidence: 75,
                                productIds: [pid],
                                productNames: [p.name || pid],
                                promoType: 'buy_x_get_y',
                                promoName: `Buy 3 Get 1 - ${p.name} (Aman)`,
                                config: overCfg,
                                reason: `Stok ${stock} = ${(stock/sold30).toFixed(1)}x bulanan. Buy 2 Get 1 rugi, diubah Buy 3 Get 1 agar tetap untung.`,
                                estimasi: `Kurangi ${Math.min(stock, sold30)} pcs - tetap untung`,
                                autoReason: `Overstock ${(stock/sold30).toFixed(1)}x - adjusted`
                            });
                        }
                    } else {
                        suggestions.push({
                            id: 'AUTO-OVER-' + pid,
                            rule: 'OVERSTOCK',
                            priority: 85,
                            status: 'suggested',
                            confidence: 88,
                            productIds: [pid],
                            productNames: [p.name || pid],
                            promoType: 'buy_x_get_y',
                            promoName: `Buy 2 Get 1 - ${p.name}`,
                            config: overCfg,
                            reason: `Stok ${stock} = ${(stock/sold30).toFixed(1)}x jual bulanan (${sold30}).`,
                            estimasi: `Kurangi ${Math.min(stock, sold30)} pcs - Profit Rp${(profitCheck.totalRevenue - profitCheck.totalCost).toLocaleString()}`,
                            autoReason: `Overstock ${(stock/sold30).toFixed(1)}x`
                        });
                    }
                }
            } else if (stock > 20 && sold30 > 0 && sold30 < 5) {
                totalSlow++;
                {
                    const disc15 = Math.round(price * 0.15);
                    const slowCfg = { prodId: p.id || p.docId, discount: disc15 };
                    const profitCheck = this.checkProfitability('weekend', slowCfg, { prod: p });
                    if (profitCheck.isProfitable) {
                        suggestions.push({
                            id: 'AUTO-SLOW-' + pid,
                            rule: 'SLOW_MOVING',
                            priority: 70,
                            status: 'suggested',
                            confidence: 75,
                            productIds: [pid],
                            productNames: [p.name || pid],
                            promoType: 'weekend',
                            promoName: `Weekend - ${p.name}`,
                            config: slowCfg,
                            reason: `Hanya laku ${sold30} pcs/${periodCfg.days}h, stok ${stock}.`,
                            estimasi: `+40% sales jika diskon 15% - tetap untung`,
                            autoReason: `Slow ${sold30}/${periodCfg.label}`
                        });
                    } else {
                        const maxDisc = profitCheck.maxAllowedDiscount;
                        if (maxDisc > 0 && maxDisc < disc15) {
                            suggestions.push({
                                id: 'AUTO-SLOW-' + pid,
                                rule: 'SLOW_MOVING',
                                priority: 60,
                                status: 'suggested',
                                confidence: 60,
                                productIds: [pid],
                                productNames: [p.name || pid],
                                promoType: 'weekend',
                                promoName: `Weekend - ${p.name} (Diskon Aman)`,
                                config: { prodId: p.id || p.docId, discount: maxDisc },
                                reason: `Slow moving tapi margin tipis. Diskon 15% rugi (max aman Rp${maxDisc.toLocaleString()}).`,
                                estimasi: `Diskon disesuaikan agar untung 5%`,
                                autoReason: `Slow - adjusted`
                            });
                        } else {
                            console.warn(`Skip slow ${p.name}: ${profitCheck.reason}`);
                        }
                    }
                }
            }
            if (margin > 0.4 && sold30 > 0 && sold30 < 10 && stock > 0 && !suggestions.find(s => s.productIds[0] === pid && s.rule === 'DEAD_STOCK')) {
                totalHighMargin++;
                suggestions.push({
                    id: 'AUTO-MARGIN-' + pid,
                    rule: 'HIGH_MARGIN',
                    priority: 65,
                    status: 'suggested',
                    confidence: 72,
                    productIds: [pid],
                    productNames: [p.name || pid],
                    promoType: 'tebus_murah',
                    promoName: `Tebus Murah - ${p.name}`,
                    config: { minSpend: 75000, targetProdId: p.id || p.docId, discountPrice: Math.round(cost * 1.3) },
                    reason: `Margin ${(margin*100).toFixed(0)}% tapi slow (${sold30} pcs).`,
                    estimasi: `Margin promo ${(((Math.round(cost*1.3)-cost)/Math.round(cost*1.3))*100).toFixed(0)}%`,
                    autoReason: `Margin ${(margin*100).toFixed(0)}%`
                });
            }
        });
        const bundleCandidates = [];
        Object.entries(coOccurrence).forEach(([pid, others]) => {
            Object.entries(others).forEach(([otherPid, count]) => {
                if (count >= 3 && pid < otherPid) {
                    const prodA = products.find(pr => String(pr.id || pr.docId) === pid || String(pr.docId) === pid);
                    const prodB = products.find(pr => String(pr.id || pr.docId) === otherPid || String(pr.docId) === otherPid);
                    if (!prodA || !prodB) return;
                    const priceA = Number(prodA.price || prodA.hargaJual || 0);
                    const priceB = Number(prodB.price || prodB.hargaJual || 0);
                    const bundlePrice = Math.round((priceA + priceB) * 0.85);
                    bundleCandidates.push({ count, pid, otherPid, prodA, prodB, bundlePrice });
                }
            });
        });
        bundleCandidates.sort((a,b) => b.count - a.count).slice(0, 5).forEach((c) => {
            const bundleCfg = { prodA: c.prodA.id || c.prodA.docId, prodB: c.prodB.id || c.prodB.docId, bundlePrice: c.bundlePrice };
            const profitCheck = this.checkProfitability('bundling', bundleCfg, { prodA: c.prodA, prodB: c.prodB });
            if (profitCheck.isProfitable) {
                suggestions.push({
                    id: `AUTO-BUNDLE-${c.pid}-${c.otherPid}`,
                    rule: 'BUNDLE_OPPORTUNITY',
                    priority: 80,
                    status: 'suggested',
                    confidence: Math.min(90, 60 + c.count * 5),
                    productIds: [c.pid, c.otherPid],
                    productNames: [c.prodA.name, c.prodB.name],
                    promoType: 'bundling',
                    promoName: `Paket ${c.prodA.name} + ${c.prodB.name}`,
                    config: bundleCfg,
                    reason: `${c.count}x dibeli bareng ${periodCfg.days}h terakhir.`,
                    estimasi: `Hemat Rp ${((Number(c.prodA.price)+Number(c.prodB.price)-c.bundlePrice)).toLocaleString('id-ID')} - tetap untung`,
                    autoReason: `${c.count}x bareng`
                });
            } else {
                const minPrice = profitCheck.maxAllowedDiscount;
                if (minPrice > 0) {
                    suggestions.push({
                        id: `AUTO-BUNDLE-${c.pid}-${c.otherPid}`,
                        rule: 'BUNDLE_OPPORTUNITY',
                        priority: 70,
                        status: 'suggested',
                        confidence: 65,
                        productIds: [c.pid, c.otherPid],
                        productNames: [c.prodA.name, c.prodB.name],
                        promoType: 'bundling',
                        promoName: `Paket ${c.prodA.name} + ${c.prodB.name} (Aman)`,
                        config: { prodA: c.prodA.id || c.prodA.docId, prodB: c.prodB.id || c.prodB.docId, bundlePrice: minPrice },
                        reason: `Bundle ${c.count}x bareng, harga 15% off rugi. Disesuaikan ke Rp${minPrice.toLocaleString()} agar untung 5%.`,
                        estimasi: `Tetap hemat, tidak rugi`,
                        autoReason: `${c.count}x bareng - adjusted`
                    });
                } else {
                    console.warn(`Skip bundle ${c.prodA.name}+${c.prodB.name}: ${profitCheck.reason}`);
                }
            }
        });
        const topSellers = Object.entries(soldQtyMap30).sort((a,b) => b[1]-a[1]).slice(0,3);
        if (now.getDay() >= 4 || !silent) {
            topSellers.forEach(([pid, qty]) => {
                if (suggestions.find(s => s.productIds.includes(pid))) return;
                const prod = products.find(pr => String(pr.id || pr.docId) === pid);
                if (!prod) return;
                suggestions.push({
                    id: 'AUTO-WEEKEND-' + pid,
                    rule: 'WEEKEND_PUSH',
                    priority: 60,
                    status: 'suggested',
                    confidence: 68,
                    productIds: [pid],
                    productNames: [prod.name],
                    promoType: 'weekend',
                    promoName: `Weekend - ${prod.name}`,
                    config: { prodId: prod.id || prod.docId, discount: Math.round((Number(prod.price||0))*0.1) },
                    reason: `Top seller ${qty} pcs/30h.`,
                    estimasi: `Proyeksi +25% weekend`,
                    autoReason: `Top ${qty} pcs`
                });
            });
        }
        suggestions.sort((a,b) => b.priority - a.priority);
        this.autoSuggestions = suggestions;
        this.lastAnalysis = {
            date: new Date().toISOString(),
            totalTrx: recentTrx.length,
            soldMap: soldQtyMap30,
            deadStock: totalDeadStock,
            overstock: totalOverstock,
            slowMoving: totalSlow,
            highMargin: totalHighMargin,
            bundleFound: bundleCandidates.length
        };
        const autoCreate = document.getElementById('chk-auto-create')?.checked;
        if (autoCreate && !silent) {
            for (const s of suggestions.filter(s => s.rule === 'DEAD_STOCK' || s.rule === 'OVERSTOCK')) {
                await this.applySuggestion(s.id, true);
            }
        }
        return this.lastAnalysis;
    },

    renderInsightSummary() {
        // === FIX BERTUMPUK: deduplicate promo berjalan untuk render ===
        const dedupMap = new Map();
        const dedupedForRender = [];
        (this.promotions||[]).forEach(p=>{
            const c=p.config||{};
            const key=`${p.type}:${c.targetProdId||c.prodA||c.prodId||c.buyProdId||''}:${c.prodB||c.getProdId||''}`;
            if(!dedupMap.has(key)){
                dedupMap.set(key,true);
                dedupedForRender.push(p);
            }
        });
        const promotionsForRender = dedupedForRender;

        if (!this.lastAnalysis) {
            return `<div style="grid-column:span 4; text-align:center; padding:8px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-secondary); font-size:0.7rem;">Belum scan. Klik Scan.</div>`;
        }
        const a = this.lastAnalysis;
        const item = (label, val, color) => `
            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:6px; text-align:center;">
                <div style="font-size:0.6rem; color:var(--text-secondary);">${label}</div>
                <div style="font-weight:700; font-size:0.85rem; color:${color || 'var(--text-primary)'}; margin-top:2px;">${val}</div>
            </div>
        `;
        return `
            ${item('Trx 30h', a.totalTrx, 'var(--text-primary)')}
            ${item('Dead', a.deadStock, 'var(--danger-color)')}
            ${item('Over', a.overstock, '#f59e0b')}
            ${item('Bundle', a.bundleFound, 'var(--success-color)')}
        `;
    },

    renderAutoSuggestionsHTML() {
        if (!this.autoSuggestions || this.autoSuggestions.length === 0) {
            return `
                <div style="text-align:center; padding:12px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-secondary); font-size:0.7rem;">
                    Tidak ada peluang promo baru.<br><small style="font-size:0.65rem;">Stok & penjualan aman</small>
                </div>
            `;
        }
        return this.autoSuggestions.map(s => {
            const colorMap = {
                'DEAD_STOCK': 'var(--danger-color)',
                'OVERSTOCK': '#f59e0b',
                'SLOW_MOVING': '#8b5cf6',
                'HIGH_MARGIN': 'var(--success-color)',
                'BUNDLE_OPPORTUNITY': 'var(--accent-color)',
                'WEEKEND_PUSH': '#06b6d4'
            };
            const badgeColor = colorMap[s.rule] || 'var(--text-secondary)';
            return `
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-left:3px solid ${badgeColor}; border-radius:8px; padding:8px;">
                    <div style="display:flex; justify-content:space-between; gap:8px;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                <b style="font-size:0.78rem; color:var(--text-primary);">${s.promoName}</b>
                                <span style="font-size:0.55rem; padding:1px 5px; border-radius:10px; background:var(--bg-primary); border:1px solid var(--border-color); color:${badgeColor};">${s.rule.replace(/_/g,' ')}</span>
                                <span style="font-size:0.55rem; padding:1px 5px; border-radius:10px; background:var(--bg-primary); color:var(--text-secondary); border:1px solid var(--border-color);">${s.confidence}%</span>
                            </div>
                            <div style="font-size:0.68rem; color:var(--text-secondary); margin-top:3px;">${s.reason}</div>
                            <div style="font-size:0.65rem; color:var(--success-color); margin-top:2px;">${s.estimasi} • ${s.productNames.join(', ')}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <button class="btn-touch active btn-apply-suggestion" data-id="${s.id}" style="font-size:0.65rem; padding:5px 8px; background:${badgeColor}; border-color:${badgeColor};">Buat</button>
                            <button class="btn-touch btn-ignore-suggestion" data-id="${s.id}" style="font-size:0.6rem; padding:3px 6px;">Skip</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async applySuggestion(suggestionId, silent = false) {
        const s = this.autoSuggestions.find(x => x.id === suggestionId);
        if (!s) return;
        this.promotions = await DB.getPromotions() || [];
        const exists = this.promotions.some(p=>{
            const c=p.config||{}; const sc=s.config||{};
            if(p.type!==s.promoType) return false;
            const pPids=[c.targetProdId,c.prodA,c.prodId,c.buyProdId].filter(Boolean).map(String);
            const sPids=[sc.targetProdId,sc.prodA,sc.prodId,sc.buyProdId].filter(Boolean).map(String);
            return pPids.some(pid=>sPids.includes(pid));
        });
        if(exists){
            if(!silent) alert(`Promo sudah ada, skip: ${s.promoName}`);
            this.autoSuggestions = this.autoSuggestions.filter(x => x.id !== suggestionId);
            return;
        }
        const promoData = {
            name: s.promoName,
            type: s.promoType,
            config: s.config,
            autoGenerated: true,
            autoReason: s.autoReason,
            autoRule: s.rule,
            autoConfidence: s.confidence,
            detectionPeriod: this.detectionPeriod,
            periodLabel: this.getPeriodConfig().label,
            expiryAt: new Date(Date.now() + this.getPeriodConfig().expiryDays * 24*60*60*1000).toISOString(),
            createdAt: new Date().toISOString(),
            status: 'active'
        };
        await DB.savePromotion(promoData);
        s.status = 'applied';
        this.promotions = await DB.getPromotions() || [];
        if (!silent) alert(`Promo "${s.promoName}" dibuat!`);
        this.autoSuggestions = this.autoSuggestions.filter(x => x.id !== suggestionId);
    },

    async applyAllSuggestions() {
        const pending = this.autoSuggestions.filter(s => s.status === 'suggested');
        if (!pending.length) return alert('Tidak ada promo');
        if (!confirm(`Terapkan ${pending.length} promo sekaligus?`)) return;
        for (const s of pending) await this.applySuggestion(s.id, true);
        alert(`${pending.length} promo dibuat!`);
        window.app?.loadModule?.('promosi');
    },

    renderConfigFields() {
        const type = document.getElementById('promo-type').value;
        const container = document.getElementById('promo-config-area');
        const getStockStatus = (p) => {
            const stok = Number(p.stock ?? p.stok ?? 0);
            const min = Number(p.minStock ?? p.min_stock ?? 5);
            if (stok <= 0) return { label: 'HABIS', disabled: true, isLow: true };
            if (stok <= min) return { label: `MENIPIS (sisa ${stok}, min ${min})`, disabled: true, isLow: true };
            return { label: `Stok ${stok}`, disabled: false, isLow: false };
        };
        const opts = this.products.map(p => {
            const status = getStockStatus(p);
            return `<option value="${p.id || p.docId}" ${status.disabled ? 'disabled style="color:#999;background:#f5f5f5;"' : ''}>${p.name || p.nama} - Rp ${Number(p.price || p.hargaJual || 0).toLocaleString()} ${status.disabled ? ' ['+status.label+']' : ''}</option>`;
        }).join('');
        const optsAvailable = this.products.filter(p => {
            const stok = Number(p.stock ?? p.stok ?? 0);
            const min = Number(p.minStock ?? p.min_stock ?? 5);
            return stok > min;
        });
        if (optsAvailable.length === 0) {
            container.innerHTML = `<div style="padding:10px; background:#fef2f2; border:1px solid #fca5a5; border-radius:6px; color:#dc2626; font-size:0.8rem;">⚠️ Semua produk stok menipis/habis, tidak bisa buat promo. Restok dulu!</div>`;
            return;
        }
        if (type === 'tebus_murah') {
            container.innerHTML = `
                <label style="font-size:0.7rem; color:var(--text-secondary);">Min. Belanja</label>
                <input type="number" id="cfg-min-spend" class="form-control" placeholder="50000">
                <label style="font-size:0.7rem; color:var(--text-secondary); margin-top:6px; display:block;">Produk Tebus</label>
                <select id="cfg-target-prod" class="form-control"><option value="">-- Pilih Produk --</option>${opts}</select>
                <input type="number" id="cfg-discount-price" class="form-control" placeholder="Harga tebus" style="margin-top:6px;">
            `;
        } else if (type === 'bundling') {
            container.innerHTML = `
                <label style="font-size:0.7rem; color:var(--text-secondary);">Produk A</label>
                <select id="cfg-prod-a" class="form-control"><option value="">-- Produk A --</option>${opts}</select>
                <label style="font-size:0.7rem; color:var(--text-secondary); margin-top:6px; display:block;">Produk B</label>
                <select id="cfg-prod-b" class="form-control" style="margin-top:2px;"><option value="">-- Produk B --</option>${opts}</select>
                <input type="number" id="cfg-bundle-price" class="form-control" placeholder="Harga paket" style="margin-top:6px;">
            `;
        } else if (type === 'buy_x_get_y') {
            container.innerHTML = `
                <label style="font-size:0.7rem; color:var(--text-secondary);">Beli Produk</label>
                <select id="cfg-buy-prod" class="form-control"><option value="">-- Beli X --</option>${opts}</select>
                <input type="number" id="cfg-buy-qty" class="form-control" placeholder="Qty beli, ex:2" style="margin-top:6px;">
                <label style="font-size:0.7rem; color:var(--text-secondary); margin-top:6px; display:block;">Gratis Produk</label>
                <select id="cfg-get-prod" class="form-control"><option value="">-- Gratis Y --</option>${opts}</select>
                <input type="number" id="cfg-get-qty" class="form-control" placeholder="Qty gratis" value="1" style="margin-top:6px;">
            `;
        } else if (type === 'tiered_spend') {
            container.innerHTML = `
                <input type="number" id="cfg-tier-min" class="form-control" placeholder="Min. belanja Rp">
                <input type="number" id="cfg-tier-disc" class="form-control" placeholder="Potongan Rp" style="margin-top:6px;">
            `;
        } else if (type === 'weekend') {
            container.innerHTML = `
                <select id="cfg-weekend-prod" class="form-control"><option value="">-- Produk Weekend --</option>${opts}</select>
                <input type="number" id="cfg-weekend-discount" class="form-control" placeholder="Potongan /pcs Rp" style="margin-top:6px;">
            `;
        }
    },

    async savePromo() {
        const name = document.getElementById('promo-name').value.trim();
        const type = document.getElementById('promo-type').value;
        if (!name) return alert('Nama promo wajib diisi!');
        // Helper cek stok menipis/habis
        const isStockLow = (prodId) => {
            const prod = this.products.find(p => String(p.id || p.docId) === String(prodId));
            if (!prod) return { low: true, reason: 'Produk tidak ditemukan' };
            const stok = Number(prod.stock ?? prod.stok ?? 0);
            const min = Number(prod.minStock ?? prod.min_stock ?? 5);
            if (stok <= 0) return { low: true, reason: `Stok ${prod.name || prod.nama} HABIS (0)` };
            if (stok <= min) return { low: true, reason: `Stok ${prod.name || prod.nama} MENIPIS (sisa ${stok}, minimal ${min}) - tidak bisa untuk promo` };
            return { low: false };
        };
        let config = {};
        if (type === 'tebus_murah') {
            const targetProdId = document.getElementById('cfg-target-prod').value;
            if (!targetProdId) return alert('Pilih produk!');
            const check = isStockLow(targetProdId);
            if (check.low) return alert('❌ ' + check.reason);
            config = { minSpend: Number(document.getElementById('cfg-min-spend').value) || 0, targetProdId, discountPrice: Number(document.getElementById('cfg-discount-price').value) || 0 };
        } else if (type === 'bundling') {
            const prodA = document.getElementById('cfg-prod-a').value;
            const prodB = document.getElementById('cfg-prod-b').value;
            if (!prodA || !prodB) return alert('Pilih A dan B!');
            if (prodA === prodB) return alert('A dan B tidak boleh sama!');
            const checkA = isStockLow(prodA); if (checkA.low) return alert('❌ Produk A: ' + checkA.reason);
            const checkB = isStockLow(prodB); if (checkB.low) return alert('❌ Produk B: ' + checkB.reason);
            config = { prodA, prodB, bundlePrice: Number(document.getElementById('cfg-bundle-price').value) || 0 };
        } else if (type === 'buy_x_get_y') {
            const buyProdId = document.getElementById('cfg-buy-prod').value;
            const getProdId = document.getElementById('cfg-get-prod').value;
            if (!buyProdId || !getProdId) return alert('Pilih X dan Y!');
            const checkBuy = isStockLow(buyProdId); if (checkBuy.low) return alert('❌ Beli X: ' + checkBuy.reason);
            const checkGet = isStockLow(getProdId); if (checkGet.low) return alert('❌ Gratis Y: ' + checkGet.reason + ' (produk gratis harus stok aman)');
            config = { buyProdId, buyQty: Number(document.getElementById('cfg-buy-qty').value) || 1, getProdId, getQty: Number(document.getElementById('cfg-get-qty').value) || 1 };
        } else if (type === 'tiered_spend') {
            config = { minSpend: Number(document.getElementById('cfg-tier-min').value) || 0, discount: Number(document.getElementById('cfg-tier-disc').value) || 0 };
        } else if (type === 'weekend') {
            const prodId = document.getElementById('cfg-weekend-prod').value;
            if (!prodId) return alert('Pilih produk!');
            const check = isStockLow(prodId); if (check.low) return alert('❌ ' + check.reason);
            config = { prodId, discount: Number(document.getElementById('cfg-weekend-discount').value) || 0 };
        }
        await DB.savePromotion({ name, type, config, autoGenerated: false, createdAt: new Date().toISOString() });
        alert('Promo Berhasil Dibuat!');
        window.app?.loadModule?.('promosi');
    },

    getPromoDescription(p) {
        try {
            if (p.type === 'tebus_murah') {
                const prod = this.products.find(item => String(item.id || item.docId) === String(p.config.targetProdId));
                return `Min. Rp ${(p.config.minSpend||0).toLocaleString()} → Tebus ${prod?.name || prod?.nama || 'Item'} Rp ${(p.config.discountPrice||0).toLocaleString()}`;
            } else if (p.type === 'bundling') {
                const pA = this.products.find(item => String(item.id || item.docId) === String(p.config.prodA));
                const pB = this.products.find(item => String(item.id || item.docId) === String(p.config.prodB));
                return `Paket ${pA?.name || 'A'} + ${pB?.name || 'B'} Rp ${(p.config.bundlePrice||0).toLocaleString()}`;
            } else if (p.type === 'buy_x_get_y') {
                const pBuy = this.products.find(item => String(item.id || item.docId) === String(p.config.buyProdId));
                const pGet = this.products.find(item => String(item.id || item.docId) === String(p.config.getProdId));
                return `Beli ${p.config.buyQty}x ${pBuy?.name || 'X'} → Gratis ${p.config.getQty||1}x ${pGet?.name || 'Y'}`;
            } else if (p.type === 'tiered_spend') {
                return `Belanja Rp ${(p.config.minSpend||0).toLocaleString()} → Potongan Rp ${(p.config.discount||0).toLocaleString()}`;
            } else if (p.type === 'weekend') {
                const prod = this.products.find(item => String(item.id || item.docId) === String(p.config.prodId));
                return `Diskon Rp ${(p.config.discount||0).toLocaleString()}/pcs ${prod?.name || ''} (Weekend)`;
            }
        } catch(e) {}
        return '-';
    },

    async deletePromo(id) {
        if (confirm('Hapus promo ini?')) {
            await DB.deletePromotion(id);
            window.app?.loadModule?.('promosi');
        }
    },

    // ===== PROFIT GUARD - CEGAH PROMO RUGI =====
    getProductCost(p) {
        return Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? p.hpp ?? 0) || 0;
    },
    getProductPrice(p) {
        return Number(p.price ?? p.hargaJual ?? 0) || 0;
    },
    getProductStock(p) { return Number(p.stock ?? p.stok ?? 0) || 0; },
    getProductMinStock(p) { return Number(p.minStock ?? p.min_stock ?? 5) || 5; },
    getProductExpiredInfo(p) {
        const expStr = p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry;
        if (!expStr) return { hasExpiry:false, daysToExpired:9999, isExpired:false, isPriority:false, label:'' };
        let d = new Date(expStr);
        if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
        if (isNaN(d.getTime())) return { hasExpiry:false, daysToExpired:9999, isExpired:false, isPriority:false, label:'' };
        const now = new Date();
        const diff = Math.floor((d-now)/(1000*60*60*24));
        return { hasExpiry:true, expiredDate:d, daysToExpired:diff, isExpired:diff<0, isNearExpired: diff>=0 && diff<=30, isPriority: diff<=60, label: diff<0 ? `EXPIRED ${Math.abs(diff)}h lalu` : `Exp ${diff}h lagi` };
    },
    calculateCrossSubsidyProfit(promoType, config, productsInvolved) {
        if (promoType === 'tebus_murah') {
            const targetProd = productsInvolved.targetProd;
            const targetCost = this.getProductCost(targetProd);
            const discountPrice = Number(config.discountPrice)||0;
            const minSpend = Number(config.minSpend)||50000;
            const expiredLoss = discountPrice - targetCost;
            const normalProfit = minSpend * 0.2;
            return { expiredLoss, normalProfit, accumulatedProfit: normalProfit + expiredLoss, isAccumulatedProfitable: (normalProfit + expiredLoss) > 0 };
        } else if (promoType === 'bundling') {
            const prodA = productsInvolved.prodA; const prodB = productsInvolved.prodB;
            const totalCost = this.getProductCost(prodA)+this.getProductCost(prodB);
            const bundlePrice = Number(config.bundlePrice)||0;
            const profit = bundlePrice - totalCost;
            return { accumulatedProfit: profit, isAccumulatedProfitable: profit >= totalCost * -0.1 };
        } else if (promoType === 'buy_x_get_y') {
            const buyProd = productsInvolved.buyProd; const getProd = productsInvolved.getProd;
            const buyQty = Number(config.buyQty)||1; const getQty = Number(config.getQty)||1;
            const totalCost = this.getProductCost(buyProd)*buyQty + this.getProductCost(getProd)*getQty;
            const totalRevenue = this.getProductPrice(buyProd)*buyQty;
            const profit = totalRevenue - totalCost;
            return { accumulatedProfit: profit, isAccumulatedProfitable: profit >= totalCost * -0.5 };
        }
        return { accumulatedProfit:0, isAccumulatedProfitable:false };
    },
    // Hitung apakah promo masih untung
    checkProfitability(promoType, config, productsInvolved) {
        const MIN_MARGIN = 0.05; // minimal untung 5% setelah promo, jangan 0% biar aman
        let totalCost = 0;
        let totalRevenue = 0;
        let isProfitable = true;
        let reason = '';
        let maxAllowedDiscount = 0;

        if (promoType === 'buy_x_get_y') {
            const buyProd = productsInvolved.buyProd;
            const getProd = productsInvolved.getProd || buyProd;
            const buyQty = Number(config.buyQty) || 1;
            const getQty = Number(config.getQty) || 1;
            const buyCost = this.getProductCost(buyProd);
            const getCost = this.getProductCost(getProd);
            const buyPrice = this.getProductPrice(buyProd);

            totalCost = (buyCost * buyQty) + (getCost * getQty);
            totalRevenue = buyPrice * buyQty;
            const profit = totalRevenue - totalCost;
            const marginAfter = totalRevenue > 0 ? profit / totalRevenue : -1;

            if (profit < 0 || marginAfter < MIN_MARGIN) {
                isProfitable = false;
                reason = `BOGO rugi: bayar ${buyQty}x Rp${buyPrice.toLocaleString()} = Rp${totalRevenue.toLocaleString()}, modal ${(buyQty+getQty)} pcs = Rp${totalCost.toLocaleString()} → rugi Rp${Math.abs(profit).toLocaleString()}`;
                // Hitung max getQty yang masih untung
                const maxGetQty = Math.floor((buyPrice * buyQty * (1 - MIN_MARGIN) - buyCost * buyQty) / getCost);
                if (maxGetQty > 0) {
                    reason += ` | Max gratis yang masih untung: ${maxGetQty} pcs`;
                }
            }

        } else if (promoType === 'tebus_murah') {
            const targetProd = productsInvolved.targetProd;
            const cost = this.getProductCost(targetProd);
            const price = this.getProductPrice(targetProd);
            const discountPrice = Number(config.discountPrice) || 0;
            totalCost = cost;
            totalRevenue = discountPrice;
            const profit = totalRevenue - totalCost;
            if (profit < cost * MIN_MARGIN) {
                isProfitable = false;
                const minPrice = Math.ceil(cost * (1 + MIN_MARGIN));
                reason = `Tebus murah rugi: modal Rp${cost.toLocaleString()}, harga tebus Rp${discountPrice.toLocaleString()} → rugi Rp${(cost-discountPrice).toLocaleString()}. Minimal harus Rp${minPrice.toLocaleString()} agar untung ${MIN_MARGIN*100}%`;
                maxAllowedDiscount = minPrice;
            }

        } else if (promoType === 'bundling') {
            const prodA = productsInvolved.prodA;
            const prodB = productsInvolved.prodB;
            const costA = this.getProductCost(prodA);
            const costB = this.getProductCost(prodB);
            const bundlePrice = Number(config.bundlePrice) || 0;
            totalCost = costA + costB;
            totalRevenue = bundlePrice;
            const profit = totalRevenue - totalCost;
            if (profit < totalCost * MIN_MARGIN) {
                isProfitable = false;
                const minPrice = Math.ceil(totalCost * (1 + MIN_MARGIN));
                reason = `Bundling rugi: modal A+B Rp${totalCost.toLocaleString()}, harga bundle Rp${bundlePrice.toLocaleString()} → rugi. Minimal Rp${minPrice.toLocaleString()}`;
                maxAllowedDiscount = minPrice;
            }

        } else if (promoType === 'weekend') {
            const prod = productsInvolved.prod;
            const cost = this.getProductCost(prod);
            const price = this.getProductPrice(prod);
            const discount = Number(config.discount) || 0;
            totalRevenue = price - discount;
            totalCost = cost;
            const profit = totalRevenue - totalCost;
            if (profit < cost * MIN_MARGIN) {
                isProfitable = false;
                const maxDisc = Math.floor(price - cost * (1 + MIN_MARGIN));
                reason = `Weekend rugi: harga Rp${price.toLocaleString()} - diskon Rp${discount.toLocaleString()} = Rp${totalRevenue.toLocaleString()}, modal Rp${cost.toLocaleString()} → rugi. Max diskon boleh Rp${Math.max(0,maxDisc).toLocaleString()}`;
                maxAllowedDiscount = Math.max(0, maxDisc);
            }
        }

        return { isProfitable, reason, maxAllowedDiscount, totalCost, totalRevenue };
    },

    getPeriodConfig() {
        const configs = {
            daily: { days: 1, label: 'Harian', expiryDays: 1, deadThreshold: 3, slowThreshold: 2 },
            weekly: { days: 7, label: 'Mingguan', expiryDays: 7, deadThreshold: 7, slowThreshold: 5 },
            monthly: { days: 30, label: 'Bulanan', expiryDays: 30, deadThreshold: 21, slowThreshold: 10 }
        };
        return configs[this.detectionPeriod] || configs.weekly;
    },

    async autoCleanupExpiredPromos() {
        const now = new Date();
        let deletedCount = 0;
        const reasons = [];

        for (const promo of [...this.promotions]) {
            if (!promo.autoGenerated) continue; // hanya hapus promo auto

            const createdAtStr = promo.createdAt || promo.created_at || promo.date;
            let createdAt = createdAtStr ? new Date(createdAtStr) : null;
            if (createdAt && isNaN(createdAt.getTime()) && !isNaN(Number(createdAtStr))) {
                createdAt = new Date(Number(createdAtStr));
            }
            if (!createdAt || isNaN(createdAt.getTime())) continue;

            // Tentukan expiry berdasarkan periode saat promo dibuat, atau periode sekarang
            const promoPeriod = promo.detectionPeriod || this.detectionPeriod;
            const expiryMap = { daily: 1, weekly: 7, monthly: 30 };
            const expiryDays = expiryMap[promoPeriod] || 7;
            const diffDays = Math.floor((now - createdAt) / (1000*60*60*24));

            let shouldDelete = false;
            let reason = '';

            // 1. Cek expired by time
            if (diffDays >= expiryDays) {
                shouldDelete = true;
                reason = `Expired ${diffDays} hari (periode ${promoPeriod})`;
            }

            // 2. Cek relevansi produk
            if (!shouldDelete) {
                const prodId = promo.config?.targetProdId || promo.config?.prodA || promo.config?.prodId || promo.config?.buyProdId;
                if (prodId) {
                    const prod = this.products.find(p => String(p.id || p.docId) === String(prodId));
                    if (!prod) {
                        shouldDelete = true;
                        reason = 'Produk tidak ditemukan / sudah dihapus';
                    } else {
                        const stock = Number(prod.stock ?? prod.stok ?? 0);
                        const min = Number(prod.minStock ?? prod.min_stock ?? 5);
                        if (stock <= 0) {
                            shouldDelete = true;
                            reason = `Stok habis (0)`;
                        } else if (stock <= min) {
                            shouldDelete = true;
                            reason = `Stok menipis (sisa ${stock}, min ${min}) - promo dinonaktifkan`;
                        }
                    }
                }
            }

            if (shouldDelete) {
                try {
                    await DB.deletePromotion(promo.id);
                    deletedCount++;
                    reasons.push(`${promo.name}: ${reason}`);
                    console.log(`🗑️ Auto-hapus promo: ${promo.name} - ${reason}`);
                } catch(e) {
                    console.warn('Gagal hapus promo', promo.id, e);
                }
            }
        }

        if (deletedCount > 0) {
            this.promotions = await DB.getPromotions() || [];
            window._promosiState.lastCleanup = { date: now.toISOString(), count: deletedCount, reasons };
        }

        return { deletedCount, reasons };
    },

    async onLaporanUpdated() {
        await this.analyzeLaporanData({ silent: true });
        // Auto cleanup setiap kali laporan di-update
        const cleanup = await this.autoCleanupExpiredPromos();
        if (cleanup.deletedCount > 0 && !document.hidden) {
            console.log(`🧹 Auto cleanup: ${cleanup.deletedCount} promo tidak relevan dihapus`);
        }
    }
};

export default PromosiModule;
