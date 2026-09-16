import DB from './db.js';

const AI_CONFIG = {
    WORKER_URL: localStorage.getItem('edc_worker_url') || "https://edu-slide.welybudiprasetya.workers.dev",
    MODEL: "openai/gpt-oss-120b",
    TEMPERATURE: 0.6
};

const safeArray = (val) => Array.isArray(val) ? val : [];

const AIModule = {
    config: AI_CONFIG,

    setConfig({ workerUrl, model, temperature }) {
        if (workerUrl) this.config.WORKER_URL = workerUrl;
        if (model) this.config.MODEL = model;
        if (temperature != null) this.config.TEMPERATURE = temperature;
    },

    async callWorker({ systemPrompt, userPrompt, temperature }) {
        const url = this.config.WORKER_URL;
        if (!url || url.includes('GANTI')) {
            throw new Error(`WORKER_URL belum diisi`);
        }
        console.log('AI callWorker to:', url);
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.config.MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: temperature ?? this.config.TEMPERATURE,
                response_format: { type: "json_object" }
            })
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Worker ${res.status}: ${txt.slice(0,500)}`);
        }
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || "";
        if (!raw) throw new Error('Worker tidak mengembalikan content');
        return raw;
    },

    async generate({ systemPrompt, userPrompt, temperature, parseJson = true }) {
        const raw = await this.callWorker({ systemPrompt, userPrompt, temperature });
        if (!parseJson) return raw;
        try {
            return JSON.parse(raw);
        } catch (e) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try { return JSON.parse(match[0]); } catch(e2){}
            }
            throw new Error('Gagal parse JSON: ' + raw.slice(0,500));
        }
    },

    // ===== FIX: AMBIL DATA PENJUALAN & STOK REAL (SAMA KAYAK analyzeLaporanData) =====
    async getProductsSummary() {
        const products = await DB.getProducts() || [];
        const promotions = await DB.getPromotions() || [];
        const transactions = await DB.getTransactions() || [];
        
        console.log(`AI getProductsSummary: ${products.length} produk, ${transactions.length} transaksi`);

        // Hitung penjualan 30 hari terakhir (sama kayak promosi asli)
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const soldQtyMap = {};
        const lastSoldDateMap = {};

        transactions.forEach(trx => {
            const timeStr = trx.createdAt || trx.timestamp || trx.waktu || trx.date;
            let d = new Date(timeStr);
            if (isNaN(d.getTime()) && !isNaN(Number(timeStr))) d = new Date(Number(timeStr));
            if (isNaN(d.getTime())) return;
            if (d < thirtyDaysAgo) return; // hanya 30 hari

            const items = trx.items || trx.cart || trx.produk || [];
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                const pid = String(item.docId || item.id || item.prodId || item.productId || '');
                if (!pid) return;
                const qty = Number(item.qty ?? item.quantity ?? item.jumlah ?? 1) || 1;
                soldQtyMap[pid] = (soldQtyMap[pid] || 0) + qty;
                if (!lastSoldDateMap[pid] || d > lastSoldDateMap[pid]) lastSoldDateMap[pid] = d;
            });
        });

        // Klasifikasi produk berdasarkan penjualan & stok REAL
        const lowStock = [];
        const bestSellers = [];
        const slowMoving = [];
        const deadStock = [];

        products.forEach(p => {
            const pid = String(p.id || p.docId);
            const stock = Number(p.stock ?? p.stok ?? 0) || 0;
            const price = Number(p.price ?? p.harga ?? p.jual ?? 0) || 0;
            const cost = Number(p.cost ?? p.modal ?? p.harga_beli ?? p.costPrice ?? 0) || 0;
            const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : 0;
            const sold30 = soldQtyMap[pid] || 0;
            const lastSold = lastSoldDateMap[pid];
            const daysSinceSold = lastSold ? Math.floor((now - lastSold) / (1000*60*60*24)) : 999;

            const prodInfo = {
                id: pid,
                name: p.name || p.nama || pid,
                stock,
                sold30,
                price,
                cost,
                margin: Number(margin),
                category: p.category || '',
                daysSinceSold,
                lastSold: lastSold ? lastSold.toISOString() : null
            };

            // Low stock: stok <= minStock atau <=5
            const minStock = Number(p.minStock ?? 5);
            if (stock > 0 && stock <= minStock) {
                lowStock.push(prodInfo);
            }

            // Dead stock: tidak laku >=21 hari & stok masih ada
            if (stock > 0 && daysSinceSold >= 21) {
                deadStock.push(prodInfo);
            }
            // Slow moving: laku <5 pcs dalam 30 hari tapi stok banyak
            else if (stock > 10 && sold30 > 0 && sold30 < 5) {
                slowMoving.push(prodInfo);
            }

            // Best seller: laku >=10 pcs dalam 30 hari
            if (sold30 >= 10) {
                bestSellers.push(prodInfo);
            }
        });

        // Sort
        lowStock.sort((a,b) => a.stock - b.stock);
        bestSellers.sort((a,b) => b.sold30 - a.sold30);
        slowMoving.sort((a,b) => a.sold30 - b.sold30);
        deadStock.sort((a,b) => b.daysSinceSold - a.daysSinceSold);

        const summary = {
            totalProducts: products.length,
            totalTransactions: transactions.length,
            activePromos: promotions.length,
            lowStock: lowStock.slice(0, 15),
            bestSellers: bestSellers.slice(0, 10),
            slowMoving: slowMoving.slice(0, 10),
            deadStock: deadStock.slice(0, 10),
            // Untuk debug
            allProductsSample: products.slice(0,3).map(p => ({id: p.id||p.docId, name: p.name, stock: p.stock, price: p.price})),
            salesSummary: {
                totalSoldLast30Days: Object.values(soldQtyMap).reduce((a,b)=>a+b,0),
                uniqueProductsSold: Object.keys(soldQtyMap).length
            }
        };

        console.log('AI Summary REAL:', summary);
        return summary;
    },

    // ===== GENERATE PROMOSI DENGAN DATA REAL =====
    async generatePromosi({ goal = 'profit', customPrompt = null } = {}) {
        const summary = await this.getProductsSummary();

        if (summary.totalProducts === 0) {
            throw new Error('Tidak ada produk di database. Tambah produk dulu.');
        }

        if (summary.salesSummary.totalSoldLast30Days === 0) {
            console.warn('Tidak ada penjualan 30 hari terakhir, pakai data stok saja');
        }

        // Prompt yang paksa AI pakai data REAL, bukan ngarang
        const systemPrompt = customPrompt?.system || `Kamu adalah Retail Promotion Strategist Indonesia yang HARUS pakai data penjualan & stok REAL yang diberikan.

