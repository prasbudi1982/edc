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

    // HELPER SINKRONISASI DENGAN MODUL KARYAWAN TERBARU
    getKaryawanExpenseSummary() {
        const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
        const lsAttendances = JSON.parse(localStorage.getItem('edc_attendances') || '[]');
        const salaries = JSON.parse(localStorage.getItem('edc_salaries') || '[]');
        const shifts = JSON.parse(localStorage.getItem('edc_shifts') || '[]');
        const now = new Date();

        let totalSalaryExpense = 0;
        let details = [];

        operators.forEach(op => {
            const opName = op.name || 'Operator';
            const salSetting = salaries.find(s => String(s.operatorId) === String(op.id)) || {
                dailyRate: 50000,
                weeklyRate: 300000,
                monthlyRate: 1250000,
                bonusPercent: 0
            };

            const opAttendances = lsAttendances.filter(att => String(att.operatorId) === String(op.id));
            const opShift = shifts.find(s => String(s.operatorId) === String(op.id));

            const filteredLogs = opAttendances.map(att => {
                let rawLoginDate = new Date(att.loginTime);
                if (isNaN(rawLoginDate.getTime())) return null;

                let rawLogoutDate = att.logoutTime ? new Date(att.logoutTime) : null;
                let effectiveLoginDate = new Date(rawLoginDate);
                let effectiveLogoutDate = (rawLogoutDate && !isNaN(rawLogoutDate.getTime())) ? new Date(rawLogoutDate) : null;
                let shiftEndDate = null;

                if (opShift && opShift.startTime && opShift.endTime) {
                    const [startHour, startMinute] = opShift.startTime.split(':').map(Number);
                    const [endHour, endMinute] = opShift.endTime.split(':').map(Number);

                    const shiftStartDate = new Date(effectiveLoginDate);
                    shiftStartDate.setHours(startHour, startMinute, 0, 0);

                    shiftEndDate = new Date(effectiveLoginDate);
                    shiftEndDate.setHours(endHour, endMinute, 0, 0);

                    if (shiftEndDate < shiftStartDate) {
                        shiftEndDate.setDate(shiftEndDate.getDate() + 1);
                    }

                    if (rawLoginDate < shiftStartDate) effectiveLoginDate = new Date(shiftStartDate);
                    if (rawLogoutDate && rawLogoutDate > shiftEndDate) effectiveLogoutDate = new Date(shiftEndDate);
                }

                if (!att.logoutTime) {
                    const searchEndBoundary = shiftEndDate || new Date(effectiveLoginDate.getFullYear(), effectiveLoginDate.getMonth(), effectiveLoginDate.getDate(), 23, 59, 59);
                    const opTrxs = this.transactions.filter(t => {
                        const tOpId = t.operator?.id || t.operatorId;
                        const tOpName = t.operator?.name || t.operator;
                        const matchesOp = String(tOpId) === String(op.id) || tOpName === opName;
                        const tDate = new Date(t.createdAt || t.timestamp);
                        return matchesOp && tDate >= effectiveLoginDate && tDate <= searchEndBoundary;
                    }).sort((a,b) => new Date(b.createdAt||b.timestamp) - new Date(a.createdAt||a.timestamp));

                    if (opTrxs.length > 0) {
                        effectiveLogoutDate = new Date(opTrxs[0].createdAt || opTrxs[0].timestamp);
                    } else {
                        const curNow = new Date();
                        effectiveLogoutDate = (shiftEndDate && curNow > shiftEndDate) ? new Date(shiftEndDate) : curNow;
                    }
                }

                const diffMs = Math.max(0, effectiveLogoutDate - effectiveLoginDate);
                const durationMinutes = Math.floor(diffMs / (1000 * 60));
                return { date: effectiveLoginDate, durationMinutes };
            }).filter(item => {
                if (!item) return false;
                const d = item.date;
                if (this.filterType === 'today') {
                    return d.toDateString() === now.toDateString();
                } else if (this.filterType === 'week') {
                    const currentDay = now.getDay();
                    const diffToMonday = (currentDay === 0 ? -6 : 1 - currentDay);
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() + diffToMonday);
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 6);
                    endOfWeek.setHours(23, 59, 59, 999);
                    return d >= startOfWeek && d <= endOfWeek;
                } else if (this.filterType === 'month') {
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                } else if (this.filterType === 'year') {
                    return d.getFullYear() === now.getFullYear();
                } else if (this.filterType === 'custom') {
                    if (!this.customStartDate || !this.customEndDate) return true;
                    const start = new Date(this.customStartDate);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(this.customEndDate);
                    end.setHours(23, 59, 59, 999);
                    return d >= start && d <= end;
                }
                return true;
            });

            const totalMinutes = filteredLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

            let baseRate = salSetting.dailyRate;
            let standardMinutes = 480; 
            if (this.filterType === 'week') {
                baseRate = salSetting.weeklyRate;
                standardMinutes = 480 * 6;
            } else if (this.filterType === 'month' || this.filterType === 'year') {
                baseRate = salSetting.monthlyRate;
                standardMinutes = 480 * 25;
            }

            const ratePerMinute = standardMinutes > 0 ? (baseRate / standardMinutes) : 0;
            const baseSalaryCalculated = Math.round(totalMinutes * ratePerMinute);

            const filteredTrxs = this.getFilteredTransactions().filter(t => {
                const tOpId = t.operator?.id || t.operatorId;
                const tOpName = t.operator?.name || t.operator;
                return String(tOpId) === String(op.id) || tOpName === opName;
            });

            const totalProfit = filteredTrxs.reduce((sum, t) => sum + (Number(t.computedLaba ?? 0)), 0);
            const bonusPercent = Number(salSetting.bonusPercent || 0);
            const bonusCalculated = Math.round((totalProfit * bonusPercent) / 100);

            const totalSalary = baseSalaryCalculated + bonusCalculated;
            if (totalSalary > 0 || totalMinutes > 0) {
                totalSalaryExpense += totalSalary;
                details.push({
                    operatorName: opName,
                    totalMinutes,
                    baseSalaryCalculated,
                    bonusCalculated,
                    totalSalary
                });
            }
        });

        return { totalSalaryExpense, details };
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

        const getExpInfoLaporan = (p) => {
            const expStr = p.expiredDate || p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry;
            if (!expStr) return { isExpired:false, isNear:false };
            let d = new Date(expStr);
            if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
            if (isNaN(d.getTime())) return { isExpired:false, isNear:false };
            const now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
            const diff = Math.floor((d-now)/(1000*60*60*24));
            return { isExpired: diff<0, isNear: diff>=0 && diff<=30, days:diff };
        };

        const activeProducts = this.products.filter(p=>{
            const exp = getExpInfoLaporan(p);
            const isRusak = p.kondisi==='rusak' || p.status==='rusak' || p.status==='expired';
            if (isRusak) return false;
            if (exp.isExpired) return false;
            return true;
        });
        const expiredProductsForAset = this.products.filter(p=> getExpInfoLaporan(p).isExpired || p.status==='expired' || p.kondisi==='expired');
        const rusakProductsForAset = this.products.filter(p=> p.kondisi==='rusak' || p.status==='rusak');

        let disposalLogs = [];
        let idbLogs = [];
        let lsLogs = [];
        try { idbLogs = await DB.getDisposalLogs() || []; } catch(e){ idbLogs = []; }
        try { lsLogs = JSON.parse(localStorage.getItem('edc_disposal_logs')||'[]'); } catch(e){ lsLogs = []; }
        const _map = new Map();
        [...idbLogs, ...lsLogs].forEach(l=>{ if(l && l.id) _map.set(l.id, l); else if(l) _map.set(`${l.prodId}-${l.date}-${l.type}`, l); });
        disposalLogs = Array.from(_map.values());

        const totalAsetPenjualan = activeProducts.reduce((sum, p) => sum + ((Number(p.price || p.hargaJual) || 0) * (Number(p.stock || p.stok) || 0)), 0);
        const totalAsetModal = activeProducts.reduce((sum, p) => {
            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? p.hpp ?? 0);
            return sum + (cost * (Number(p.stock || p.stok) || 0));
        }, 0);
        const totalAsetExpiredModal = expiredProductsForAset.reduce((sum,p)=>{
            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? 0);
            const stok = Number(p.stock||p.stok||0);
            if(stok===0){
                const log = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='expired').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                if(log && log.costLoss) return sum + Number(log.costLoss);
                if(log && log.qty) return sum + (Number(log.qty) * cost);
            }
            return sum + (cost * stok);
        },0);
        const totalAsetRusakModal = rusakProductsForAset.reduce((sum,p)=>{
            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.cost ?? 0);
            const stok = Number(p.stock||p.stok||0);
            if(stok===0){
                const log = disposalLogs.filter(l=>String(l.prodId)===String(p.id) && l.type==='rusak').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                if(log && log.costLoss) return sum + Number(log.costLoss);
                if(log && log.qty) return sum + (Number(log.qty) * cost);
            }
            return sum + (cost * stok);
        },0);
        const totalKerugianAset = totalAsetExpiredModal + totalAsetRusakModal;

        const disposalExpired = disposalLogs.filter(l=>l.type==='expired');
        const disposalRusak = disposalLogs.filter(l=>l.type==='rusak');
        const disposalOpname = disposalLogs.filter(l=>l.type==='opname');
        const totalLossExpiredLog = disposalExpired.reduce((s,l)=>s+(Number(l.costLoss)||0),0);
        const totalLossRusakLog = disposalRusak.reduce((s,l)=>s+(Number(l.costLoss)||0),0);

        const totalLossOpname = disposalOpname.reduce((s,l)=>s + (Number(l.costLoss||0)),0);
        const totalKerugianLog = totalLossExpiredLog + totalLossRusakLog + totalLossOpname;
        const totalOpnameSelisih = disposalOpname.reduce((s,l)=>s+Number(l.diff||0),0);

        const lowStockProducts = this.products.filter(p => {
            const min = Number(p.minStock ?? p.min_stock ?? 5);
            const stok = Number(p.stock ?? p.stok ?? 0);
            return stok <= min;
        }).sort((a,b) => (Number(a.stock||a.stok||0)) - (Number(b.stock||b.stok||0)));

        const lowStockCount = lowStockProducts.length;
        const criticalCount = lowStockProducts.filter(p => Number(p.stock ?? p.stok ?? 0) === 0).length;

        const lowStockHTML = lowStockCount > 0 ? `
                <div class="setting-card" style="margin-top:8px; background:var(--bg-card, #1e293b); border:1px solid var(--border-color, #334155); border-left:5px solid #ef4444; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="document.getElementById('low-stock-detail').style.display = document.getElementById('low-stock-detail').style.display==='none'?'block':'none'">
                            <h4 style="color:var(--text-color, #e2e8f0); margin:0; display:flex; align-items:center; gap:6px; font-size:0.85rem;">
                                ⚠️ Peringatan Stok Menipis
                                <span style="background:#ef4444; color:#fff; font-size:0.7rem; padding:2px 7px; border-radius:10px;">${lowStockCount} produk</span>
                                ${criticalCount > 0 ? `<span style="background:#991b1b; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:10px;">${criticalCount} habis</span>` : ''}
                            </h4>
                            <span style="font-size:0.7rem; color:var(--text-secondary, #94a3b8);">▼ Detail</span>
                        </div>
                    </div>
                    <div id="low-stock-detail" style="display:none; margin-top:10px; max-height:200px; overflow-y:auto;">
                        ${lowStockProducts.map(p => {
                            const stok = Number(p.stock ?? p.stok ?? 0);
                            const isHabis = stok === 0;
                            const isKritis = stok <= 2;
                            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px dashed var(--border-color, #334155); font-size:0.8rem;">
                                <div style="flex:1;">
                                    <strong style="${isHabis ? 'color:#991b1b;' : isKritis ? 'color:#dc2626;' : 'color:#b45309;'}">${p.name || p.nama || 'Tanpa Nama'}</strong>
                                    <div style="font-size:0.7rem; opacity:0.7;">${p.barcode || p.sku || '-'} | ${p.category || p.kategori || 'Tanpa Kategori'}</div>
                                </div>
                                <div style="text-align:right;">
                                    <span style="font-weight:bold; padding:3px 8px; border-radius:12px; border:1px solid var(--border-color); background:${isHabis ? 'rgba(239,68,68,0.12)' : isKritis ? 'rgba(245,158,11,0.12)' : 'rgba(234,179,8,0.12)'}; color:${isHabis ? '#ef4444' : isKritis ? '#f59e0b' : 'var(--text-color)'};">
                                        ${isHabis ? 'HABIS' : stok + ' pcs'}
                                    </span>
                                </div>
                            </div>`;
                        }).join('')}
                        <div style="margin-top:8px; text-align:right;">
                            <button class="btn-touch" style="font-size:0.7rem; padding:5px 10px; background:var(--bg-card); border:1px solid #ef4444; color:#ef4444; border-radius:6px;" onclick="window.app.loadModule('produk')">Kelola Stok</button>
                        </div>
                    </div>
                </div>` : '';

        const getExpiredInfo = (p) => {
            const expStr = p.expired || p.expired_date || p.expDate || p.tgl_expired || p.expiry || p.tglExpired || p.exp || p.expiredDate || p.tanggal_expired;
            if (!expStr) return null;
            let d = new Date(expStr);
            if (isNaN(d.getTime()) && !isNaN(Number(expStr))) d = new Date(Number(expStr));
            if (isNaN(d.getTime())) return null;
            const now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
            const diffDays = Math.floor((d - now) / (1000*60*60*24));
            return { date: d, diffDays, expStr };
        };

        const allWithExpiry = this.products.filter(p => getExpiredInfo(p) !== null);
        const expiredProducts = this.products.filter(p => {
            const info = getExpiredInfo(p);
            if (!info) return false;
            return info.diffDays <= 30;
        }).map(p => {
            const info = getExpiredInfo(p);
            return { product: p, ...info };
        }).sort((a,b) => a.diffDays - b.diffDays);

        const expiredCount = expiredProducts.length;
        const alreadyExpiredCount = expiredProducts.filter(e => e.diffDays < 0).length;
        const near7DaysCount = expiredProducts.filter(e => e.diffDays >=0 && e.diffDays <=7).length;
        const near30DaysCount = expiredProducts.filter(e => e.diffDays >7 && e.diffDays <=30).length;

        const expiredHTML = expiredCount > 0 ? `
                <div class="setting-card" style="margin-top:8px; background:var(--bg-card, #1e293b); border:1px solid var(--border-color, #334155); border-left:5px solid #f59e0b; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; cursor:pointer;" onclick="const el=document.getElementById('expired-detail'); el.style.display = el.style.display==='none'?'block':'none';">
                        <h4 style="color:var(--text-color, #e2e8f0); margin:0; display:flex; align-items:center; gap:6px; font-size:0.85rem; flex-wrap:wrap;">
                            ⏰ Peringatan Expired (H-30)
                            <span style="background:#f59e0b; color:#fff; font-size:0.7rem; padding:2px 7px; border-radius:10px;">${expiredCount} produk</span>
                            ${alreadyExpiredCount > 0 ? `<span style="background:#dc2626; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:10px;">${alreadyExpiredCount} expired</span>` : ''}
                            ${near7DaysCount > 0 ? `<span style="background:#ef4444; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:10px;">${near7DaysCount} H-7</span>` : ''}
                            ${near30DaysCount > 0 ? `<span style="background:#fbbf24; color:#000; font-size:0.65rem; padding:2px 6px; border-radius:10px;">${near30DaysCount} H-30</span>` : ''}
                        </h4>
                        <span style="font-size:0.7rem; color:var(--text-secondary, #94a3b8);">▼ Detail</span>
                    </div>
                    <div id="expired-detail" style="display:none; margin-top:10px; max-height:300px; overflow-y:auto;">
                        ${expiredProducts.map(({product: p, date, diffDays}) => {
                            const stok = Number(p.stock ?? p.stok ?? 0);
                            const cost = Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? 0) || 0;
                            const totalModal = stok * cost;
                            let status = '', bg = '', color = '', icon = '';
                            if (diffDays < 0) {
                                status = `EXPIRED ${Math.abs(diffDays)} hari lalu`; bg = 'rgba(239,68,68,0.12)'; color = '#ef4444'; icon = '🚨';
                            } else if (diffDays === 0) {
                                status = 'EXPIRED HARI INI'; bg = 'rgba(239,68,68,0.12)'; color = '#ef4444'; icon = '🚨';
                            } else if (diffDays <= 7) {
                                status = `H-${diffDays} hari`; bg = 'rgba(245,158,11,0.15)'; color = '#f59e0b'; icon = '⚠️';
                            } else {
                                status = `H-${diffDays} hari`; bg = 'rgba(234,179,8,0.12)'; color = 'var(--text-color)'; icon = '⏰';
                            }
                            const expDateStr = date.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'});
                            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--border-color, #334155); font-size:0.8rem; gap:8px;">
                                <div style="flex:1; min-width:0;">
                                    <strong style="color:${color};">${icon} ${p.name || p.nama || 'Tanpa Nama'}</strong>
                                    <div style="font-size:0.7rem; opacity:0.8; margin-top:2px;">
                                        Exp: ${expDateStr} (${status}) | Stok: ${stok} pcs | Modal: Rp ${totalModal.toLocaleString('id-ID')}
                                    </div>
                                </div>
                                <div style="text-align:right; flex-shrink:0;">
                                    <div style="font-weight:bold; padding:3px 8px; border-radius:12px; border:1px solid var(--border-color); background:${bg}; color:${color}; font-size:0.7rem;">
                                        ${status}
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                        <div style="margin-top:10px; display:flex; gap:6px; justify-content:flex-end;">
                            <button class="btn-touch" style="font-size:0.7rem; padding:5px 10px; background:#f59e0b; color:#fff; border:none; border-radius:6px;" onclick="window.app && window.app.loadModule && window.app.loadModule('promosi')">Buat Promo Clearance</button>
                        </div>
                    </div>
                </div>` : `
                <div class="setting-card" style="margin-top:8px; background:var(--bg-card, #1e293b); border:1px dashed var(--border-color, #334155); border-radius:8px; padding:10px;">
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--text-secondary);">
                        <span>✅</span>
                        <span>Tidak ada produk expired dalam 30 hari</span>
                        <span style="font-size:0.65rem; opacity:0.7;">(${allWithExpiry.length} produk punya tgl expired)</span>
                    </div>
                </div>`;

        const filteredData = this.getFilteredTransactions();
        const totalOmset = filteredData.reduce((sum, t) => sum + (Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0)), 0);
        const totalTrx = filteredData.length;

        let totalHPP = 0;
        let totalLabaKotor = 0;

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
            totalLabaKotor += trxLaba;

            return {
                ...t,
                computedOmset: trxOmset,
                computedHPP: trxHPP,
                computedLaba: trxLaba
            };
        });

        // KARYAWAN EXPENSE CALCULATION & AKUMULASI LABA BERSIH (SINKRON DENGAN MODUL KARYAWAN 3)
        const karyawanExpense = this.getKaryawanExpenseSummary();
        const totalBebanKaryawan = karyawanExpense.totalSalaryExpense;
        const totalLabaBersih = totalLabaKotor - totalBebanKaryawan;

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

                ${lowStockHTML}
                ${expiredHTML}
                ${(() => {
                    const expiredProdIdsFromLog = new Set(disposalExpired.map(l=>String(l.prodId)));
                    const rusakProdIdsFromLog = new Set(disposalRusak.map(l=>String(l.prodId)));
                    const expiredFromLogCount = [...expiredProdIdsFromLog].filter(id=>!expiredProductsForAset.some(p=>String(p.id)===id)).length;
                    const rusakFromLogCount = [...rusakProdIdsFromLog].filter(id=>!rusakProductsForAset.some(p=>String(p.id)===id)).length;

                    const activeCount = activeProducts.length;
                    const expCount = expiredProductsForAset.length + expiredFromLogCount;
                    const rusakCount = rusakProductsForAset.length + rusakFromLogCount;
                    const lossLogCount = disposalLogs.length;
                    if (expCount===0 && rusakCount===0 && lossLogCount===0) return '';
                    return `
                <div class="setting-card" style="margin-top:8px; background:var(--bg-card); border:1px solid var(--border-color); border-left:5px solid #6b7280; border-radius:8px; padding:10px;">
                    <h4 style="margin:0 0 10px 0; font-size:0.8rem; display:flex; align-items:center; gap:6px; color:var(--text-color); flex-wrap:wrap;">📦 Sortir & Kerugian
                        <span style="background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-secondary); font-size:0.6rem; padding:2px 8px; border-radius:12px;">${expCount+rusakCount} tidak aktif • ${disposalOpname.length} opname</span>
                    </h4>
                    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:0.75rem;">
                        <div style="background:var(--bg-card); border:1px solid #ef4444; border-left:3px solid #ef4444; border-radius:8px; padding:8px;">
                            <div style="color:var(--text-secondary); font-size:0.6rem; margin-bottom:2px;">🚨 Expired</div>
                            <div style="font-weight:bold; color:#ef4444; font-size:0.75rem; line-height:1.2;">${disposalExpired.reduce((s,l)=>s+Number(l.qty||0),0) || expCount} pcs<br>Rp ${totalAsetExpiredModal.toLocaleString('id-ID')}</div>
                            <div style="font-size:0.55rem; color:var(--text-secondary); margin-top:4px; line-height:1.2;">Log: Rp ${totalLossExpiredLog.toLocaleString('id-ID')}<br>(${disposalExpired.length} log • ${expCount} prod)</div>
                        </div>
                        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-left:3px solid #6b7280; border-radius:8px; padding:8px;">
                            <div style="color:var(--text-secondary); font-size:0.6rem; margin-bottom:2px;">🗑️ Rusak</div>
                            <div style="font-weight:bold; color:var(--text-color); font-size:0.75rem; line-height:1.2;">${disposalRusak.reduce((s,l)=>s+Number(l.qty||0),0) || rusakCount} pcs<br>Rp ${totalAsetRusakModal.toLocaleString('id-ID')}</div>
                            <div style="font-size:0.55rem; color:var(--text-secondary); margin-top:4px; line-height:1.2;">Log: Rp ${totalLossRusakLog.toLocaleString('id-ID')}<br>(${disposalRusak.length} log • ${rusakCount} prod)</div>
                        </div>
                        <div style="background:var(--bg-card); border:1px solid #f59e0b; border-left:3px solid #f59e0b; border-radius:8px; padding:8px;">
                            <div style="color:var(--text-secondary); font-size:0.6rem; margin-bottom:2px;">📋 Opname</div>
                            <div style="font-weight:bold; color:#f59e0b; font-size:0.75rem; line-height:1.2;">${disposalOpname.length} log<br>${totalOpnameSelisih>0?'+':''}${totalOpnameSelisih} pcs</div>
                            <div style="font-size:0.55rem; color:var(--text-secondary); margin-top:4px; line-height:1.2;">Loss: Rp ${totalLossOpname.toLocaleString('id-ID')}<br>Selisih stok</div>
                        </div>
                    </div>
                    <div style="margin-top:10px; padding:10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; font-size:0.75rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px dashed var(--border-color);">
                            <span style="color:var(--text-secondary); font-size:0.7rem;">Aset Aktif (bisa jual)</span>
                            <b style="color:#22c55e; font-size:0.8rem;">Rp ${totalAsetModal.toLocaleString('id-ID')} • ${activeCount} produk</b>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; margin-top:4px;">
                            <span style="color:var(--text-secondary); font-size:0.7rem;">Total Kerugian (Expired+Rusak+Opname)</span>
                            <b style="color:#ef4444; font-size:0.8rem;">Rp ${(totalKerugianAset + totalKerugianLog).toLocaleString('id-ID')}</b>
                        </div>
                    </div>
                </div>`;
                })()}

                <div class="stat-grid" style="margin-top:10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px;">
                        <h4 style="font-size:0.65rem; color:var(--text-secondary); margin:0 0 4px 0; letter-spacing:0.5px;">TOTAL OMSET</h4>
                        <div class="value" style="color: var(--success-color, #22c55e); font-weight:bold; font-size:0.95rem;">Rp ${totalOmset.toLocaleString('id-ID')}</div>
                        <small style="font-size:0.65rem; color:var(--text-secondary);">HPP: Rp ${totalHPP.toLocaleString('id-ID')}</small>
                    </div>
                    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px;">
                        <h4 style="font-size:0.65rem; color:var(--text-secondary); margin:0 0 4px 0;">LABA BERSIH (NET)</h4>
                        <div class="value" style="color: ${totalLabaBersih >= 0 ? '#0284c7' : '#ef4444'}; font-weight:bold; font-size:0.95rem;">
                            Rp ${totalLabaBersih.toLocaleString('id-ID')}
                        </div>
                        <small style="font-size:0.65rem; color:var(--text-secondary);">Kotor: Rp ${totalLabaKotor.toLocaleString('id-ID')} | Margin: ${profitMargin}%</small>
                    </div>
                    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px;">
                        <h4 style="font-size:0.65rem; color:var(--text-secondary); margin:0 0 4px 0;">TOTAL TRANSAKSI</h4>
                        <div class="value" style="color:var(--text-color); font-weight:bold; font-size:0.9rem;">${totalTrx} TRX</div>
                        <small style="font-size:0.65rem; color:var(--text-secondary);">Rata: Rp ${avgBasketSize.toLocaleString('id-ID')}</small>
                    </div>
                    <div class="stat-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="font-size:0.65rem; color:var(--text-secondary); margin:0; letter-spacing:0.5px;">ASET STOK AKTIF</h4>
                            ${(totalAsetExpiredModal+totalAsetRusakModal)>0 ? `<span style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.2); color:#ef4444; font-size:0.55rem; padding:2px 6px; border-radius:12px; white-space:nowrap;">Loss Rp ${(totalAsetExpiredModal+totalAsetRusakModal).toLocaleString('id-ID')}</span>` : ''}
                        </div>
                        <div class="value" style="color:#eab308; font-weight:bold; font-size:0.95rem; line-height:1.2;">Rp ${totalAsetModal.toLocaleString('id-ID')}</div>
                        <small style="font-size:0.6rem; color:var(--text-secondary); line-height:1.3;">Jual: Rp ${totalAsetPenjualan.toLocaleString('id-ID')} • ${activeProducts.length} produk</small>
                    </div>
                </div>

                <!-- KOMPONEN REKAP GAJI KARYAWAN TERHUBUNG OTOMATIS -->
                <div class="setting-card" style="margin-top:10px; background:var(--bg-card); border:1px solid var(--border-color); border-left:5px solid #2563eb; border-radius:10px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                        <div>
                            <h4 style="margin:0; font-size:0.85rem; color:var(--text-color); display:flex; align-items:center; gap:6px;">
                                👥 Rekap Beban Gaji & Bonus Karyawan
                            </h4>
                            <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">
                                Total Beban Periode Ini: <b style="color:#ef4444;">Rp ${totalBebanKaryawan.toLocaleString('id-ID')}</b>
                            </div>
                        </div>
                        <button class="btn-touch" style="font-size:0.7rem; padding:4px 8px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary);" onclick="const el=document.getElementById('karyawan-expense-detail'); el.style.display = el.style.display==='none'?'block':'none';">
                            ▼ Detail Karyawan
                        </button>
                    </div>

                    <div id="karyawan-expense-detail" style="display:none; margin-top:10px; border-top:1px dashed var(--border-color); padding-top:8px;">
                        ${karyawanExpense.details.length === 0 ? `
                            <p style="font-size:0.75rem; color:var(--text-secondary); margin:0; text-align:center; padding:6px;">Tidak ada beban gaji tercatat untuk periode ini.</p>
                        ` : `
                            <table style="width:100%; font-size:0.75rem; border-collapse:collapse; color:var(--text-color);">
                                <thead>
                                    <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-secondary);">
                                        <th style="padding:4px;">Nama Karyawan</th>
                                        <th style="padding:4px;">Durasi</th>
                                        <th style="padding:4px;">Gaji Pokok</th>
                                        <th style="padding:4px;">Bonus</th>
                                        <th style="padding:4px; text-align:right;">Total Gaji</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${karyawanExpense.details.map(d => `
                                        <tr style="border-bottom:1px dashed var(--border-color);">
                                            <td style="padding:6px 4px; font-weight:bold;">${d.operatorName}</td>
                                            <td style="padding:6px 4px;">${d.totalMinutes} Mnt</td>
                                            <td style="padding:6px 4px;">Rp ${d.baseSalaryCalculated.toLocaleString('id-ID')}</td>
                                            <td style="padding:6px 4px; color:#22c55e;">+Rp ${d.bonusCalculated.toLocaleString('id-ID')}</td>
                                            <td style="padding:6px 4px; text-align:right; font-weight:bold; color:#ef4444;">Rp ${d.totalSalary.toLocaleString('id-ID')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                        <div style="margin-top:8px; text-align:right;">
                            <button class="btn-touch" style="font-size:0.7rem; padding:4px 8px; background:var(--accent-color); color:#fff; border:none; border-radius:6px;" onclick="window.app && window.app.loadModule && window.app.loadModule('karyawan')">Kelola Modul Karyawan</button>
                        </div>
                    </div>
                </div>

                <!-- Kontainer Chart Canvas -->
                <div class="setting-card" style="margin-top:10px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:10px;">
                    <h4 style="margin-bottom:8px; color:var(--text-color); font-size:0.85rem;">
                        Grafik Trend Penjualan ${this.filterType === 'today' ? '(Petransaksi / Jam)' : ''}
                    </h4>
                    <div id="chart-container" style="width:100%; min-height:200px; height:200px; position:relative;">
                        <canvas id="chart-penjualan" style="width:100%; height:100%; display:block;"></canvas>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 10px;">
                    <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px;">
                        <h5 style="margin-bottom:8px; font-size:0.8rem; color:var(--text-color);">📦 5 Produk Terlaris</h5>
                        <ul style="list-style:none; padding:0; margin:0; font-size:0.75rem;">
                            ${topItems.length ? topItems.map(([name, qty]) => `
                                <li style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed var(--border-color); padding-bottom:2px;">
                                    <span>${name}</span>
                                    <b>${qty} pcs</b>
                                </li>
                            `).join('') : '<li style="color:#888;">Belum ada data</li>'}
                        </ul>
                    </div>

                    <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px;">
                        <h5 style="margin-bottom:8px; font-size:0.8rem; color:var(--text-color);">💳 Metode Pembayaran</h5>
                        <ul style="list-style:none; padding:0; margin:0; font-size:0.75rem;">
                            ${Object.keys(paymentStats).length ? Object.entries(paymentStats).map(([method, amt]) => `
                                <li style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed var(--border-color); padding-bottom:2px;">
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

                <div class="card" style="margin-top:10px; padding:8px; overflow-x:auto; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px;">
                    <table class="table-custom" style="width:100%; font-size:0.8rem; border-collapse:collapse; color:var(--text-color);">
                        <thead>
                            <tr style="border-bottom:1px solid var(--border-color); text-align:left; background:var(--bg-secondary);">
                                <th style="padding:8px 6px; color:var(--text-secondary); font-size:0.7rem;">Waktu</th>
                                <th style="padding:8px 6px; color:var(--text-secondary); font-size:0.7rem;">Metode / Pelanggan</th>
                                <th style="padding:8px 6px; color:var(--text-secondary); font-size:0.7rem;">Omset</th>
                                <th style="padding:8px 6px; color:#0284c7; font-size:0.7rem;">Laba</th>
                                <th style="padding:8px 6px; text-align:center; color:var(--text-secondary); font-size:0.7rem;">Aksi</th>
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
                                    <tr style="border-bottom:1px solid var(--border-color);">
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
                <div style="background:var(--bg-card); color:var(--text-color); border:1px solid var(--border-color); width:100%; max-width:380px; border-radius:8px; padding:16px; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:sans-serif; max-height:90vh; overflow-y:auto;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:10px;">
                        <h4 style="margin:0; font-size:1rem; color:var(--text-color);">Rincian Transaksi</h4>
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

                    <div style="max-height:200px; overflow-y:auto; border:1px solid #f1f5f9; border-radius:6px; padding:6px; background:var(--bg-secondary);">
                        ${items.length ? items.map(item => {
                            const name = item.name || item.nama || item.title || 'Produk';
                            const qty = Number(item.qty || item.quantity || item.jumlah || 1);
                            const price = Number(item.price || item.hargaJual || item.harga || 0);
                            const itemTotal = qty * price;

                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; font-size:0.75rem;">
                                    <div>
                                        <b style="color:var(--text-color);">${name}</b><br>
                                        <span style="color:#64748b;">${qty} x Rp ${price.toLocaleString('id-ID')}</span>
                                    </div>
                                    <div style="font-weight:bold; color:var(--text-color);">
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
                        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem; color:var(--text-color); margin-top:6px; border-top:1px solid #e2e8f0; padding-top:4px;">
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

        setTimeout(() => {
            this.renderChart();
        }, 50);

        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this._resizeHandler = () => this.renderChart();
        window.addEventListener('resize', this._resizeHandler);

        this.triggerAutoPromosiScan();
    },

    async triggerAutoPromosiScan() {
        try {
            if (this._autoPromosiTimeout) clearTimeout(this._autoPromosiTimeout);
            this._autoPromosiTimeout = setTimeout(async () => {
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
                    await promosiMod.analyzeLaporanData({ silent: true });
                    window._autoPromoCount = (promosiMod.autoSuggestions || []).filter(s => s.status === 'suggested').length;
                }
            }, 1200);
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

    renderChart() {
        const canvas = document.getElementById('chart-penjualan');
        const container = document.getElementById('chart-container');
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        const rect = container.getBoundingClientRect();
        let width = rect.width || container.clientWidth || container.offsetWidth || 320;
        let height = rect.height || container.clientHeight || 220;
        if (width < 50) width = window.innerWidth - 32 || 320;
        const dpr = window.devicePixelRatio || 1;
        
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(1,0,0,1,0,0);
        ctx.scale(dpr, dpr);

        const filtered = this.getFilteredTransactions();
        let labels = [];
        let values = [];

        const parseDate = (t) => {
            const timeStr = t.createdAt || t.timestamp || t.waktu || t.date;
            if (!timeStr) return null;
            let d = new Date(timeStr);
            if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) d = new Date(Number(timeStr));
            if (isNaN(d.getTime())) return null;
            return d;
        };

        const sorted = [...filtered].sort((a,b)=>{
            const da = parseDate(a); const db = parseDate(b);
            return (da?da.getTime():0) - (db?db.getTime():0);
        });

        if (this.filterType === 'today') {
            if (sorted.length <= 20) {
                labels = sorted.map(t=>{
                    const d = parseDate(t);
                    return d ? d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '-';
                });
                values = sorted.map(t=> Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0));
            } else {
                const hourMap = {};
                for (let h=0; h<24; h++) hourMap[h]=0;
                sorted.forEach(t=>{
                    const d = parseDate(t);
                    if (!d) return;
                    hourMap[d.getHours()] += Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
                });
                labels = [];
                values = [];
                for (let h=0; h<24; h++) {
                    if (hourMap[h] > 0 || (h>=7 && h<=21)) {
                        labels.push(`${String(h).padStart(2,'0')}:00`);
                        values.push(hourMap[h]);
                    }
                }
            }
        } else if (this.filterType === 'week') {
            const now = new Date();
            const currentDay = now.getDay();
            const diffToMonday = (currentDay === 0 ? -6 : 1 - currentDay);
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() + diffToMonday);
            startOfWeek.setHours(0,0,0,0);
            
            const dayNames = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
            const weekMap = {};
            for (let i=0;i<7;i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate()+i);
                const key = d.toISOString().split('T')[0];
                weekMap[key] = { label: dayNames[i] + `\n${d.getDate()}/${d.getMonth()+1}`, value: 0, date: d };
            }
            sorted.forEach(t=>{
                const d = parseDate(t);
                if (!d) return;
                const key = d.toISOString().split('T')[0];
                if (weekMap[key]) weekMap[key].value += Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
            });
            labels = Object.values(weekMap).map(v=>v.label);
            values = Object.values(weekMap).map(v=>v.value);
        } else if (this.filterType === 'month') {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const daysInMonth = new Date(year, month+1, 0).getDate();
            const monthMap = {};
            for (let d=1; d<=daysInMonth; d++) monthMap[d]=0;
            sorted.forEach(t=>{
                const dt = parseDate(t);
                if (!dt) return;
                if (dt.getMonth()===month && dt.getFullYear()===year) {
                    monthMap[dt.getDate()] += Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
                }
            });
            labels = Object.keys(monthMap).map(d=> `${d}`);
            values = Object.values(monthMap);
        } else if (this.filterType === 'year') {
            const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
            const yearMap = {};
            monthNames.forEach((_,i)=> yearMap[i]=0);
            sorted.forEach(t=>{
                const d = parseDate(t);
                if (!d) return;
                yearMap[d.getMonth()] += Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
            });
            labels = monthNames;
            values = monthNames.map((_,i)=> yearMap[i]);
        } else if (this.filterType === 'custom') {
            if (!this.customStartDate || !this.customEndDate) {
                const dayMap = {};
                sorted.forEach(t=>{
                    const d = parseDate(t);
                    if (!d) return;
                    const key = d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit'});
                    dayMap[key] = (dayMap[key]||0) + Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
                });
                labels = Object.keys(dayMap);
                values = Object.values(dayMap);
            } else {
                const start = new Date(this.customStartDate);
                const end = new Date(this.customEndDate);
                const dayMap = {};
                const cur = new Date(start);
                while (cur <= end) {
                    const key = cur.toISOString().split('T')[0];
                    dayMap[key] = { label: cur.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit'}), value:0 };
                    cur.setDate(cur.getDate()+1);
                }
                sorted.forEach(t=>{
                    const d = parseDate(t);
                    if (!d) return;
                    const key = d.toISOString().split('T')[0];
                    if (dayMap[key]) dayMap[key].value += Number(t.total ?? t.grandTotal ?? t.subtotal ?? 0);
                });
                labels = Object.values(dayMap).map(v=>v.label);
                values = Object.values(dayMap).map(v=>v.value);
            }
        }

        ctx.clearRect(0,0,width,height);

        if (labels.length === 0 || values.every(v=>v===0)) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.filterType==='today' ? 'Belum ada transaksi hari ini' : 'Tidak ada data grafik untuk periode ini', width/2, height/2);
            return;
        }

        const maxVal = Math.max(...values, 1);
        const paddingLeft = 45;
        const paddingRight = 15;
        const paddingTop = 25;
        const paddingBottom = 45;

        const chartWidth = width - (paddingLeft + paddingRight);
        const chartHeight = height - (paddingTop + paddingBottom);

        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let i=0;i<=4;i++) {
            const y = paddingTop + (i * chartHeight/4);
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width - paddingRight, y);
            ctx.stroke();
            const val = Math.round(maxVal - (i * maxVal/4));
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'right';
            let valLabel = val >= 1000000 ? (val/1000000).toFixed(1)+'M' : val>=1000 ? Math.round(val/1000)+'k' : val;
            ctx.fillText(valLabel, paddingLeft-5, y+3);
        }

        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.moveTo(paddingLeft, height - paddingBottom);
        ctx.lineTo(width - paddingRight, height - paddingBottom);
        ctx.stroke();

        const points = labels.map((label, idx) => {
            let x;
            if (labels.length === 1) x = paddingLeft + chartWidth/2;
            else x = paddingLeft + (idx * (chartWidth / (labels.length - 1 || 1)));
            const y = (height - paddingBottom) - ((values[idx] / maxVal) * chartHeight);
            return { x, y, val: values[idx], label };
        });

        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, height - paddingBottom);
            points.forEach(p=> ctx.lineTo(p.x, p.y));
            ctx.lineTo(points[points.length-1].x, height - paddingBottom);
            ctx.closePath();
            const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
            gradient.addColorStop(0, 'rgba(37,99,235,0.25)');
            gradient.addColorStop(1, 'rgba(37,99,235,0)');
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        if (points.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            points.forEach((p, idx)=>{
                if (idx===0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
        }

        points.forEach((p, idx) => {
            if (labels.length > 25 && p.val===0) return;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.val>0 ? 4 : 2, 0, Math.PI*2);
            ctx.fillStyle = p.val>0 ? '#ffffff' : '#e2e8f0';
            ctx.fill();
            ctx.strokeStyle = p.val>0 ? '#2563eb' : '#cbd5e1';
            ctx.lineWidth = p.val>0 ? 2 : 1;
            ctx.stroke();

            ctx.fillStyle = '#64748b';
            ctx.font = labels.length>15 ? '8px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'center';
            if (p.label.includes('\n')) {
                const parts = p.label.split('\n');
                ctx.fillText(parts[0], p.x, height - paddingBottom + 12);
                ctx.fillText(parts[1], p.x, height - paddingBottom + 23);
            } else {
                if (labels.length>15 && idx%2===1) return;
                ctx.fillText(p.label, p.x, height - 10);
            }

            if (p.val>0 && labels.length <= 20) {
                let valLabel = p.val >= 1000000 ? (p.val/1000000).toFixed(1)+'M' : p.val>=1000 ? Math.round(p.val/1000)+'k' : p.val;
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 9px sans-serif';
                ctx.fillText(valLabel, p.x, p.y - 8);
            }
        });

        ctx.fillStyle = '#334155';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        const titleMap = { today: 'Per Transaksi / Jam Hari Ini', week: 'Mingguan (Sen-Min)', month: 'Harian Bulan Ini', year: 'Bulanan Tahun Ini', custom: 'Custom Range' };
        ctx.fillText(titleMap[this.filterType] || '', paddingLeft, 14);
    }
};

export default LaporanModule;