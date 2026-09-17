import DB from './db.js';

const AI_CONFIG = {
    WORKER_URL: localStorage.getItem('edc_worker_url') || "https://promo-ai.welybudiprasetya.workers.dev",
    MODEL: "openai/gpt-oss-120b",
    TEMPERATURE: 0.6,
    // === GEMINI FALLBACK CONFIG ===
    GEMINI_API_KEY: localStorage.getItem('edc_gemini_key') || "",
    GEMINI_MODEL: localStorage.getItem('edc_gemini_model') || "gemini-3.5-flash-lite",
    USE_GEMINI_FALLBACK: localStorage.getItem('edc_use_gemini_fallback') !== 'false', // default true
    GEMINI_WORKER_PATH: "/gemini" // path di worker yang sama untuk fallback
};

const safeArray = (val) => Array.isArray(val) ? val : [];

const AIModule = {
    config: AI_CONFIG,

    setConfig({ workerUrl, model, temperature, geminiKey, geminiModel, useGeminiFallback }) {
        if (workerUrl) {
            this.config.WORKER_URL = workerUrl;
            localStorage.setItem('edc_worker_url', workerUrl);
        }
        if (model) this.config.MODEL = model;
        if (temperature != null) this.config.TEMPERATURE = temperature;
        if (geminiKey !== undefined) {
            this.config.GEMINI_API_KEY = geminiKey;
            localStorage.setItem('edc_gemini_key', geminiKey);
        }
        if (geminiModel) {
            this.config.GEMINI_MODEL = geminiModel;
            localStorage.setItem('edc_gemini_model', geminiModel);
        }
        if (useGeminiFallback !== undefined) {
            this.config.USE_GEMINI_FALLBACK = useGeminiFallback;
            localStorage.setItem('edc_use_gemini_fallback', String(useGeminiFallback));
        }
    },

    // === GEMINI DIRECT CALL (FALLBACK) ===
    async callGemini({ systemPrompt, userPrompt, temperature }) {
        // Opsi 1: Via Worker yang sama (aman, key di env worker)
        // Worker harus handle POST /gemini
        if (this.config.WORKER_URL) {
            try {
                const geminiWorkerUrl = this.config.WORKER_URL.replace(/\/$/, '') + this.config.GEMINI_WORKER_PATH;
                console.log('AI fallback trying Gemini via worker:', geminiWorkerUrl);
                const res = await fetch(geminiWorkerUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: this.config.GEMINI_MODEL,
                        systemPrompt,
                        userPrompt,
                        temperature: temperature ?? this.config.TEMPERATURE
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    const content = data.choices?.[0]?.message?.content || data.content || data.text || "";
                    if (content) return content;
                }
                console.warn('Gemini via worker failed, coba direct API');
            } catch(e) {
                console.warn('Gemini worker error:', e.message);
            }
        }

        // Opsi 2: Direct ke Google API (butuh API key di frontend - kurang aman tapi jalan)
        const apiKey = this.config.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Gemini API key belum diisi. Isi di setConfig atau localStorage edc_gemini_key');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.GEMINI_MODEL}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
                ],
                generationConfig: {
                    temperature: temperature ?? this.config.TEMPERATURE,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Gemini ${res.status}: ${txt.slice(0,500)}`);
        }
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!raw) throw new Error('Gemini tidak mengembalikan content');
        return raw;
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
        let raw = "";
        let usedFallback = false;

        // === COBA GROQ DULU ===
        try {
            raw = await this.callWorker({ systemPrompt, userPrompt, temperature });
        } catch (groqErr) {
            console.warn('Groq/Worker gagal:', groqErr.message);
            
            // === FALLBACK KE GEMINI JIKA AKTIF ===
            if (this.config.USE_GEMINI_FALLBACK) {
                console.log('Fallback ke Gemini...');
                try {
                    raw = await this.callGemini({ systemPrompt, userPrompt, temperature });
                    usedFallback = true;
                    console.log('✅ Fallback Gemini berhasil');
                } catch (geminiErr) {
                    console.error('Gemini fallback juga gagal:', geminiErr.message);
                    throw new Error(`Groq gagal (${groqErr.message}) & Gemini fallback gagal (${geminiErr.message})`);
                }
            } else {
                throw groqErr;
            }
        }

        if (!parseJson) return raw;
        try {
            const parsed = JSON.parse(raw);
            if (usedFallback) parsed._fallback = 'gemini';
            return parsed;
        } catch (e) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try { 
                    const parsed = JSON.parse(match[0]);
                    if (usedFallback) parsed._fallback = 'gemini';
                    return parsed;
                } catch(e2){}
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
            throw new Error('❌ Data produk kosong.\n\nBelum ada produk di database. Tambah produk dulu sebelum scan AI.');
        }

        const totalSold = summary.salesSummary.totalSoldLast30Days || 0;
        const uniqueSold = summary.salesSummary.uniqueProductsSold || 0;

        if (totalSold < 100) {
            throw new Error(`⚠️ Data transaksi belum cukup untuk generate AI.\n\n` +
                `AI menolak scan karena data penjualan 30 hari terakhir belum memenuhi minimal.\n` +
                `Saat ini: ${totalSold} pcs terjual (${uniqueSold} produk unik).\n` +
                `Minimal dibutuhkan: 100 pcs terjual.\n\n` +
                `Penyebab AI tolak scan:\n` +
                `- Data produk kosong atau\n` +
                `- Belum ada data transaksi yang cukup untuk analisa promo`);
        }

        // Prompt yang paksa AI pakai data REAL, bukan ngarang
        const systemPrompt = customPrompt?.system || `Kamu adalah Retail Promotion Strategist Indonesia yang HARUS pakai data penjualan & stok REAL yang diberikan.

ATURAN WAJIB:
1. JANGAN ngarang product ID - pakai HANYA ID yang ada di data, KECUALI type umum boleh tanpa product ID
2. Analisa lowStock (stok menipis), deadStock (tidak laku >=21 hari), slowMoving (laku <5), bestSellers (laku >=10)
3. Berikan MAKSIMAL 5 strategi promosi saja dengan profit minimal 15%
4. Format output JSON MURNI tanpa markdown:

{"strategies":[
  {"type":"discount|bundling|buyXgetY|tebus_murah|weekend|umum","title":"Judul promo","reason":"Alasan berdasarkan data real: stok X, laku Y, margin Z%","target_product_ids":["id_asli_dari_data"],"config":{"discount":5000,"bundlePrice":25000,"buyProdId":"id1","getProdId":"id2","discountPrice":10000,"targetProdId":"id","buyQty":2,"getQty":1,"prodA":"id1","prodB":"id2","prodId":"id","percent":10,"minSpend":50000,"scope":"general","isGeneral":true,"detectOnly":true},"copywriting":"Text WA","predicted_lift":"+15% omzet","urgency":"high|medium|low"}
]}

TYPE PENJELASAN:
- discount/weekend: butuh prodId + discount (potongan harga)
- tebus_murah: butuh targetProdId + discountPrice (harga tebus) + minSpend
- bundling: butuh prodA + prodB + bundlePrice
- buyXgetY: butuh buyProdId + buyQty + getProdId + getQty
- umum: promo untuk SEMUA pelanggan tanpa produk spesifik, target_product_ids boleh []`;

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

Buat MAKSIMAL 5 strategi promosi saja. WAJIB ada 1 promo umum jika memungkinkan. Pakai ID produk ASLI dari data di atas.`;

        const result = await this.generate({ systemPrompt, userPrompt });
        const strategies = result.strategies || result.data || [];

        // VALIDASI: pastikan ID produk ada di database real
        const validIds = new Set(summary.lowStock.concat(summary.bestSellers).concat(summary.slowMoving).concat(summary.deadStock).map(p => p.id));
        // Juga tambahkan semua product id
        const allProductIds = new Set((await DB.getProducts()).map(p => String(p.id||p.docId)));
        
        const validatedStrategies = strategies.map(s => {
            const isUmum = (s.type||'').toLowerCase()==='umum' || s.config?.scope==='general' || s.config?.isGeneral;
            if (isUmum) {
                s.config = s.config || {};
                s.config.scope = 'general';
                s.config.isGeneral = true;
                s.config.isUmum = true;
                s.config.detectOnly = true;
                s.config.autoApply = false;
                s.config.isMemberOnly = false;
                s.target_product_ids = s.target_product_ids || [];
                if (!s.config.percent && !s.config.discount) s.config.percent = 10;
                s.config.minSpend = Number(s.config.minSpend||50000);
                return s;
            }
            const validTargetIds = (s.target_product_ids||[]).filter(id => allProductIds.has(String(id)));
            if (validTargetIds.length === 0 && s.config) {
                const cfgIds = [s.config.targetProdId, s.config.prodId, s.config.prodA, s.config.prodB, s.config.buyProdId, s.config.getProdId].filter(Boolean).map(String);
                const validCfgIds = cfgIds.filter(id => allProductIds.has(id));
                if (validCfgIds.length > 0) {
                    s.target_product_ids = validCfgIds;
                }
            } else {
                s.target_product_ids = validTargetIds;
            }
            return s;
        }).filter(s => {
            const isUmum = (s.type||'').toLowerCase()==='umum' || s.config?.scope==='general';
            if (isUmum) return true;
            return s.target_product_ids && s.target_product_ids.length > 0;
        });

        // === BATAS MAX 5 HASIL - HEMAT QUOTA ===
        const limitedStrategies = validatedStrategies.slice(0, 5);
        console.log(`AI strategies: ${strategies.length} -> validated: ${validatedStrategies.length} -> final: ${limitedStrategies.length} (max 5)`);

        return {
            summary,
            strategies: limitedStrategies
        };
    },


    // ===== GENERATE PROMO MEMBER PERSONALIZED DENGAN AI (BARU - HUBUNGKAN MEMBER + AI) =====
    async generateMemberPromosi({ memberSummary, tokoSummary, cart = [], goal = 'member_retention' } = {}) {
        if (!memberSummary || !memberSummary.member) {
            throw new Error('memberSummary wajib ada');
        }

        const member = memberSummary.member;
        const allProductIds = new Set((await DB.getProducts()).map(p => String(p.id||p.docId)));

        // Siapkan data untuk prompt
        const systemPrompt = `Kamu adalah CRM Retail Strategist Indonesia yang ahli bikin promo member personalized.

ATURAN WAJIB:
1. JANGAN ngarang product ID - pakai HANYA ID yang ada di data toko
2. Buat 2-4 promo member yang personal, profit min 10%
3. Pakai trigger retail modern: tier upgrade, winback, birthday, category affinity, points accelerator
4. Format JSON MURNI:
{"strategies":[
  {"type":"tebus_member|bundle_member|member_tier|birthday|winback","title":"Judul promo personal","reason":"Alasan personal: member Gold suka Kopi, 12 hari tidak belanja, butuh 1.2jt lagi Platinum","target_product_ids":["id_asli"],"config":{"targetProdId":"id","discountPrice":5000,"prodA":"id1","prodB":"id2","bundlePrice":25000,"percent":5,"discount":3000,"buyProdId":"id","getProdId":"id","buyQty":2,"getQty":1},"copywriting":"Text WA personal","predicted_lift":"+10% retention","urgency":"high|medium|low","priority":85}
]}

TYPE:
- tebus_member: butuh targetProdId + discountPrice + minSpend
- bundle_member: butuh prodA + prodB + bundlePrice
- member_tier/birthday/winback: butuh percent + discount (akan dihitung sebagai diskon cart)
- frequent: buy 3 get 1 cheapest`;

        const userPrompt = `MEMBER DATA REAL:
${JSON.stringify({
            id: member.id,
            name: member.name,
            tier: memberSummary.tier,
            newTier: memberSummary.newTier,
            shouldUpgrade: memberSummary.shouldUpgrade,
            totalSpend: memberSummary.totalSpend,
            freq30: memberSummary.freq30,
            avgBasket: memberSummary.avgBasket,
            daysSinceLast: memberSummary.daysSinceLast,
            favoriteCategory: memberSummary.favoriteCategory,
            favoriteProducts: memberSummary.favoriteProducts,
            isBirthdayMonth: memberSummary.isBirthdayMonth,
            isBirthdayToday: memberSummary.isBirthdayToday,
            points: member.points||0,
            birthday: member.birthday||null
        }, null, 2)}

TOKO DATA REAL (untuk cari produk yang cocok):
${JSON.stringify({
            deadStock: (tokoSummary?.deadStock||[]).slice(0,5),
            bestSellers: (tokoSummary?.bestSellers||[]).slice(0,5),
            lowStock: (tokoSummary?.lowStock||[]).slice(0,5),
            slowMoving: (tokoSummary?.slowMoving||[]).slice(0,5)
        }, null, 2)}

CART SAAT INI:
${JSON.stringify(cart.slice(0,5).map(c=>({prodId: c.prodId, name: c.name, qty: c.qty, price: c.price})), null, 2)}

TUGAS:
- Kalau shouldUpgrade true (misal Gold butuh 1.2jt lagi Platinum), buat bundle hemat biar cepat naik tier, pakai bestSeller + deadStock
- Kalau daysSinceLast >=10 dan ada favoriteCategory, buat tebus murah produk favoriteCategory atau deadStock
- Kalau isBirthdayMonth true, buat birthday bundle spesial pakai bestSeller + produk favorit member
- Kalau favoriteCategory ada, buat bundling favorite category + slowMoving
- Kalau freq30 rendah (<2), buat points accelerator atau winback
- Semua pakai ID produk ASLI dari toko data di atas
- Profit min 10%, jangan bikin rugi

Goal: ${goal}`;

        const result = await this.generate({ systemPrompt, userPrompt });
        const strategies = result.strategies || result.data || [];

        // Validasi ID produk
        const validated = strategies.map(s => {
            const validTargetIds = (s.target_product_ids||[]).filter(id => allProductIds.has(String(id)));
            if (validTargetIds.length === 0 && s.config) {
                const cfgIds = [s.config.targetProdId, s.config.prodId, s.config.prodA, s.config.prodB, s.config.buyProdId, s.config.getProdId].filter(Boolean).map(String);
                const validCfgIds = cfgIds.filter(id => allProductIds.has(id));
                if (validCfgIds.length > 0) s.target_product_ids = validCfgIds;
            } else {
                s.target_product_ids = validTargetIds;
            }
            // Set default priority untuk AI member
            if (!s.priority) s.priority = 85;
            if (!s.isAI) s.isAI = true;
            if (!s.source) s.source = 'ai_member';
            return s;
        }).filter(s => s.target_product_ids && s.target_product_ids.length > 0);

        console.log(`AI Member strategies: ${strategies.length} -> validated: ${validated.length}`);

        return {
            memberSummary,
            tokoSummary,
            strategies: validated
        };
    },

    async generateCustom({ systemPrompt, userPrompt, temperature, parseJson = true }) {
        return await this.generate({ systemPrompt, userPrompt, temperature, parseJson });
    }

};

export default AIModule;
