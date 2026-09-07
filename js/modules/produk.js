import DB from './db.js';
import Scanner from './scanner.js';

const ProdukModule = {
    products: [],
    currentPage: 1,
    itemsPerPage: 5,
    sortBy: 'name-asc',
    scannerActive: false,

    async render() {
        this.products = await DB.getProducts();
        const sorted = this.getSortedProducts();
        const totalPages = Math.ceil(sorted.length / this.itemsPerPage) || 1;
        const pageItems = sorted.slice((this.currentPage - 1) * this.itemsPerPage, this.currentPage * this.itemsPerPage);
        const scannerMode = localStorage.getItem('edc_scanner_mode') || 'camera';

        return `
            <div class="setting-section">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Kelola Produk & Stok</h3>
                    <button class="btn-touch active" id="btn-open-add" style="padding: 6px 12px;">+ Tambah</button>
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
                        <input type="date" id="prod-expired" class="form-control" style="flex:1;">
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
                        ${pageItems.length === 0 ? '<p style="text-align:center; opacity:0.6;">Belum ada produk</p>' : pageItems.map(p => `
                            <div class="product-item" style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color, #eee);">
                                <div style="flex:1;">
                                    <strong style="font-size:0.85rem;">${p.name}</strong> ${p.taxEnabled ? `<span style="font-size:0.65rem; background:#ffc107; padding:1px 5px; border-radius:4px; margin-left:4px;">Pajak ${p.taxRate || p.taxPercent || 11}%</span>` : ''}
                                    <div style="font-size:0.7rem; opacity:0.7;">${p.barcode || '-'} | ${p.category || 'Tanpa Kategori'} | Stok: ${p.stock} ${p.expiredDate ? '| ED: ' + p.expiredDate : ''}</div>
                                    <div style="font-size:0.75rem;">Beli: Rp${(p.buyPrice ?? p.costPrice ?? 0).toLocaleString()} | Jual: Rp${Number(p.price).toLocaleString()}</div>
                                </div>
                                <div style="display:flex; gap:4px;">
                                    <button class="btn-touch btn-edit-prod" data-id="${p.id}" style="padding:4px 8px; font-size:0.7rem;">Edit</button>
                                    <button class="btn-touch btn-delete-prod" data-id="${p.id}" style="padding:4px 8px; font-size:0.7rem; background:#ff4d4d; color:#fff;">Hapus</button>
                                </div>
                            </div>
                        `).join('')}
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
                expiredDate,
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
        if (expEl) expEl.value = p.expiredDate || '';

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
        if (expEl) expEl.value = '';
        if (taxCheck) taxCheck.checked = false;
        if (taxRate) taxRate.value = 11;
        if (taxGroup) taxGroup.style.display = 'none';
    }
};

export default ProdukModule;
