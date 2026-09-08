import DB from './db.js';
import Scanner from './scanner.js';

const ProdukModule = {
    products: [],
    currentPage: 1,
    itemsPerPage: 5,
    sortBy: 'name-asc',
    scannerActive: false,
    filterStatus: 'all', // all | baik | near_expired | expired | rusak | opname
    showDisposalLog: false,


    // === HELPER EXPIRED / RUSAK - CENTRAL DI PRODUK.JS ===
    getExpiredInfo(p) {
        const expStr = p.expiredDate || p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry || p.tglExpired;
        if (!expStr) return { hasExpiry:false, days: 9999, isExpired:false, isNear:false, label:'' };
        let d = new Date(expStr);
        if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
        if (isNaN(d.getTime())) {
            const str = String(expStr).trim();
            const m = str.match(/^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{2,4})$/);
            if (m) {
                const day = parseInt(m[1],10); const month = parseInt(m[2],10)-1; let year = parseInt(m[3],10);
                if (year < 100) year += 2000;
                d = new Date(year, month, day);
            }
        }
        if (isNaN(d.getTime())) return { hasExpiry:false, days: 9999, isExpired:false, isNear:false, label:'' };
        const now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
        const diff = Math.floor((d - now)/(1000*60*60*24));
        return {
            hasExpiry:true, date:d, days:diff,
            isExpired: diff < 0,
            isNear: diff >=0 && diff <=30,
            isH7: diff >=0 && diff <=7,
            label: diff<0 ? `EXPIRED ${Math.abs(diff)} hari lalu` : diff===0 ? 'EXPIRED HARI INI' : `H-${diff}`,
            labelDate: d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'})
        };
    },
    isProductExpired(p) { return this.getExpiredInfo(p).isExpired; },
    isProductNearExpired(p) { return this.getExpiredInfo(p).isNear; },

    getSortirSummary() {
        const all = this.products || [];
        let near=0, expired=0, expiredPcs=0, rusak=0, rusakPcs=0, rusakProducts=0, expiredProducts=0, baik=0, totalLoss=0;

        let disposalLogs = [];
        try { disposalLogs = JSON.parse(localStorage.getItem('edc_disposal_logs')||'[]'); } catch(e){ disposalLogs = []; }

        all.forEach(p=>{
            const info = this.getExpiredInfo(p);
            const stock = Number(p.stock||p.stok||0);
            const cost = Number(p.buyPrice ?? p.costPrice ?? 0);

            const hasRusakLog = disposalLogs.some(l=>String(l.prodId)===String(p.id) && l.type==='rusak');
            const hasExpiredLog = disposalLogs.some(l=>String(l.prodId)===String(p.id) && l.type==='expired');
            const rusakQtyFromLog = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='rusak').reduce((s,l)=>s+Number(l.qty||0),0);
            const expiredQtyFromLog = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='expired').reduce((s,l)=>s+Number(l.qty||0),0);

            if ((p.kondisi==='rusak' || p.status==='rusak') || hasRusakLog) {
                rusakProducts++;
                rusakPcs += rusakQtyFromLog || (p.kondisi==='rusak' || p.status==='rusak' ? stock : 0);
                // untuk kompatibilitas UI lama, rusak = total pcs
                rusak = rusakPcs;
                const logLoss = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='rusak').reduce((s,l)=>s+Number(l.costLoss||0),0);
                totalLoss += logLoss || (rusakQtyFromLog * cost) || (stock * cost);
            }
            else if (info.isExpired || hasExpiredLog) {
                expiredProducts++;
                expiredPcs += expiredQtyFromLog || (info.isExpired ? stock : 0);
                expired = expiredPcs;
                const logLoss = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='expired').reduce((s,l)=>s+Number(l.costLoss||0),0);
                totalLoss += logLoss || (expiredQtyFromLog * cost) || (stock * cost);
            }
            else if (info.isNear) { near++; }
            else { baik++; }
        });
        // near juga pcs? near tetap count produk (H-30)
        // Return tambahan rusakPcs & expiredPcs biar UI bisa tampil "2 produk • 3 pcs"
        return { total: all.length, baik, near, expired, expiredPcs, expiredProducts, rusak, rusakPcs, rusakProducts, totalLoss };
    },

    getFilteredProductsForDisplay() {
        let list = this.getSortedProducts();
        const status = this.filterStatus;
        let disposalLogs = [];
        try { disposalLogs = JSON.parse(localStorage.getItem('edc_disposal_logs')||'[]'); } catch(e){ disposalLogs = []; }

        if (status==='baik') list = list.filter(p=>{ const i=this.getExpiredInfo(p); const hasRusakLog = disposalLogs.some(l=>String(l.prodId)===String(p.id) && l.type==='rusak'); return !i.isExpired && !i.isNear && p.kondisi!=='rusak' && p.status!=='rusak' && !hasRusakLog; });
        if (status==='near_expired') list = list.filter(p=>this.getExpiredInfo(p).isNear && p.kondisi!=='rusak');
        if (status==='expired') list = list.filter(p=>{ const hasExpiredLog = disposalLogs.some(l=>String(l.prodId)===String(p.id) && l.type==='expired'); return this.getExpiredInfo(p).isExpired || hasExpiredLog || p.status==='expired'; });
        if (status==='rusak') list = list.filter(p=>{
            const hasRusakLog = disposalLogs.some(l=>String(l.prodId)===String(p.id) && l.type==='rusak');
            return p.kondisi==='rusak' || p.status==='rusak' || hasRusakLog || (p.disposal && p.disposal.type==='rusak');
        });
        if (status==='opname') list = list.filter(p=>p.opnameDiff && p.opnameDiff!==0);
        return list;
    },

    async render() {
        this.products = await DB.getProducts();
        const sorted = this.getSortedProducts();
        const filtered = this.getFilteredProductsForDisplay();
        const totalPages = Math.ceil(filtered.length / this.itemsPerPage) || 1;
        const pageItems = filtered.slice((this.currentPage - 1) * this.itemsPerPage, this.currentPage * this.itemsPerPage);
        const scannerMode = localStorage.getItem('edc_scanner_mode') || 'camera';

        return `
            <div class="setting-section">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Kelola Produk & Stok</h3>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-touch" id="btn-opname" style="padding:6px 10px; font-size:0.7rem; background:var(--bg-card); border:1px solid var(--border-color);">📋 Opname</button>
                        <button class="btn-touch active" id="btn-open-add" style="padding: 6px 12px;">+ Tambah</button>
                    </div>
                </div>

                <!-- === RINGKASAN SORTIR EXPIRED / RUSAK - TEMA SYNC === -->
                <div class="setting-card" style="margin-top:8px; padding:12px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px;">
                    ${(() => {
                        const s = this.getSortirSummary();
                        return `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <b style="font-size:0.8rem;">📦 Sortir Barang</b>
                            <span style="font-size:0.65rem; opacity:0.7;">Loss: Rp ${s.totalLoss.toLocaleString('id-ID')}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
                            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:8px; text-align:center; cursor:pointer;" onclick="ProdukModule.filterStatus='baik'; window.app.loadModule('produk')">
                                <div style="font-size:0.65rem; opacity:0.7; color:var(--text-secondary);">Baik</div>
                                <div style="font-weight:bold; color:#22c55e; font-size:0.9rem;">${s.baik}</div>
                            </div>
                            <div style="background:var(--bg-card); border:1px solid #f59e0b; border-left:3px solid #f59e0b; border-radius:8px; padding:8px; text-align:center; cursor:pointer;" onclick="ProdukModule.filterStatus='near_expired'; window.app.loadModule('produk')">
                                <div style="font-size:0.65rem; color:#f59e0b;">H-30</div>
                                <div style="font-weight:bold; color:#f59e0b; font-size:0.9rem;">${s.near}</div>
                            </div>
                            <div style="background:var(--bg-card); border:1px solid #ef4444; border-left:3px solid #ef4444; border-radius:8px; padding:8px; text-align:center; cursor:pointer;" onclick="ProdukModule.filterStatus='expired'; window.app.loadModule('produk')">
                                <div style="font-size:0.65rem; color:#ef4444;">Expired</div>
                                <div style="font-weight:bold; color:#ef4444; font-size:0.9rem;">${s.expired}</div>
                            </div>
                            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-left:3px solid #6b7280; border-radius:8px; padding:8px; text-align:center; cursor:pointer; opacity:0.85;" onclick="ProdukModule.filterStatus='rusak'; window.app.loadModule('produk')">
                                <div style="font-size:0.65rem; color:var(--text-secondary);">Rusak</div>
                                <div style="font-weight:bold; color:var(--text-color); font-size:0.9rem;">${s.rusak}</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                            <button class="btn-touch" id="btn-auto-sortir" style="flex:1; font-size:0.7rem; padding:6px; background:#f59e0b; color:#fff; border:none; border-radius:6px;">🔍 Sortir Otomatis</button>
                            <button class="btn-touch" id="btn-disposal-log" style="flex:1; font-size:0.7rem; padding:6px;">📜 Log Buang</button>
                        </div>
                        `;
                    })()}
                </div>

                <!-- FILTER STATUS -->
                <div style="display:flex; gap:4px; margin-top:8px; overflow-x:auto; padding-bottom:4px;">
                    ${[
                        {id:'all', label:`Semua (${this.products.length})`},
                        {id:'baik', label:'Baik'},
                        {id:'near_expired', label:'H-30'},
                        {id:'expired', label:'Expired'},
                        {id:'rusak', label:'Rusak'},
                    ].map(f=>`<button class="btn-touch ${this.filterStatus===f.id?'active':''}" data-filter="${f.id}" style="font-size:0.7rem; padding:5px 10px; white-space:nowrap;">${f.label}</button>`).join('')}
                </div>

                <div class="setting-card" style="margin-top:8px; padding:8px;">
                    <div style="display:flex; gap:6px;">
                        <button id="btn-export-products" class="btn-touch active" style="flex:1; font-size:0.75rem;">
                            <i data-lucide="download"></i> Ekspor CSV
                        </button>
                        <button id="btn-trigger-import" class="btn-touch" style="flex:1; font-size:0.75rem; background:var(--bg-card);">
                            <i data-lucide="upload"></i> Impor CSV
                        </button>
                    </div>
                    <input type="file" id="file-import-products" accept=".csv" style="display:none;">
                </div>

                <button id="btn-toggle-prod-scanner" class="btn-scanner-toggle ${this.scannerActive ? 'active' : ''}" style="margin-top:6px;">
                    <i data-lucide="qr-code"></i>
                    <span>${this.scannerActive ? 'Matikan Scanner' : 'Scan Barcode (Restok / Tambah)'}</span>
                </button>
                
                <div id="produk-scanner-wrapper" style="display:${this.scannerActive && scannerMode === 'camera' ? 'block' : 'none'}; text-align:center; margin-top:8px;">
                    <div id="produk-scanner-view" style="width: 250px; height: 180px; margin: 0 auto; overflow: hidden; border-radius: 8px; border: 2px solid var(--accent-color, #007bff);"></div>
                    <div style="margin-top:6px;">
                        <button id="btn-toggle-flash" class="btn-touch" style="padding:4px 10px; font-size:0.75rem; background:var(--bg-card);" disabled>
                            🔦 Flashlight OFF
                        </button>
                    </div>
                </div>

                <div id="form-product-card" class="setting-card" style="display:none; margin-top:8px;">
                    <h4 id="form-title">Tambah Produk Baru</h4>
                    <input type="hidden" id="prod-id">
                    <input type="text" id="prod-barcode" class="form-control" placeholder="Kode Barcode / SKU" style="margin-bottom:4px;">
                    <input type="text" id="prod-name" class="form-control" placeholder="Nama Produk" style="margin-bottom:4px;">
                    
                    <select id="prod-category" class="form-control" style="margin-bottom:4px;">
                        <option value="">-- Pilih Kategori --</option>
                        <optgroup label="Makanan & Minuman">
                            <option value="Makanan Ringan / Snack">Makanan Ringan / Snack</option>
                            <option value="Makanan Instan & Kaleng">Makanan Instan & Kaleng</option>
                            <option value="Bahan Sembako & Bumbu">Bahan Sembako & Bumbu</option>
                            <option value="Roti & Kue">Roti & Kue</option>
                            <option value="Minuman Dingin & Botol">Minuman Dingin & Botol</option>
                            <option value="Kopi, Teh & Susu">Kopi, Teh & Susu</option>
                            <option value="Frozen Food">Frozen Food</option>
                            <option value="Buah & Sayur Fresh">Buah & Sayur Fresh</option>
                        </optgroup>
                        <optgroup label="Kebutuhan Rumah & Perawatan">
                            <option value="Perawatan Tubuh & Kecantikan">Perawatan Tubuh & Kecantikan</option>
                            <option value="Sabun, Detergen & Pembersih">Sabun, Detergen & Pembersih</option>
                            <option value="Ibu & Bayi">Ibu & Bayi</option>
                            <option value="Obat & Kesehatan (Apotek)">Obat & Kesehatan (Apotek)</option>
                            <option value="Perlengkapan Rumah Tangga">Perlengkapan Rumah Tangga</option>
                        </optgroup>
                        <optgroup label="Fashion & Style">
                            <option value="Pakaian Pria">Pakaian Pria</option>
                            <option value="Pakaian Wanita">Pakaian Wanita</option>
                            <option value="Pakaian Anak & Bayi">Pakaian Anak & Bayi</option>
                            <option value="Sepatu & Sandal">Sepatu & Sandal</option>
                            <option value="Aksesoris Fashion">Aksesoris Fashion</option>
                        </optgroup>
                        <optgroup label="Elektronik & Gadget">
                            <option value="Handphone & Gadget">Handphone & Gadget</option>
                            <option value="Aksesoris HP & Komputer">Aksesoris HP & Komputer</option>
                            <option value="Elektronik Rumah Tangga">Elektronik Rumah Tangga</option>
                            <option value="Komponen / Sparepart">Komponen / Sparepart</option>
                        </optgroup>
                        <optgroup label="Atk, Hobi & Lainnya">
                            <option value="Alat Tulis Kantor (ATK)">Alat Tulis Kantor (ATK)</option>
                            <option value="Rokok & Tembakau">Rokok & Tembakau</option>
                            <option value="Mainan & Hobi">Mainan & Hobi</option>
                            <option value="Otomotif & Sparepart">Otomotif & Sparepart</option>
                            <option value="Jasa / Non-Fisik">Jasa / Non-Fisik</option>
                            <option value="Lain-lain">Lain-lain</option>
                        </optgroup>
                    </select>
                    
                    <div style="display:flex; gap:4px; margin-bottom:4px;">
                        <input type="number" id="prod-buy-price" class="form-control" placeholder="Harga Beli" style="flex:1;">
                        <input type="number" id="prod-price" class="form-control" placeholder="Harga Jual" style="flex:1;">
                    </div>
                    <div style="display:flex; gap:4px; margin-bottom:4px;">
                        <input type="number" id="prod-stock" class="form-control" placeholder="Stok" style="flex:1;">
                        <input type="number" id="prod-min-stock" class="form-control" placeholder="Min Stok" style="flex:1;">
                    </div>
                    <div style="display:flex; gap:4px; margin-bottom:4px; align-items:center;">
                        <div style="flex:1;">
                            <label style="font-size:0.7rem; opacity:0.7; display:block; margin-bottom:2px;">📅 Tgl Expired</label>
                            <input type="date" id="prod-expired" class="form-control" style="width:100%;">
                        </div>
                        <div style="flex:1; display:flex; align-items:end; padding-bottom:2px;">
                            <span style="font-size:0.65rem; opacity:0.6;">Kosongkan jika tidak ada expired</span>
                        </div>
                    </div>

                    <!-- PAJAK PER PRODUK - FIX DARK MODE SYNC -->
                    <div style="margin:0 0 6px 0; padding:10px; background:var(--bg-card, #1e293b); border:1px solid var(--border-color, #334155); border-radius:8px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-color, #e2e8f0);">
                            <input type="checkbox" id="prod-tax-enabled" style="width:18px; height:18px; accent-color:var(--accent-color, #3b82f6);">
                            <span>Aktifkan Pajak untuk produk ini</span>
                        </label>
                        <div id="prod-tax-group" style="display:none; margin-top:10px; flex-direction:row; align-items:center; gap:8px;">
                            <div style="flex:1; display:flex; align-items:center; gap:6px;">
                                <input type="number" id="prod-tax-rate" class="form-control" value="11" min="0" max="100" step="0.1" placeholder="11" style="flex:1;">
                                <span style="font-weight:600; color:var(--text-color, #e2e8f0);">%</span>
                            </div>
                            <span style="font-size:0.7rem; opacity:0.6; color:var(--text-secondary, #94a3b8);">Default 11%</span>
                        </div>
                    </div>

                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button id="btn-save-product" class="btn-touch active" style="flex:1;">Simpan</button>
                        <button id="btn-cancel-product" class="btn-touch" style="flex:1; background:var(--bg-card);">Batal</button>
                    </div>
                </div>

                <div class="setting-card" style="margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <input type="text" id="search-product" class="form-control" placeholder="Cari produk / barcode..." style="flex:1; margin-right:6px;">
                        <select id="sort-product" class="form-control" style="width:auto; font-size:0.75rem;">
                            <option value="name-asc">Nama A-Z</option>
                            <option value="name-desc">Nama Z-A</option>
                            <option value="stock-asc">Stok Terendah</option>
                            <option value="price-asc">Harga Termurah</option>
                            <option value="price-desc">Harga Termahal</option>
                        </select>
                    </div>
                    <div id="product-list">
                        ${pageItems.length === 0 ? '<p style="text-align:center; opacity:0.6;">Belum ada produk untuk filter ini</p>' : pageItems.map(p => {
                            const exp = this.getExpiredInfo(p);
                            const isExp = exp.isExpired;
                            const isNear = exp.isNear;
                            const isRusak = p.kondisi==='rusak' || p.status==='rusak';
                            const borderColor = isExp ? '#ef4444' : isRusak ? '#6b7280' : isNear ? '#f59e0b' : 'var(--border-color)';
                            const bgTint = isExp ? 'rgba(239,68,68,0.06)' : isRusak ? 'rgba(107,114,128,0.08)' : isNear ? 'rgba(245,158,11,0.07)' : 'var(--bg-card)';
                            return `
                            <div class="product-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px 8px; margin-bottom:6px; background:${bgTint}; background-color:var(--bg-card); border:1px solid var(--border-color); border-left:3px solid ${borderColor}; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                                <div style="flex:1; min-width:0;">
                                    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                                        <strong style="font-size:0.85rem;">${p.name}</strong>
                                        ${p.taxEnabled ? `<span style="font-size:0.6rem; background:var(--accent-color,#ffc107); color:#fff; padding:2px 6px; border-radius:12px;">Pajak ${p.taxRate || p.taxPercent || 11}%</span>` : ''}
                                        ${isExp ? `<span style="font-size:0.6rem; background:#ef4444; color:#fff; padding:3px 7px; border-radius:12px; font-weight:600; letter-spacing:0.3px;">⛔ ${exp.label}</span>` : ''}
                                        ${!isExp && isNear ? `<span style="font-size:0.6rem; background:#f59e0b; color:#fff; padding:3px 7px; border-radius:12px; font-weight:600;">⏰ H-${exp.days}</span>` : ''}
                                        ${isRusak ? `<span style="font-size:0.6rem; background:var(--bg-secondary); color:var(--text-secondary); border:1px solid var(--border-color); padding:3px 7px; border-radius:12px;">🗑️ RUSAK</span>` : ''}
                                        ${exp.hasExpiry && !isExp && !isNear ? `<span style="font-size:0.6rem; background:var(--bg-secondary); color:var(--text-secondary); border:1px solid var(--border-color); padding:2px 6px; border-radius:12px;">📅 ${exp.labelDate}</span>` : ''}
                                    </div>
                                    <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px; opacity:0.9;">${p.barcode || '-'} • ${p.category || 'Tanpa Kategori'} • Stok: <b style="color:var(--text-color);">${p.stock}</b> ${p.expiredDate ? '• ED: ' + p.expiredDate : exp.hasExpiry ? '• ED: '+exp.labelDate : ''} ${p.kondisi ? '• '+p.kondisi : ''}</div>
                                    <div style="font-size:0.75rem; color:var(--text-color); margin-top:2px;">Beli: <span style="color:var(--text-secondary);">Rp${(p.buyPrice ?? p.costPrice ?? 0).toLocaleString()}</span> | Jual: <b>Rp${Number(p.price).toLocaleString()}</b></div>
                                    ${(() => {
                                        // Hitung total rusak dari log (bukan cuma disposal terakhir)
                                        let totalRusakPcs = 0;
                                        let lastReason = '';
                                        try {
                                            const logs = JSON.parse(localStorage.getItem('edc_disposal_logs')||'[]');
                                            const myLogs = logs.filter(l=>String(l.prodId)===String(p.id) && l.type==='rusak');
                                            totalRusakPcs = myLogs.reduce((s,l)=>s+Number(l.qty||0),0);
                                            if(myLogs.length>0) lastReason = myLogs[myLogs.length-1].reason||'';
                                        } catch(e){}
                                        // Fallback ke p.disposal kalau belum ada di LS (data lama)
                                        if(totalRusakPcs===0 && p.disposal && p.disposal.type==='rusak') {
                                            totalRusakPcs = Number(p.disposal.qty||0);
                                            lastReason = p.disposal.reason||'';
                                        }
                                        if(totalRusakPcs>0) {
                                            return `<div style="font-size:0.65rem; color:#ef4444; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:3px 6px; border-radius:6px; margin-top:4px; display:inline-block;">🚮 ${totalRusakPcs} pcs rusak${lastReason ? ' - '+lastReason : ''}</div>`;
                                        }
                                        // Kalau ada disposal expired juga tampilkan
                                        if(p.disposal && p.disposal.type==='expired') {
                                            return `<div style="font-size:0.65rem; color:#ef4444; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:3px 6px; border-radius:6px; margin-top:4px; display:inline-block;">🚮 ${p.disposal.qty} pcs expired - ${p.disposal.reason||''}</div>`;
                                        }
                                        return '';
                                    })()}
                                </div>
                                <div style="display:flex; flex-direction:column; gap:4px; margin-left:8px; min-width:110px;">
                                    <div style="display:flex; gap:4px;">
                                        <button class="btn-touch btn-edit-prod" data-id="${p.id}" style="flex:1; padding:5px 6px; font-size:0.65rem; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-color); border-radius:6px;">✏️ Edit</button>
                                        <button class="btn-touch btn-delete-prod" data-id="${p.id}" style="padding:5px 6px; font-size:0.65rem; background:transparent; border:1px solid #ef4444; color:#ef4444; border-radius:6px;">🗑️</button>
                                    </div>
                                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                                        ${!isExp && !isRusak ? `<button class="btn-touch btn-rusak-prod" data-id="${p.id}" style="flex:1; padding:4px 6px; font-size:0.6rem; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-secondary); border-radius:6px;">Rusak</button>` : ''}
                                        ${!isExp && !isRusak ? `<button class="btn-touch btn-expired-prod" data-id="${p.id}" style="flex:1; padding:4px 6px; font-size:0.6rem; background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; border-radius:6px;">Buang</button>` : ''}
                                        ${isExp || isRusak ? `<button class="btn-touch btn-restore-prod" data-id="${p.id}" style="flex:1; padding:4px 6px; font-size:0.6rem; background:#22c55e; color:#fff; border:none; border-radius:6px;">↩️ Pulihkan</button>` : ''}
                                        <button class="btn-touch btn-opname-prod" data-id="${p.id}" style="padding:4px 6px; font-size:0.6rem; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-secondary); border-radius:6px;">📋 Opname</button>
                                    </div>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                        <button id="btn-prev-page" class="btn-touch" style="padding:4px 8px; font-size:0.7rem;" ${this.currentPage <= 1 ? 'disabled' : ''}>Prev</button>
                        <span style="font-size:0.75rem;">Hal ${this.currentPage} dari ${totalPages}</span>
                        <button id="btn-next-page" class="btn-touch" style="padding:4px 8px; font-size:0.7rem;" ${this.currentPage >= totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            </div>
        `;
    },

    afterRender() {
        // Simpan referensi global untuk onclick inline jika ada
        window.ProdukModule = this;

        document.getElementById('btn-open-add')?.addEventListener('click', () => {
            this.resetForm();
            const card = document.getElementById('form-product-card');
            if (card) {
                card.style.display = 'block';
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        document.getElementById('btn-cancel-product')?.addEventListener('click', () => {
            const card = document.getElementById('form-product-card');
            if (card) card.style.display = 'none';
            this.resetForm();
        });
        document.getElementById('btn-save-product')?.addEventListener('click', () => this.saveProduct());
        document.getElementById('btn-export-products')?.addEventListener('click', () => this.exportProductsCSV());
        document.getElementById('btn-trigger-import')?.addEventListener('click', () => document.getElementById('file-import-products')?.click());
        document.getElementById('file-import-products')?.addEventListener('change', (e) => this.importProductsCSV(e));
        document.getElementById('btn-toggle-prod-scanner')?.addEventListener('click', () => this.toggleScanner());
        document.getElementById('btn-toggle-flash')?.addEventListener('click', () => this.toggleFlashlight());
        document.getElementById('search-product')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('sort-product')?.addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.currentPage = 1;
            window.app.loadModule('produk');
        });
        document.getElementById('btn-prev-page')?.addEventListener('click', () => {
            if (this.currentPage > 1) { this.currentPage--; window.app.loadModule('produk'); }
        });
        document.getElementById('btn-next-page')?.addEventListener('click', () => {
            const sorted = this.getSortedProducts();
            const totalPages = Math.ceil(sorted.length / this.itemsPerPage) || 1;
            if (this.currentPage < totalPages) { this.currentPage++; window.app.loadModule('produk'); }
        });
        document.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.editProduct(id);
            });
        });
        // Filter status
        document.querySelectorAll('[data-filter]').forEach(btn=>{
            btn.addEventListener('click', (e)=>{
                this.filterStatus = e.currentTarget.dataset.filter;
                this.currentPage=1;
                window.app.loadModule('produk');
            });
        });
        document.getElementById('btn-auto-sortir')?.addEventListener('click', ()=>this.autoSortir());
        document.getElementById('btn-disposal-log')?.addEventListener('click', ()=>this.showDisposalLog());
        document.getElementById('btn-opname')?.addEventListener('click', ()=>this.openOpnameModal());
        document.querySelectorAll('.btn-rusak-prod').forEach(btn=>{
            btn.addEventListener('click', (e)=>this.markAsRusak(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.btn-expired-prod').forEach(btn=>{
            btn.addEventListener('click', (e)=>this.markAsExpiredDisposed(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.btn-restore-prod').forEach(btn=>{
            btn.addEventListener('click', (e)=>this.restoreProduct(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.btn-opname-prod').forEach(btn=>{
            btn.addEventListener('click', (e)=>this.opnameProduct(e.currentTarget.dataset.id));
        });

        document.querySelectorAll('.btn-delete-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.deleteProduct(id);
            });
        });

        // Listener Pajak - FIX: pastikan element ada
        const taxCheck = document.getElementById('prod-tax-enabled');
        const taxGroup = document.getElementById('prod-tax-group');
        const taxRate = document.getElementById('prod-tax-rate');
        taxCheck?.addEventListener('change', (e) => {
            if (!taxGroup) return;
            taxGroup.style.display = e.target.checked ? 'flex' : 'none';
            if (e.target.checked && taxRate && !taxRate.value) {
                taxRate.value = 11;
            }
        });
    },

    // alias untuk kompatibilitas jika app memanggil init()
    init() {
        this.afterRender();
    },

    getSortedProducts() {
        let filtered = [...this.products];
        const searchVal = document.getElementById('search-product')?.value?.toLowerCase() || '';
        if (searchVal) {
            filtered = filtered.filter(p => p.name.toLowerCase().includes(searchVal) || (p.barcode && p.barcode.toLowerCase().includes(searchVal)));
        }
        switch (this.sortBy) {
            case 'name-asc': return filtered.sort((a,b) => a.name.localeCompare(b.name));
            case 'name-desc': return filtered.sort((a,b) => b.name.localeCompare(a.name));
            case 'stock-asc': return filtered.sort((a,b) => a.stock - b.stock);
            case 'price-asc': return filtered.sort((a,b) => a.price - b.price);
            case 'price-desc': return filtered.sort((a,b) => b.price - a.price);
            default: return filtered;
        }
    },

    handleSearch(val) {
        this.currentPage = 1;
        window.app.loadModule('produk');
    },

    async saveProduct() {
        const idEl = document.getElementById('prod-id');
        const barcodeEl = document.getElementById('prod-barcode');
        const nameEl = document.getElementById('prod-name');
        const catEl = document.getElementById('prod-category');
        const buyEl = document.getElementById('prod-buy-price');
        const priceEl = document.getElementById('prod-price');
        const stockEl = document.getElementById('prod-stock');
        const expEl = document.getElementById('prod-expired');
        const taxEnabledEl = document.getElementById('prod-tax-enabled');
        const taxRateEl = document.getElementById('prod-tax-rate');

        if (!nameEl || !priceEl) {
            alert('Form tidak ditemukan, refresh halaman!');
            return;
        }

        const id = idEl?.value?.trim() || '';
        const barcode = barcodeEl?.value?.trim() || '';
        const name = nameEl.value.trim();
        const category = catEl?.value || '';
        const buyPrice = Number(buyEl?.value) || 0;
        const price = Number(priceEl.value) || 0;
        const stock = Number(stockEl?.value) || 0;
        const minStockEl = document.getElementById('prod-min-stock');
        const minStock = Number(minStockEl?.value) || 5;
        const expiredDate = expEl?.value || '';

        const taxEnabled = taxEnabledEl?.checked || false;
        let taxRate = 11;
        if (taxRateEl) {
            const raw = taxRateEl.value.trim();
            if (raw === '' && taxEnabled) {
                taxRate = 11;
            } else {
                const parsed = Number(raw);
                if (!isNaN(parsed)) taxRate = parsed;
            }
        }
        if (taxRate < 0) taxRate = 0;
        if (taxRate > 100) taxRate = 100;

        if (!name) return alert('Nama produk wajib diisi!');
        if (!price) return alert('Harga jual wajib diisi!');

        // FIX: cegah SKU/barcode duplikat saat tambah manual (case-insensitive)
        if (barcode) {
            const dup = this.products.find(p => p.barcode && p.barcode.trim().toLowerCase() === barcode.toLowerCase() && String(p.id) !== String(id));
            if (dup) {
                return alert(`SKU/Barcode "${barcode}" sudah dipakai oleh produk: ${dup.name}`);
            }
        }

        try {
            const wasActiveSave = this.scannerActive;
            this.scannerActive = false;
            Scanner.stopCamera();

            const payload = {
                barcode,
                name,
                category,
                buyPrice,
                costPrice: buyPrice,
                price,
                stock,
                minStock,
                min_stock: minStock,
                expiredDate,
                expired: expiredDate,
                expired_date: expiredDate,
                taxEnabled: taxEnabled,
                taxRate: taxEnabled ? taxRate : 0,
                taxPercent: taxEnabled ? taxRate : 0
            };
            if (id) payload.id = id;

            await DB.saveProduct(payload);
            const card = document.getElementById('form-product-card');
            if (card) card.style.display = 'none';
            this.resetForm();
            window.app.loadModule('produk');
            this.scannerActive = wasActiveSave;
            setTimeout(() => alert('Produk Berhasil Disimpan!'), 350);
        } catch (error) {
            console.error('Error saat menyimpan produk:', error);
            alert('Gagal menyimpan produk: ' + error);
        }
    },

    async quickRestock(id, qty) {
        const prod = this.products.find(p => String(p.id) === String(id));
        if (prod) {
            prod.stock = Number(prod.stock) + qty;
            await DB.saveProduct(prod);
            Scanner.releaseProcessing();
            window.app.loadModule('produk');
        }
    },

    async editProduct(id) {
        const p = this.products.find(item => String(item.id) === String(id));
        if (!p) {
            alert('Produk tidak ditemukan: ' + id);
            return;
        }

        // Pastikan form ada dulu
        const card = document.getElementById('form-product-card');
        if (!card) {
            alert('Form produk tidak ditemukan');
            return;
        }

        const titleEl = document.getElementById('form-title');
        if (titleEl) titleEl.textContent = 'Edit Produk';

        const idEl = document.getElementById('prod-id');
        const barcodeEl = document.getElementById('prod-barcode');
        const nameEl = document.getElementById('prod-name');
        const catEl = document.getElementById('prod-category');
        const buyEl = document.getElementById('prod-buy-price');
        const priceEl = document.getElementById('prod-price');
        const stockEl = document.getElementById('prod-stock');
        const expEl = document.getElementById('prod-expired');
        const taxCheck = document.getElementById('prod-tax-enabled');
        const taxRate = document.getElementById('prod-tax-rate');
        const taxGroup = document.getElementById('prod-tax-group');

        if (idEl) idEl.value = p.id;
        if (barcodeEl) barcodeEl.value = p.barcode || '';
        if (nameEl) nameEl.value = p.name;
        if (catEl) catEl.value = p.category || '';
        if (buyEl) buyEl.value = p.buyPrice ?? p.costPrice ?? 0;
        if (priceEl) priceEl.value = p.price;
        if (stockEl) stockEl.value = p.stock;
        const minStockEl = document.getElementById('prod-min-stock');
        if (minStockEl) minStockEl.value = p.minStock ?? p.min_stock ?? 5;
        if (expEl) expEl.value = p.expiredDate || p.expired || p.expired_date || p.tgl_expired || '';

        const enabled = !!(p.taxEnabled || (p.taxPercent > 0) || (p.taxRate > 0 && p.taxEnabled !== false && p.taxPercent !== 0 ? true : false));
        // logic lebih aman: cek taxEnabled secara eksplisit
        const isTaxOn = p.taxEnabled === true || (p.taxEnabled === undefined && (p.taxRate > 0 || p.taxPercent > 0));
        const rate = p.taxRate ?? p.taxPercent ?? 11;

        if (taxCheck) taxCheck.checked = isTaxOn;
        if (taxRate) taxRate.value = rate || 11;
        if (taxGroup) taxGroup.style.display = isTaxOn ? 'flex' : 'none';

        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async deleteProduct(id) {
        if (confirm('Yakin ingin menghapus produk ini?')) {
            try {
                await DB.deleteProduct(id);
                window.app.loadModule('produk');
            } catch (err) {
                alert('Gagal menghapus produk: ' + err.message);
            }
        }
    },

    exportProductsCSV() {
        if (this.products.length === 0) return alert('Belum ada data produk!');
        let csvContent = "data:text/csv;charset=utf-8,barcode,name,category,buyPrice,price,stock,expiredDate,taxEnabled,taxRate\n";
        this.products.forEach(p => {
            const taxEnabled = p.taxEnabled ? '1' : '0';
            const taxRate = p.taxRate ?? p.taxPercent ?? (p.taxEnabled ? 11 : 0);
            csvContent += `"${p.barcode || ''}","${p.name}","${p.category || ''}","${p.buyPrice ?? p.costPrice ?? 0}","${p.price}","${p.stock}","${p.expiredDate || ''}","${taxEnabled}","${taxRate}"\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Produk_Export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    importProductsCSV(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const lines = evt.target.result.split('\n');
            let success = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
                if (cols.length >= 2) {
                    const buyPrice = Number(cols[3]) || 0;
                    const taxEnabled = cols[7] === '1' || cols[7]?.toLowerCase() === 'true';
                    let taxRate = Number(cols[8]);
                    if (isNaN(taxRate) && taxEnabled) taxRate = 11;
                    if (isNaN(taxRate)) taxRate = 0;
                    await DB.saveProduct({
                        barcode: cols[0],
                        name: cols[1],
                        category: cols[2] || '',
                        buyPrice: buyPrice,
                        costPrice: buyPrice,
                        price: Number(cols[4]) || 0,
                        stock: Number(cols[5]) || 0,
                        expiredDate: cols[6] || '',
                        taxEnabled: taxEnabled,
                        taxRate: taxRate,
                        taxPercent: taxRate
                    });
                    success++;
                }
            }
            alert(`Berhasil mengimpor ${success} produk!`);
            window.app.loadModule('produk');
        };
        reader.readAsText(file);
    },

    toggleScanner() {
        this.scannerActive = !this.scannerActive;
        window.app.loadModule('produk');
        if (this.scannerActive) {
            setTimeout(() => {
                Scanner.startCamera('produk-scanner-view', (code) => this.onBarcodeScanned(code), (hasTorch) => {
                    const flashBtn = document.getElementById('btn-toggle-flash');
                    if (flashBtn) flashBtn.disabled = !hasTorch;
                });
            }, 100);
        } else {
            Scanner.stopCamera();
        }
    },

    async toggleFlashlight() {
        const isOn = await Scanner.toggleFlashlight();
        const flashBtn = document.getElementById('btn-toggle-flash');
        if (flashBtn) {
            flashBtn.textContent = isOn ? '🔦 Flashlight ON' : '🔦 Flashlight OFF';
            flashBtn.style.background = isOn ? 'var(--accent-color, #007bff)' : 'var(--bg-card)';
            flashBtn.style.color = isOn ? '#fff' : 'inherit';
        }
    },

    async onBarcodeScanned(code) {
        const existing = this.products.find(p => p.barcode === code);
        if (existing) {
            if (confirm(`Barcode terdeteksi: ${existing.name}. Restok +1 barang?`)) {
                await this.quickRestock(existing.id, 1);
            } else {
                Scanner.releaseProcessing();
            }
        } else {
            if (confirm(`Barcode baru [${code}]. Tambah ke produk baru?`)) {
                this.resetForm();
                const barcodeEl = document.getElementById('prod-barcode');
                if (barcodeEl) barcodeEl.value = code;
                const card = document.getElementById('form-product-card');
                if (card) card.style.display = 'block';
                Scanner.releaseProcessing();
            } else {
                Scanner.releaseProcessing();
            }
        }
    },

    resetForm() {
        const titleEl = document.getElementById('form-title');
        if (titleEl) titleEl.textContent = 'Tambah Produk Baru';
        const idEl = document.getElementById('prod-id');
        const barcodeEl = document.getElementById('prod-barcode');
        const nameEl = document.getElementById('prod-name');
        const catEl = document.getElementById('prod-category');
        const buyEl = document.getElementById('prod-buy-price');
        const priceEl = document.getElementById('prod-price');
        const stockEl = document.getElementById('prod-stock');
        const expEl = document.getElementById('prod-expired');
        const taxCheck = document.getElementById('prod-tax-enabled');
        const taxRate = document.getElementById('prod-tax-rate');
        const taxGroup = document.getElementById('prod-tax-group');

        if (idEl) idEl.value = '';
        if (barcodeEl) barcodeEl.value = '';
        if (nameEl) nameEl.value = '';
        if (catEl) catEl.value = '';
        if (buyEl) buyEl.value = '';
        if (priceEl) priceEl.value = '';
        if (stockEl) stockEl.value = '';
        const minStockEl = document.getElementById('prod-min-stock');
        if (minStockEl) minStockEl.value = '';
        if (expEl) expEl.value = '';
        if (taxCheck) taxCheck.checked = false;
        if (taxRate) taxRate.value = 11;
        if (taxGroup) taxGroup.style.display = 'none';
    },

    // === FITUR BARU SORTIR / OPNAME / EXPIRED / RUSAK ===
    async autoSortir() {
        const expired = this.products.filter(p=>this.isProductExpired(p) && p.kondisi!=='rusak' && p.status!=='rusak');
        const near = this.products.filter(p=>this.isProductNearExpired(p));
        if(expired.length===0 && near.length===0) return alert('Tidak ada produk expired. Near expired: '+near.length+' produk');
        let msg = `Ditemukan:\n- Expired: ${expired.length} produk\n- H-30: ${near.length} produk\n\nPindahkan expired ke status expired (tidak bisa dijual)?`;
        if(!confirm(msg)) return;
        for(const p of expired){
            await DB.saveProduct({...p, status:'expired', kondisi:'expired', expiredAt:new Date().toISOString()});
        }
        alert(`${expired.length} produk expired dipindahkan. Buat promo clearance di modul Promosi!`);
        window.app.loadModule('produk');
    },

    async markAsRusak(id) {
        const p = this.products.find(x=>String(x.id)===String(id));
        if(!p) return;
        const qty = prompt(`Produk: ${p.name}\nStok saat ini: ${p.stock}\nMasukkan jumlah rusak:`, '1');
        if(qty===null) return;
        const q = Number(qty);
        if(isNaN(q) || q<=0 || q>Number(p.stock)) return alert('Jumlah tidak valid!');
        const reason = prompt('Alasan rusak:', '') || '';
        const newStock = Number(p.stock)-q;
        const disposal = { type:'rusak', qty:q, reason, date:new Date().toISOString(), costLoss: q*(p.buyPrice??p.costPrice??0) };
        // Simpan log
        try { await DB.saveDisposalLog({prodId:p.id, prodName:p.name, ...disposal}); } catch(e){}
        // Update produk
        const update = {...p, stock:newStock, kondisi: newStock===0 ? 'rusak' : p.kondisi, disposal, lastOpname:new Date().toISOString()};
        if(newStock===0) { update.status='rusak'; }
        await DB.saveProduct(update);
        alert(`Berhasil tandai ${q} pcs rusak. Stok sisa ${newStock}`);
        window.app.loadModule('produk');
    },

    async markAsExpiredDisposed(id) {
        const p = this.products.find(x=>String(x.id)===String(id));
        if(!p) return;
        const exp = this.getExpiredInfo(p);
        if(!confirm(`Buang produk expired?\n${p.name}\n${exp.label} (${exp.labelDate})\nStok: ${p.stock}\n\nStok akan jadi 0 dan masuk log kerugian.`)) return;
        const reason = prompt('Alasan buang:', exp.label) || exp.label;
        const qty = Number(p.stock||0);
        const disposal = { type:'expired', qty, reason, date:new Date().toISOString(), costLoss: qty*(p.buyPrice??p.costPrice??0), expiredDate:p.expiredDate };
        try { await DB.saveDisposalLog({prodId:p.id, prodName:p.name, ...disposal}); } catch(e){}
        await DB.saveProduct({...p, stock:0, status:'expired', kondisi:'expired', disposal, expiredAt:new Date().toISOString()});
        alert(`Produk ${p.name} dibuang (${qty} pcs). Kerugian Rp ${(disposal.costLoss).toLocaleString()}`);
        window.app.loadModule('produk');
    },

    async restoreProduct(id) {
        const p = this.products.find(x=>String(x.id)===String(id));
        if(!p) return;
        if(!confirm(`Pulihkan ${p.name} ke status aktif?`)) return;
        await DB.saveProduct({...p, status:'active', kondisi:'baik', disposal:null});
        window.app.loadModule('produk');
    },

    async opnameProduct(id) {
        const p = this.products.find(x=>String(x.id)===String(id));
        if(!p) return;
        const realStock = prompt(`Opname Stok - ${p.name}\nStok sistem: ${p.stock}\nMasukkan stok fisik sebenarnya:`, String(p.stock));
        if(realStock===null) return;
        const rs = Number(realStock);
        if(isNaN(rs) || rs<0) return alert('Stok tidak valid!');
        const diff = rs - Number(p.stock);
        if(diff===0) return alert('Stok sama, tidak perlu opname');
        const reason = prompt(`Selisih: ${diff>0?'+':''}${diff} pcs\nAlasan selisih:`, 'stok opname') || 'opname';
        const cost = Number(p.buyPrice ?? p.costPrice ?? p.cost ?? 0);
        const costLoss = diff < 0 ? Math.abs(diff) * cost : 0; // hanya rugi kalau stok fisik < sistem
        const log = { type:'opname', qty:Math.abs(diff), diff, reason, date:new Date().toISOString(), before:Number(p.stock), after:rs, costLoss, cost };
        try { await DB.saveDisposalLog({prodId:p.id, prodName:p.name, ...log}); } catch(e){}
        await DB.saveProduct({...p, stock:rs, opnameDiff:diff, lastOpname:new Date().toISOString(), lastOpnameReason:reason});
        alert(`Opname berhasil! ${p.name}: ${p.stock} -> ${rs} (selisih ${diff})`);
        window.app.loadModule('produk');
    },

    async openOpnameModal() {
        const total = this.products.length;
        const summary = this.getSortirSummary();
        const input = prompt(`Stock Opname Total\nTotal produk: ${total}\nBaik: ${summary.baik} | H-30: ${summary.near} | Expired: ${summary.expired} | Rusak: ${summary.rusak}\n\nMasukkan barcode untuk opname cepat atau kosong untuk opname manual semua:`);
        if(input===null) return;
        if(input.trim()){
            const prod = this.products.find(p=>p.barcode===input.trim() || String(p.id)===input.trim());
            if(prod) this.opnameProduct(prod.id);
            else alert('Produk tidak ditemukan: '+input);
        } else {
            // buka mode opname: filterStatus opname
            this.filterStatus='all';
            alert('Mode Opname: Klik tombol Opname di tiap produk untuk sesuaikan stok fisik');
        }
    },

    async showDisposalLog() {
        try {
            const logs = await DB.getDisposalLogs() || JSON.parse(localStorage.getItem('edc_disposal_logs')||'[]');
            if(!logs.length) return alert('Belum ada log buang/rusak/opname');
            let html = logs.slice(-20).reverse().map(l=>`${new Date(l.date).toLocaleDateString('id-ID')} - ${l.prodName} - ${l.type} ${l.qty} pcs - Rp ${(l.costLoss||0).toLocaleString()} - ${l.reason||''}`).join('\n');
            alert(`Log 20 terakhir:\n${html}\n\nTotal ${logs.length} log. Cek di laporan untuk total kerugian.`);
        } catch(e){
            alert('Gagal ambil log: '+e.message);
        }
    }
};


export default ProdukModule;
