import DB from './db.js';

if (!window._laporanState) {
    window._laporanState = {
        filterType: 'today',
        paymentFilter: 'all',
        customStartDate: '',
        customEndDate: '',
        currentPage: 1,
        itemsPerPage: 10,
        selectedTrxDetail: null
    };
}

const LaporanModule = {
    transactions: [],
    products: [],

    get filterType() { return window._laporanState.filterType; },
    set filterType(val) { window._laporanState.filterType = val; },

    get paymentFilter() { return window._laporanState.paymentFilter; },
    set paymentFilter(val) { window._laporanState.paymentFilter = val; },

    get customStartDate() { return window._laporanState.customStartDate; },
    set customStartDate(val) { window._laporanState.customStartDate = val; },

    get customEndDate() { return window._laporanState.customEndDate; },
    set customEndDate(val) { window._laporanState.customEndDate = val; },

    get currentPage() { return window._laporanState.currentPage; },
    set currentPage(val) { window._laporanState.currentPage = val; },

    get itemsPerPage() { return window._laporanState.itemsPerPage; },

    get selectedTrxDetail() { return window._laporanState.selectedTrxDetail; },
    set selectedTrxDetail(val) { window._laporanState.selectedTrxDetail = val; },

    refreshView() {
        if (window.app && typeof window.app.loadModule === 'function') {
            window.app.loadModule('laporan');
        } else if (typeof window.loadModule === 'function') {
            window.loadModule('laporan');
        } else {
            const container = document.getElementById('main-content') || document.getElementById('app') || document.body;
            this.render().then(html => {
                if (container) container.innerHTML = html;
                this.init();
            });
        }
    },

    getCustomerName(t) {
        if (!t) return '';
        if (typeof t.customer === 'object' && t.customer !== null) {
            return t.customer.name || t.customer.nama || t.customer.namaPelanggan || '';
        }
        if (typeof t.pelanggan === 'object' && t.pelanggan !== null) {
            return t.pelanggan.name || t.pelanggan.nama || t.pelanggan.namaPelanggan || '';
        }
        if (typeof t.customerInfo === 'object' && t.customerInfo !== null) {
            return t.customerInfo.nama || t.customerInfo.name || '';
        }
        return t.customerName || t.namaPelanggan || t.customer || t.pelanggan || t.client || t.nama || '';
    },

    getCustomerPhone(t) {
        if (!t) return '';
        if (typeof t.customer === 'object' && t.customer !== null) {
            return t.customer.phone || t.customer.telepon || t.customer.hp || t.customer.wa || t.customer.noHp || '';
        }
        if (typeof t.pelanggan === 'object' && t.pelanggan !== null) {
            return t.pelanggan.phone || t.pelanggan.telepon || t.pelanggan.hp || t.pelanggan.wa || t.pelanggan.noHp || '';
        }
        if (typeof t.customerInfo === 'object' && t.customerInfo !== null) {
            return t.customerInfo.wa || t.customerInfo.phone || t.customerInfo.hp || '';
        }
        return t.customerPhone || t.phone || t.telepon || t.hp || t.wa || t.noHp || t.whatsapp || t.no_hp || '';
    },

    getOperatorName(t) {
        if (!t) return '-';
        if (typeof t.operator === 'object' && t.operator !== null) {
            return t.operator.name || t.operator.nama || t.operator.username || 'Admin';
        }
        return t.operator || t.admin || t.kasir || t.cashier || t.userName || 'Admin';
    },

    async render() {
        try {
            this.transactions = await DB.getTransactions() || [];
        } catch (err) {
            console.error('Gagal mengambil transaksi:', err);
            this.transactions = [];
        }

        try {
            this.products = await DB.getProducts() || [];
        } catch (err) {
            console.error('Gagal mengambil produk:', err);
            this.products = [];
        }

        const productCostMap = {};
        this.products.forEach(p => {
            const docId = String(p.docId || p.id || '');
            if (docId) {
                const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? p.hpp ?? 0);
                productCostMap[docId] = isNaN(cost) ? 0 : cost;
            }
        });

        const totalAsetPenjualan = this.products.reduce((sum, p) => sum + ((Number(p.price || p.hargaJual) || 0) * (Number(p.stock || p.stok) || 0)), 0);
        const totalAsetModal = this.products.reduce((sum, p) => {
            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? p.hpp ?? 0);
            return sum + (cost * (Number(p.stock || p.stok) || 0));
        }, 0);

        const filteredData = this.getFilteredTransactions();
        const totalOmset = filteredData.reduce((sum, t) => sum + (Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0)), 0);
        const totalTrx = filteredData.length;

        let totalHPP = 0;
        let totalLabaBersih = 0;

        const enrichedTransactions = filteredData.map(t => {
            let trxHPP = 0;
            const items = t.items || t.cart || t.produk || [];

            if (Array.isArray(items) && items.length > 0) {
                items.forEach(item => {
                    const itemId = String(item.docId || item.id || item.prodId || item.productId || item.product_id || '');
                    const fallbackCost = productCostMap[itemId] || 0;
                    
                    const rawCost = item.costPrice ?? item.cogs ?? item.buyPrice ?? item.hargaBeli ?? item.modal ?? item.cost ?? item.hpp ?? fallbackCost;
                    const cost = Number(rawCost) || 0;
                    const qty = Number(item.qty ?? item.quantity ?? item.jumlah ?? 1) || 1;

                    trxHPP += (cost * qty);
                });
            } else if (t.totalHPP !== undefined || t.hpp !== undefined || t.cogs !== undefined || t.totalBuyPrice !== undefined) {
                trxHPP = Number(t.totalHPP ?? t.totalBuyPrice ?? t.hpp ?? t.cogs) || 0;
            }

            const trxOmset = Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
            const trxLaba = trxOmset - trxHPP;

            totalHPP += trxHPP;
            totalLabaBersih += trxLaba;

            return {
                ...t,
                computedOmset: trxOmset,
                computedHPP: trxHPP,
                computedLaba: trxLaba
            };
        });

        const profitMargin = totalOmset > 0 ? ((totalLabaBersih / totalOmset) * 100).toFixed(1) : '0.0';
        const avgBasketSize = totalTrx > 0 ? Math.round(totalOmset / totalTrx) : 0;

        const itemStats = {};
        const paymentStats = {};

        const availablePaymentMethods = new Set();
        this.transactions.forEach(t => {
            const method = t.paymentMethod || t.metodePembayaran || 'Tunai';
            availablePaymentMethods.add(method);
        });

        enrichedTransactions.forEach(t => {
            const method = t.paymentMethod || t.metodePembayaran || 'Tunai';
            paymentStats[method] = (paymentStats[method] || 0) + t.computedOmset;

            const items = t.items || t.cart || t.produk || [];
            if (Array.isArray(items)) {
                items.forEach(item => {
                    const name = item.name || item.nama || item.title || 'Produk';
                    const qty = Number(item.qty || item.quantity || item.jumlah || 1);
                    itemStats[name] = (itemStats[name] || 0) + qty;
                });
            }
        });

        const topItems = Object.entries(itemStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const totalPages = Math.ceil(enrichedTransactions.length / this.itemsPerPage) || 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const paginatedData = enrichedTransactions.slice(startIndex, startIndex + this.itemsPerPage);

        return `
            <div class="setting-section">
                <h3>Laporan Transaksi & Keuangan</h3>

                <div class="setting-card" style="margin-top:8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="font-size:0.8rem; font-weight:bold;">Periode Laporan:</label>
                            <select id="filter-period" class="form-control" style="margin-top:4px; width:100%;">
                                <option value="today" ${this.filterType === 'today' ? 'selected' : ''}>Hari Ini</option>
                                <option value="week" ${this.filterType === 'week' ? 'selected' : ''}>Minggu Ini</option>
                                <option value="month" ${this.filterType === 'month' ? 'selected' : ''}>Bulan Ini</option>
                                <option value="year" ${this.filterType === 'year' ? 'selected' : ''}>Tahun Ini</option>
                                <option value="custom" ${this.filterType === 'custom' ? 'selected' : ''}>Custom Tanggal</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem; font-weight:bold;">Metode Pembayaran:</label>
                            <select id="filter-payment" class="form-control" style="margin-top:4px; width:100%;">
                                <option value="all" ${this.paymentFilter === 'all' ? 'selected' : ''}>Semua Metode</option>
                                <option value="Hutang" ${this.paymentFilter === 'Hutang' ? 'selected' : ''}>Hutang / Bon</option>
                                ${Array.from(availablePaymentMethods)
                                    .filter(m => m.toLowerCase() !== 'hutang' && m.toLowerCase() !== 'bon')
                                    .map(m => `<option value="${m}" ${this.paymentFilter === m ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div id="custom-date-container" style="display: ${this.filterType === 'custom' ? 'flex' : 'none'}; gap:6px; margin-top:8px;">
                        <input type="date" id="date-start" class="form-control" value="${this.customStartDate}">
                        <input type="date" id="date-end" class="form-control" value="${this.customEndDate}">
                        <button id="btn-apply-custom" class="btn-touch active" style="padding:4px 8px;">Terapkan</button>
                    </div>
                </div>

                <div class="stat-grid" style="margin-top:8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    <div class="stat-card">
                        <h4 style="font-size:0.75rem; color:#666;">TOTAL OMSET</h4>
                        <div class="value" style="color: var(--success-color, #22c55e); font-weight:bold;">Rp ${totalOmset.toLocaleString('id-ID')}</div>
                        <small style="font-size:0.65rem; color:#888;">Total HPP: Rp ${totalHPP.toLocaleString('id-ID')}</small>
                    </div>
                    <div class="stat-card">
                        <h4 style="font-size:0.75rem; color:#666;">LABA BERSIH</h4>
                        <div class="value" style="color: ${totalLabaBersih >= 0 ? '#0284c7' : '#ef4444'}; font-weight:bold;">
                            Rp ${totalLabaBersih.toLocaleString('id-ID')}
                        </div>
                        <small style="font-size:0.65rem; color:#888;">Margin: ${profitMargin}%</small>
                    </div>
                    <div class="stat-card">
                        <h4 style="font-size:0.75rem; color:#666;">TOTAL TRANSAKSI</h4>
                        <div class="value">${totalTrx} TRX</div>
                        <small style="font-size:0.65rem; color:#888;">Rata-rata: Rp ${avgBasketSize.toLocaleString('id-ID')}</small>
                    </div>
                    <div class="stat-card">
                        <h4 style="font-size:0.75rem; color:#666;">TOTAL ASET STOK</h4>
                        <div class="value" style="color:#eab308; font-weight:bold;">Rp ${totalAsetModal.toLocaleString('id-ID')}</div>
                        <small style="font-size:0.65rem; color:#888;">Est. Jual: Rp ${totalAsetPenjualan.toLocaleString('id-ID')}</small>
                    </div>
                </div>

                <!-- Kontainer Chart Canvas -->
                <div class="setting-card" style="margin-top:10px;">
                    <h4 style="margin-bottom:8px;">
                        Grafik Trend Penjualan ${this.filterType === 'today' ? '(Petransaksi / Jam)' : ''}
                    </h4>
                    <div id="chart-container" style="width:100%; min-height:200px; height:200px; position:relative;">
                        <canvas id="chart-penjualan" style="width:100%; height:100%; display:block;"></canvas>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 10px;">
                    <div class="card" style="padding:8px;">
                        <h5 style="margin-bottom:6px; font-size:0.8rem;">📦 5 Produk Terlaris</h5>
                        <ul style="list-style:none; padding:0; margin:0; font-size:0.75rem;">
                            ${topItems.length ? topItems.map(([name, qty]) => `
                                <li style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed #eee; padding-bottom:2px;">
                                    <span>${name}</span>
                                    <b>${qty} pcs</b>
                                </li>
                            `).join('') : '<li style="color:#888;">Belum ada data</li>'}
                        </ul>
                    </div>

                    <div class="card" style="padding:8px;">
                        <h5 style="margin-bottom:6px; font-size:0.8rem;">💳 Metode Pembayaran</h5>
                        <ul style="list-style:none; padding:0; margin:0; font-size:0.75rem;">
                            ${Object.keys(paymentStats).length ? Object.entries(paymentStats).map(([method, amt]) => `
                                <li style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed #eee; padding-bottom:2px;">
                                    <span>${method}</span>
                                    <b>Rp ${amt.toLocaleString('id-ID')}</b>
                                </li>
                            `).join('') : '<li style="color:#888;">Belum ada data</li>'}
                        </ul>
                    </div>
                </div>

                <!-- TOMBOL EKSPOR & IMPOR LAPORAN -->
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button id="btn-export-trx" class="btn-touch active" style="flex:1;">
                        Ekspor Laporan (CSV)
                    </button>
                    <button id="btn-export-json" class="btn-touch" style="flex:1; background:#0284c7; color:#fff;">
                        Ekspor Lengkap (JSON)
                    </button>
                    <button id="btn-import-json" class="btn-touch" style="flex:1; background:#16a34a; color:#fff;">
                        Impor Laporan (JSON)
                    </button>
                    <input type="file" id="file-import-json" accept=".json" style="display:none;">
                </div>

                <div class="card" style="margin-top:10px; padding:6px; overflow-x:auto;">
                    <table class="table-custom" style="width:100%; font-size:0.8rem; border-collapse:collapse;">
                        <thead>
                            <tr style="border-bottom:1px solid #ddd; text-align:left;">
                                <th style="padding:6px;">Waktu</th>
                                <th style="padding:6px;">Metode / Pelanggan</th>
                                <th style="padding:6px;">Omset</th>
                                <th style="padding:6px; color:#0284c7;">Laba Bersih</th>
                                <th style="padding:6px; text-align:center;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paginatedData.length ? paginatedData.map(t => {
                                const docId = t.docId || t.id;
                                const timeStr = t.createdAt || t.timestamp || t.waktu;
                                const formattedTime = timeStr ? new Date(timeStr).toLocaleString('id-ID') : '-';
                                const paymentMethod = t.paymentMethod || t.metodePembayaran || 'Tunai';
                                const isHutang = paymentMethod.toLowerCase().includes('hutang') || 
                                                 paymentMethod.toLowerCase().includes('bon') || 
                                                 (t.change < 0 || t.kembalian < 0);
                                
                                const customerName = this.getCustomerName(t);
                                const customerPhone = this.getCustomerPhone(t);

                                return `
                                    <tr style="border-bottom:1px solid #eee;">
                                        <td style="padding:6px;"><small>${formattedTime}</small></td>
                                        <td style="padding:6px;">
                                            <span style="font-size:0.75rem; font-weight:${isHutang ? 'bold' : 'normal'}; color:${isHutang ? '#dc2626' : 'inherit'};">
                                                ${paymentMethod} ${isHutang ? '(Belum Lunas)' : ''}
                                            </span>
                                            ${customerName ? `<br><small style="color:#2563eb; font-weight:bold;">👤 ${customerName}</small>` : ''}
                                            ${customerPhone ? `<br><small style="color:#666;">📞 ${customerPhone}</small>` : ''}
                                        </td>
                                        <td style="padding:6px;"><b>Rp ${t.computedOmset.toLocaleString('id-ID')}</b></td>
                                        <td style="padding:6px; color:${t.computedLaba >= 0 ? '#0284c7' : '#ef4444'}; font-weight:bold;">
                                            Rp ${t.computedLaba.toLocaleString('id-ID')}
                                        </td>
                                        <td style="padding:6px; text-align:center; white-space:nowrap;">
                                            <button class="btn-detail-trx" data-docid="${docId}" style="padding:4px 8px; font-size:0.7rem; background:#6366f1; color:#fff; border:none; border-radius:4px; cursor:pointer; margin-right:4px;">Detail</button>
                                            ${isHutang ? `
                                                <button class="btn-lunas-trx" data-docid="${docId}" style="padding:4px 8px; font-size:0.7rem; background:#16a34a; color:#fff; border:none; border-radius:4px; cursor:pointer; margin-right:4px;">Set Lunas</button>
                                                <button class="btn-wa-trx" data-docid="${docId}" style="padding:4px 8px; font-size:0.7rem; background:#25d366; color:#fff; border:none; border-radius:4px; cursor:pointer; margin-right:4px;">WA</button>
                                            ` : ''}
                                            <button class="btn-delete-trx" data-docid="${docId}" style="padding:4px 8px; font-size:0.7rem; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer;">Hapus</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : '<tr><td colspan="5" style="text-align:center; padding:12px;">Tidak ada data transaksi</td></tr>'}
                        </tbody>
                    </table>

                    ${totalPages > 1 ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:4px;">
                            <button id="btn-prev-page" class="btn-touch" style="padding:4px 12px; font-size:0.75rem;" ${this.currentPage <= 1 ? 'disabled style="opacity:0.5;"' : ''}>&laquo; Prev</button>
                            <span style="font-size:0.75rem; color:#666;">Halaman <b>${this.currentPage}</b> dari <b>${totalPages}</b></span>
                            <button id="btn-next-page" class="btn-touch" style="padding:4px 12px; font-size:0.75rem;" ${this.currentPage >= totalPages ? 'disabled style="opacity:0.5;"' : ''}>Next &raquo;</button>
                        </div>
                    ` : ''}
                </div>

                ${this.selectedTrxDetail ? this.renderDetailModal(this.selectedTrxDetail) : ''}
            </div>
        `;
    },

    renderDetailModal(trx) {
        const items = trx.items || trx.cart || trx.produk || [];
        const timeStr = trx.createdAt || trx.timestamp || trx.waktu;
        const formattedTime = timeStr ? new Date(timeStr).toLocaleString('id-ID') : '-';
        const customerName = this.getCustomerName(trx);
        const customerPhone = this.getCustomerPhone(trx);
        const operatorName = this.getOperatorName(trx);
        const paymentMethod = trx.paymentMethod || trx.metodePembayaran || 'Tunai';

        const subtotal = Number(trx.subtotal || trx.computedOmset || 0);
        const discount = Number(trx.discount || trx.diskon || 0);
        const total = Number(trx.total || trx.grandTotal || trx.computedOmset || 0);

        return `
            <div id="modal-detail-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; padding:12px;">
                <div style="background:#fff; color:#000; width:100%; max-width:380px; border-radius:8px; padding:16px; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:sans-serif; max-height:90vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:10px;">
                        <h4 style="margin:0; font-size:1rem; color:#1e293b;">Rincian Transaksi</h4>
                        <button id="btn-close-modal-x" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#666;">&times;</button>
                    </div>

                    <div style="font-size:0.75rem; color:#475569; margin-bottom:10px;">
                        <div><b>ID Transaksi:</b> ${trx.id || trx.docId || '-'}</div>
                        <div><b>Waktu:</b> ${formattedTime}</div>
                        <div><b>Kasir / Admin:</b> <span style="color:#0284c7; font-weight:bold;">${operatorName}</span></div>
                        <div><b>Metode Bayar:</b> ${paymentMethod}</div>
                        ${customerName ? `<div><b>Pelanggan:</b> ${customerName} ${customerPhone ? `(${customerPhone})` : ''}</div>` : ''}
                    </div>

                    <div style="border-top:1px dashed #ccc; margin:8px 0;"></div>
                    <div style="font-weight:bold; font-size:0.8rem; margin-bottom:6px;">Daftar Item / Produk:</div>

                    <div style="max-height:200px; overflow-y:auto; border:1px solid #f1f5f9; border-radius:6px; padding:6px; background:#f8fafc;">
                        ${items.length ? items.map(item => {
                            const name = item.name || item.nama || item.title || 'Produk';
                            const qty = Number(item.qty || item.quantity || item.jumlah || 1);
                            const price = Number(item.price || item.hargaJual || item.harga || 0);
                            const itemTotal = qty * price;

                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; font-size:0.75rem;">
                                    <div>
                                        <b style="color:#0f172a;">${name}</b><br>
                                        <span style="color:#64748b;">${qty} x Rp ${price.toLocaleString('id-ID')}</span>
                                    </div>
                                    <div style="font-weight:bold; color:#1e293b;">
                                        Rp ${itemTotal.toLocaleString('id-ID')}
                                    </div>
                                </div>
                            `;
                        }).join('') : '<p style="font-size:0.75rem; color:#94a3b8; text-align:center; margin:10px 0;">Tidak ada item tercatat</p>'}
                    </div>

                    <div style="border-top:1px dashed #ccc; margin:10px 0;"></div>

                    <div style="font-size:0.8rem;">
                        <div style="display:flex; justify-content:space-between; color:#475569; margin-bottom:2px;">
                            <span>Subtotal:</span>
                            <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
                        </div>
                        ${discount > 0 ? `
                            <div style="display:flex; justify-content:space-between; color:#dc2626; margin-bottom:2px;">
                                <span>Diskon:</span>
                                <span>-Rp ${discount.toLocaleString('id-ID')}</span>
                            </div>
                        ` : ''}
                        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem; color:#0f172a; margin-top:6px; border-top:1px solid #e2e8f0; padding-top:4px;">
                            <span>TOTAL:</span>
                            <span style="color:#16a34a;">Rp ${total.toLocaleString('id-ID')}</span>
                        </div>
                    </div>

                    <button id="btn-close-modal" style="width:100%; padding:8px; background:#475569; color:#fff; border:none; border-radius:6px; margin-top:12px; font-size:0.8rem; cursor:pointer;">
                        Tutup
                    </button>
                </div>
            </div>
        `;
    },

    closeDetailModal() {
        this.selectedTrxDetail = null;
        this.refreshView();
    },

    init() {
        window.LaporanModule = this;

        document.getElementById('filter-period')?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.currentPage = 1;
            if (this.filterType !== 'custom') {
                this.refreshView();
            } else {
                const container = document.getElementById('custom-date-container');
                if (container) container.style.display = 'flex';
            }
        });

        document.getElementById('filter-payment')?.addEventListener('change', (e) => {
            this.paymentFilter = e.target.value;
            this.currentPage = 1;
            this.refreshView();
        });

        document.getElementById('btn-apply-custom')?.addEventListener('click', () => {
            this.customStartDate = document.getElementById('date-start')?.value || '';
            this.customEndDate = document.getElementById('date-end')?.value || '';
            this.currentPage = 1;
            this.refreshView();
        });

        document.getElementById('btn-export-trx')?.addEventListener('click', () => {
            this.exportToCSV();
        });

        document.getElementById('btn-export-json')?.addEventListener('click', () => {
            this.exportToJSON();
        });

        document.getElementById('btn-import-json')?.addEventListener('click', () => {
            document.getElementById('file-import-json')?.click();
        });

        document.getElementById('file-import-json')?.addEventListener('change', (e) => {
            this.importFromJSON(e);
        });

        document.getElementById('btn-prev-page')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.refreshView();
            }
        });

        document.getElementById('btn-next-page')?.addEventListener('click', () => {
            this.currentPage++;
            this.refreshView();
        });

        document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeDetailModal());
        document.getElementById('btn-close-modal-x')?.addEventListener('click', () => this.closeDetailModal());

        document.querySelectorAll('.btn-detail-trx').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.getAttribute('data-docid');
                const trx = this.transactions.find(t => String(t.docId || t.id) === String(docId));
                if (trx) {
                    this.selectedTrxDetail = trx;
                    this.refreshView();
                } else {
                    alert('Data transaksi tidak ditemukan.');
                }
            });
        });

        document.querySelectorAll('.btn-lunas-trx').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.getAttribute('data-docid');
                this.handleSetLunas(docId);
            });
        });

        document.querySelectorAll('.btn-wa-trx').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.getAttribute('data-docid');
                this.handleSendWhatsApp(docId);
            });
        });

        document.querySelectorAll('.btn-delete-trx').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.currentTarget.getAttribute('data-docid');
                this.handleDeleteTransaction(docId);
            });
        });

        // Tunda eksekusi renderChart agar DOM benar-benar ter-layout
        setTimeout(() => {
            this.renderChart();
        }, 50);

        // ResizeListener agar grafik menyesuaikan layar ketika di-resize
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this._resizeHandler = () => this.renderChart();
        window.addEventListener('resize', this._resizeHandler);

        // ===== AUTO TRIGGER PROMOSI =====
        this.triggerAutoPromosiScan();
    },

    async triggerAutoPromosiScan() {
        try {
            // Debounce agar tidak spam saat ganti filter cepat
            if (this._autoPromosiTimeout) clearTimeout(this._autoPromosiTimeout);
            this._autoPromosiTimeout = setTimeout(async () => {
                // Coba ambil module yang sudah ada di window, atau dynamic import
                let promosiMod = window.PromosiModule;
                if (!promosiMod) {
                    try {
                        const mod = await import('./promosi.js');
                        promosiMod = mod.default || mod;
                        window.PromosiModule = promosiMod;
                    } catch(e) {
                        console.warn('Gagal load PromosiModule untuk auto-scan', e);
                        return;
                    }
                }
                if (promosiMod && typeof promosiMod.analyzeLaporanData === 'function') {
                    console.log('🤖 [Laporan] Auto-trigger scan promosi...');
                    await promosiMod.analyzeLaporanData({ silent: true });
                    // Simpan notifikasi untuk ditampilkan di badge promosi
                    window._autoPromoCount = (promosiMod.autoSuggestions || []).filter(s => s.status === 'suggested').length;
                    // Optional: tampilkan toast kecil
                    if (window._autoPromoCount > 0 && !window._autoPromoToastShown) {
                        console.log(`🔔 ${window._autoPromoCount} peluang promo baru terdeteksi dari laporan`);
                        // window._autoPromoToastShown = true; // aktifkan jika tidak mau spam
                    }
                }
            }, 1200); // delay 1.2 detik setelah filter berubah
        } catch(err) {
            console.warn('Auto promosi scan error:', err);
        }
    },

    getFilteredTransactions() {
        const now = new Date();

        return this.transactions.filter(t => {
            const paymentMethod = (t.paymentMethod || t.metodePembayaran || 'Tunai').toLowerCase();
            const isHutang = paymentMethod.includes('hutang') || paymentMethod.includes('bon') || (t.change < 0 || t.kembalian < 0);

            if (this.paymentFilter !== 'all') {
                if (this.paymentFilter === 'Hutang') {
                    if (!isHutang) return false;
                } else if (paymentMethod !== this.paymentFilter.toLowerCase()) {
                    return false;
                }
            }

            const rawTime = t.createdAt || t.timestamp || t.waktu;
            if (!rawTime) return false;
            
            const itemDate = new Date(rawTime);
            if (isNaN(itemDate.getTime())) return false;

            if (this.filterType === 'today') {
                return itemDate.toDateString() === now.toDateString();
            } else if (this.filterType === 'week') {
                // Filter Minggu Ini (Senin s/d Minggu)
                const currentDay = now.getDay();
                const diffToMonday = (currentDay === 0 ? -6 : 1 - currentDay);
                
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() + diffToMonday);
                startOfWeek.setHours(0, 0, 0, 0);

                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);

                return itemDate >= startOfWeek && itemDate <= endOfWeek;
            } else if (this.filterType === 'month') {
                return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
            } else if (this.filterType === 'year') {
                return itemDate.getFullYear() === now.getFullYear();
            } else if (this.filterType === 'custom') {
                if (!this.customStartDate || !this.customEndDate) return true;
                const start = new Date(this.customStartDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(this.customEndDate);
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }
            return true;
        }).sort((a, b) => {
            const timeA = new Date(a.createdAt || a.timestamp || a.waktu || 0).getTime();
            const timeB = new Date(b.createdAt || b.timestamp || b.waktu || 0).getTime();
            return timeB - timeA;
        });
    },

    async handleSetLunas(docId) {
        if (!confirm('Tandai transaksi ini sebagai Lunas?')) return;
        try {
            await DB.updateTransaction(docId, {
                paymentMethod: 'CASH',
                metodePembayaran: 'CASH',
                statusHutang: 'PAID'
            });
            alert('Transaksi berhasil ditandai sebagai Lunas.');
            this.refreshView();
        } catch (err) {
            console.error('Gagal memperbarui transaksi:', err);
            alert('Gagal mengubah status transaksi.');
        }
    },

    handleSendWhatsApp(docId) {
        const trx = this.transactions.find(t => String(t.docId || t.id) === String(docId));
        if (!trx) return alert('Data transaksi tidak ditemukan.');

        const phone = this.getCustomerPhone(trx);
        if (!phone) return alert('Nomor telepon/WA tidak tersedia.');

        const customerName = this.getCustomerName(trx) || 'Pelanggan';
        const total = Number(trx.total || trx.grandTotal || trx.subtotal || 0);

        let text = `Halo ${customerName},\n\nKami mengingatkan terkait tagihan transaksi Anda:\n`;
        text += `Total Tagihan: *Rp ${total.toLocaleString('id-ID')}*\n`;
        text += `Status: *Belum Lunas (BON)*\n\n`;
        text += `Mohon dapat segera melakukan pembayaran. Terima kasih!`;

        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.slice(1);
        }

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    },

    async handleDeleteTransaction(docId) {
        if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
        try {
            await DB.deleteTransaction(docId);
            alert('Transaksi berhasil dihapus.');
            this.refreshView();
        } catch (err) {
            console.error('Gagal menghapus transaksi:', err);
            alert('Gagal menghapus transaksi.');
        }
    },

    exportToCSV() {
        const filtered = this.getFilteredTransactions();
        if (!filtered.length) return alert('Tidak ada data untuk diekspor.');

        let csv = 'ID,Waktu,Operator/Kasir,Metode Pembayaran,Nama Pelanggan,No WA,Omset,HPP,Laba Bersih\n';
        filtered.forEach(t => {
            const timeStr = t.createdAt || t.timestamp || t.waktu || '';
            const formattedTime = timeStr ? new Date(timeStr).toLocaleString('id-ID').replace(/,/g, '') : '';
            const operator = this.getOperatorName(t);
            const method = t.paymentMethod || t.metodePembayaran || 'Tunai';
            const name = this.getCustomerName(t) || '-';
            const phone = this.getCustomerPhone(t) || '-';
            const omset = Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);

            let trxHPP = 0;
            const items = t.items || t.cart || t.produk || [];
            if (Array.isArray(items) && items.length > 0) {
                items.forEach(i => {
                    const cost = Number(i.costPrice ?? i.cogs ?? i.buyPrice ?? i.hargaBeli ?? i.modal ?? i.cost ?? i.hpp ?? 0);
                    const qty = Number(i.qty ?? i.quantity ?? i.jumlah ?? 1);
                    trxHPP += (cost * qty);
                });
            } else {
                trxHPP = Number(t.totalHPP ?? t.totalBuyPrice ?? t.hpp ?? t.cogs ?? 0);
            }

            const laba = omset - trxHPP;

            csv += `"${t.id || t.docId || ''}","${formattedTime}","${operator}","${method}","${name}","${phone}",${omset},${trxHPP},${laba}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Laporan_Transaksi_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // EKSPOR LENGKAP DENGAN DETAIL ITEM (JSON)
    exportToJSON() {
        const filtered = this.getFilteredTransactions();
        if (!filtered.length) return alert('Tidak ada data transaksi untuk diekspor.');

        const jsonStr = JSON.stringify(filtered, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Laporan_Transaksi_Lengkap_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // IMPOR LAPORAN LENGKAP (JSON)
    async importFromJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) {
                    return alert('Format file JSON tidak valid. Harus berupa array data transaksi.');
                }

                if (!confirm(`Apakah Anda yakin ingin mengimpor ${importedData.length} data transaksi?`)) {
                    event.target.value = '';
                    return;
                }

                let count = 0;
                for (let trx of importedData) {
                    await DB.saveTransaction(trx);
                    count++;
                }

                alert(`Berhasil mengimpor ${count} data transaksi.`);
                event.target.value = '';
                this.refreshView();
            } catch (err) {
                console.error('Gagal mengimpor file JSON:', err);
                alert('Gagal membaca file JSON. Pastikan format file benar.');
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    },

    // Fungsi Rendering Chart Canvas
    renderChart() {
        const canvas = document.getElementById('chart-penjualan');
        const container = document.getElementById('chart-container');
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');

        // Mengatur ukuran canvas mengikuti lebar kontainer
        const rect = container.getBoundingClientRect();
        const width = rect.width || container.clientWidth || 300;
        const height = rect.height || container.clientHeight || 200;

        canvas.width = width;
        canvas.height = height;

        const filtered = this.getFilteredTransactions();
        const datesMap = {};

        // Urutkan transaksi dari terlama ke terbaru
        const sortedFiltered = [...filtered].reverse();

        // LOGIKA PENENTUAN SUMBU X (Garis Waktu)
        // Jika mode Hari Ini (today), kelompokkan berdasarkan Jam/Waktu transaksi (Petransaksi)
        if (this.filterType === 'today') {
            sortedFiltered.forEach(t => {
                const timeStr = t.createdAt || t.timestamp || t.waktu;
                if (!timeStr) return;

                let d = new Date(timeStr);
                if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) {
                    d = new Date(Number(timeStr));
                }
                if (isNaN(d.getTime())) return;

                // Format Jam:Menit (contoh 14:30)
                const keyLabel = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                const total = Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);

                datesMap[keyLabel] = (datesMap[keyLabel] || 0) + total;
            });
        } else {
            // Mode selain hari ini (Mingguan, Bulanan, Tahunan): kelompokkan per tanggal
            sortedFiltered.forEach(t => {
                const timeStr = t.createdAt || t.timestamp || t.waktu;
                if (!timeStr) return;

                let d = new Date(timeStr);
                if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) {
                    d = new Date(Number(timeStr));
                }
                if (isNaN(d.getTime())) return;

                const keyLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
                const total = Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);

                datesMap[keyLabel] = (datesMap[keyLabel] || 0) + total;
            });
        }

        const allLabels = Object.keys(datesMap);
        const labels = allLabels.slice(-12); // Ambil hingga 12 titik terakhir agar tampilan responsif
        const values = labels.map(lbl => datesMap[lbl]);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Jika data kosong
        if (labels.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Tidak ada data grafik transaksi', canvas.width / 2, canvas.height / 2);
            return;
        }

        const maxVal = Math.max(...values, 1);
        const paddingLeft = 45;
        const paddingRight = 35;
        const paddingTop = 30;
        const paddingBottom = 30;

        const chartWidth = canvas.width - (paddingLeft + paddingRight);
        const chartHeight = canvas.height - (paddingTop + paddingBottom);

        // Garis Grid Dasar / Sumbu X
        ctx.beginPath();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.moveTo(paddingLeft, canvas.height - paddingBottom);
        ctx.lineTo(canvas.width - paddingRight, canvas.height - paddingBottom);
        ctx.stroke();

        // Titik koordinat
        const points = labels.map((label, idx) => {
            let x;
            if (labels.length === 1) {
                x = paddingLeft + (chartWidth / 2);
            } else {
                x = paddingLeft + (idx * (chartWidth / (labels.length - 1)));
            }
            const y = (canvas.height - paddingBottom) - ((values[idx] / maxVal) * chartHeight);
            return { x, y, val: values[idx], label };
        });

        // Area Gradien Warna Bawah Grafis
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, canvas.height - paddingBottom);
            points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.lineTo(points[points.length - 1].x, canvas.height - paddingBottom);
            ctx.closePath();

            const gradient = ctx.createLinearGradient(0, paddingTop, 0, canvas.height - paddingBottom);
            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
            gradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Garis Tren
        if (points.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2.5;

            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
        }

        // Titik Bulat & Teks Angka Penjualan
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label Sumbu X (Jam / Tanggal)
            ctx.fillStyle = '#64748b';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.label, p.x, canvas.height - 10);

            // Label Nilai Nominal Omset
            let valLabel = p.val >= 1000000 ? (p.val / 1000000).toFixed(1) + 'M' : 
                           p.val >= 1000 ? Math.round(p.val / 1000) + 'k' : p.val;
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(valLabel, p.x, p.y - 8);
        });
    }
};

export default LaporanModule;