ATURAN WAJIB:
1. JANGAN ngarang product ID - pakai HANYA ID yang ada di data
2. Analisa lowStock (stok menipis), deadStock (tidak laku >=21 hari), slowMoving (laku <5), bestSellers (laku >=10)
3. Berikan 5-7 strategi promosi dengan profit minimal 15%
4. Format output JSON MURNI tanpa markdown:

{"strategies":[
  {"type":"discount|bundling|buyXgetY|tebus_murah|weekend","title":"Judul promo","reason":"Alasan berdasarkan data real: stok X, laku Y, margin Z%","target_product_ids":["id_asli_dari_data"],"config":{"discount":5000,"bundlePrice":25000,"buyProdId":"id1","getProdId":"id2","discountPrice":10000,"targetProdId":"id","buyQty":2,"getQty":1,"prodA":"id1","prodB":"id2","prodId":"id"},"copywriting":"Text WA","predicted_lift":"+15% omzet","urgency":"high|medium|low"}
]}

TYPE PENJELASAN:
- discount/weekend: butuh prodId + discount (potongan harga)
- tebus_murah: butuh targetProdId + discountPrice (harga tebus) + minSpend
- bundling: butuh prodA + prodB + bundlePrice
- buyXgetY: butuh buyProdId + buyQty + getProdId + getQty`;

        const userPrompt = customPrompt?.user || `Goal: ${goal}

DATA TOKO REAL (WAJIB PAKAI, JANGAN NGARANG ID):
${JSON.stringify({
            totalProducts: summary.totalProducts,
            lowStock: summary.lowStock,
            bestSellers: summary.bestSellers,
            slowMoving: summary.slowMoving,
            deadStock: summary.deadStock,
            salesSummary: summary.salesSummary
        }, null, 2)}

TUGAS:
- lowStock: ${summary.lowStock.length} produk stok menipis (sisa <=5), buat tebus murah atau diskon kecil agar habis dengan untung
- deadStock: ${summary.deadStock.length} produk tidak laku >=21 hari, stok masih ada, buat bundling dengan best seller atau tebus murah
- slowMoving: ${summary.slowMoving.length} produk laku <5 pcs/30 hari, buat weekend sale atau discount
- bestSellers: ${summary.bestSellers.length} produk laku >=10 pcs/30 hari, pakai untuk tarik produk lain via buyXgetY atau bundling

Buat 5-7 strategi promosi powerfull dengan profit min 15%. Pakai ID produk ASLI dari data di atas.`;

        const result = await this.generate({ systemPrompt, userPrompt });
        const strategies = result.strategies || result.data || [];

        // VALIDASI: pastikan ID produk ada di database real
        const validIds = new Set(summary.lowStock.concat(summary.bestSellers).concat(summary.slowMoving).concat(summary.deadStock).map(p => p.id));
        // Juga tambahkan semua product id
        const allProductIds = new Set((await DB.getProducts()).map(p => String(p.id||p.docId)));
        
        const validatedStrategies = strategies.map(s => {
            // Filter target_product_ids yang valid
            const validTargetIds = (s.target_product_ids||[]).filter(id => allProductIds.has(String(id)));
            if (validTargetIds.length === 0 && s.config) {
                // Coba ambil dari config
                const cfgIds = [s.config.targetProdId, s.config.prodId, s.config.prodA, s.config.prodB, s.config.buyProdId, s.config.getProdId].filter(Boolean).map(String);
                const validCfgIds = cfgIds.filter(id => allProductIds.has(id));
                if (validCfgIds.length > 0) {
                    s.target_product_ids = validCfgIds;
                }
            } else {
                s.target_product_ids = validTargetIds;
            }
            return s;
        }).filter(s => s.target_product_ids && s.target_product_ids.length > 0);

        console.log(`AI strategies: ${strategies.length} -> validated: ${validatedStrategies.length}`);

        return {
            summary,
            strategies: validatedStrategies
        };
    },

    async generateCustom({ systemPrompt, userPrompt, temperature, parseJson = true }) {
        return await this.generate({ systemPrompt, userPrompt, temperature, parseJson });
    }
};

export default AIModule;
