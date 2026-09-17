import DB from './db.js';

const AI_CONFIG = {
    WORKER_URL: localStorage.getItem('edc_worker_url') || "https://promo-key.welybudiprasetya.workers.dev",
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
        const groqModel = this.config.MODEL;
        const geminiModel = this.config.GEMINI_MODEL;
        
        console.log(`[AI] Call Groq via Worker: ${groqModel} | Gemini fallback model: ${geminiModel}`);
        
        const payload = {
            model: groqModel,
            geminiModel: geminiModel, // kirim ke worker untuk dipakai saat fallback via /gemini
            messages: [
                { role: "system", content: systemPrompt + "\n\nPENTING: Jawab HANYA JSON valid tanpa markdown, tanpa \\`\\`\\`json. Jika tidak ada promo, jawab {\"strategies\":[]}" },
                { role: "user", content: userPrompt }
            ],
            temperature: temperature ?? this.config.TEMPERATURE,
            response_format: { type: "json_object" }
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const dataText = await res.text();
        let dataJson = null;
        try { dataJson = JSON.parse(dataText); } catch(e){}

        if (!res.ok) {
            // === PENANGANAN LENGKAP ERROR GROQ DI ai.js ===
            const status = res.status;
            const errorMap = {
                400: "BadRequestError - Failed to validate JSON / invalid payload",
                401: "AuthenticationError - API key invalid/expired",
                403: "PermissionDeniedError - model tidak diizinkan",
                404: "NotFoundError - model tidak ditemukan",
                422: "UnprocessableEntityError - payload error",
                429: "RateLimitError - quota habis / rate limit",
                500: "InternalServerError",
                502: "BadGateway",
                503: "ServiceUnavailable"
            };
            const errType = errorMap[status] || `HTTP ${status}`;
            const errMsg = dataJson?.error?.message || dataJson?.error || dataText.slice(0,400);
            const errCode = dataJson?.error?.code || dataJson?.error?.type || '';

            console.error(`[GROQ ERROR ${status}] ${errType} Code:${errCode} Msg:${errMsg}`);
            console.error(`[GROQ RAW] ${dataText.slice(0,800)}`);

            // Simpan untuk debug (tanpa UI)
            window._lastAIGroqError = { status, type: errType, code: errCode, message: errMsg, raw: dataText.slice(0,800), timestamp: Date.now() };

            // Lempar error biar di-catch oleh generate() untuk fallback Gemini
            const err = new Error(`Groq ${status} ${errType}: ${errMsg}`);
            err.status = status;
            err.type = errType;
            err.code = errCode;
            err.raw = dataText;
            throw err;
        }

        // Sukses
        const content = dataJson?.choices?.[0]?.message?.content || "";
        if (!content) throw new Error('Worker tidak mengembalikan content');
        console.log(`[GROQ OK] ${res.status} ${content.length} chars`);
        return content;
    },

    async callGemini({ systemPrompt, userPrompt, temperature, model }) {
        const geminiModel = model || this.config.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const useWorker = this.config.WORKER_URL && !this.config.WORKER_URL.includes('GANTI') && this.config.USE_GEMINI_FALLBACK;

        // Jika ada worker, pakai via worker biar key aman
        if (useWorker && this.config.GEMINI_API_KEY === null) {
            // Mode key-only: key disimpan di worker, panggil /gemini
            const workerGeminiUrl = this.config.WORKER_URL.replace(/\/$/, '') + '/gemini';
            console.log(`[AI] Call Gemini via Worker: ${geminiModel}`);
            const res = await fetch(workerGeminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemPrompt, userPrompt,
                    temperature: temperature ?? this.config.TEMPERATURE,
                    geminiModel: geminiModel
                })
            });
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch(e){}

            if (!res.ok) {
                const errMsg = json?.error?.message || json?.error || text.slice(0,400);
                console.error(`[GEMINI ERROR ${res.status} via Worker] Model:${geminiModel} Msg:${errMsg}`);
                window._lastAIGeminiError = { status: res.status, model: geminiModel, message: errMsg, raw: text.slice(0,800), timestamp: Date.now() };
                const err = new Error(`Gemini ${res.status}: ${errMsg}`);
                err.status = res.status;
                throw err;
            }
            const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (!raw) throw new Error('Gemini via Worker tidak mengembalikan content');
            console.log(`[GEMINI OK via Worker] ${geminiModel} ${raw.length} chars`);
            return raw;
        }

        // Direct call jika ada key di frontend
        const key = this.config.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY belum di-set di worker maupun frontend');

        console.log(`[AI] Call Gemini direct: ${geminiModel}`);
        const guard = "\n\nPENTING: Jawab HANYA JSON valid tanpa markdown. Jika tidak ada promo, jawab {\"strategies\":[]}";
        const fullPrompt = systemPrompt ? `${systemPrompt}${guard}\n\n${userPrompt}` : `${guard}\n\n${userPrompt}`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                generationConfig: { temperature: temperature ?? 0.6, responseMimeType: "application/json" }
            })
        });
        const data = await res.json();
        if (!res.ok) {
            const errMsg = data.error?.message || JSON.stringify(data).slice(0,400);
            console.error(`[GEMINI ERROR ${res.status} direct] Model:${geminiModel} Msg:${errMsg}`);
            window._lastAIGeminiError = { status: res.status, model: geminiModel, message: errMsg, raw: JSON.stringify(data).slice(0,800), timestamp: Date.now() };
            throw new Error(`Gemini ${res.status}: ${errMsg}`);
        }
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!raw) throw new Error('Gemini tidak mengembalikan content');
        console.log(`[GEMINI OK direct] ${geminiModel} ${raw.length} chars`);
        return raw;
    },

        async generate({ systemPrompt, userPrompt, temperature, parseJson = true }) {
        let raw = "";
        let usedFallback = false;
        let lastError = null;

        // === GUARD: paksa JSON murni, tanpa markdown - cegah Worker 400 ===
        const jsonGuard = "\n\nPENTING: Jawab HANYA JSON valid, tanpa \\`\\`\\` , tanpa penjelasan. Contoh: {\"strategies\":[]}";

        // === COBA GROQ DULU ===
        try {
            raw = await this.callWorker({ systemPrompt: systemPrompt + jsonGuard, userPrompt, temperature });
        } catch (groqErr) {
            console.warn('Groq/Worker gagal:', groqErr.message);
            lastError = groqErr;
            
            // Jika 400 JSON validation error, langsung coba Gemini fallback
            if (this.config.USE_GEMINI_FALLBACK) {
                console.log('Fallback ke Gemini karena Groq 400...');
                try {
                    raw = await this.callGemini({ systemPrompt: systemPrompt + jsonGuard, userPrompt, temperature });
                    usedFallback = true;
                    console.log('✅ Fallback Gemini berhasil');
                } catch (geminiErr) {
                    console.error('Gemini fallback juga gagal:', geminiErr.message);
                    throw new Error(`Pengambilan data AI gagal: Groq ${groqErr.message.slice(0,150)} | Gemini ${geminiErr.message.slice(0,150)}`);
                }
            } else {
                throw new Error(`Pengambilan data AI gagal: ${groqErr.message.slice(0,200)}`);
            }
        }

        if (!parseJson) return raw;
        
        // Coba parse JSON dengan pembersihan
        try {
            let cleaned = raw.trim();
            // Hapus markdown code block jika ada
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            }
            const parsed = JSON.parse(cleaned);
            if (usedFallback) parsed._fallback = 'gemini';
            // Pastikan strategies ada, kalau tidak, anggap kosong bukan error
            if (!parsed.strategies && !parsed.data) {
                console.warn('AI return JSON tanpa strategies, anggap kosong');
                return { strategies: [], _empty: true, _raw: cleaned.slice(0,200) };
            }
            return parsed;
        } catch (e) {
            // Coba extract JSON object dari dalam text
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try { 
                    const parsed = JSON.parse(match[0]);
                    if (usedFallback) parsed._fallback = 'gemini';
                    if (!parsed.strategies && !parsed.data) {
                        return { strategies: [], _empty: true };
                    }
                    return parsed;
                } catch(e2){
                    console.warn('Extract JSON gagal', e2.message);
                }
            }
            // Jika tetap gagal parse, jangan throw 400 lagi - return kosong dengan flag error untuk notif
            console.error('Gagal parse JSON AI, return kosong untuk notif:', raw.slice(0,500));
            throw new Error('Pengambilan data AI gagal: Format JSON tidak valid dari AI. Coba lagi.');
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
        // === PASTIKAN REQUEST TIDAK KOSONG ===
        if (!memberSummary || !memberSummary.member) {
            throw new Error('Member tidak valid - scan member dulu');
        }
        // Pastikan tokoSummary ada isinya minimal 1 array biar prompt tidak kosong
        const safeTokoSummary = {
            deadStock: (tokoSummary?.deadStock||[]).length ? tokoSummary.deadStock : [{name:'Stok umum', id:'general'}],
            bestSellers: (tokoSummary?.bestSellers||[]).length ? tokoSummary.bestSellers : [{name:'Produk terlaris', id:'general'}],
            lowStock: tokoSummary?.lowStock||[],
            slowMoving: tokoSummary?.slowMoving||[]
        };

        const allProductIds = new Set((await DB.getProducts()).map(p => String(p.id||p.docId)));
        if (allProductIds.size === 0) {
            console.warn('Produk kosong, pakai ID general agar request tidak kosong');
            allProductIds.add('general');
        }

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
            deadStock: (safeTokoSummary?.deadStock||[]).slice(0,5),
            bestSellers: (safeTokoSummary?.bestSellers||[]).slice(0,5),
            lowStock: (safeTokoSummary?.lowStock||[]).slice(0,5),
            slowMoving: (safeTokoSummary?.slowMoving||[]).slice(0,5)
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

        // === VALIDASI MAX 3 HASIL UNTUK MEMBER (hemat quota) ===
        const limitedMember = validated.slice(0, 3);
        console.log(`AI Member final: ${validated.length} -> max 3: ${limitedMember.length}`);

        // === PASTIKAN REQUEST TIDAK KOSONG AGAR TIDAK ERROR GROQ/GEMINI ===
        if (limitedMember.length === 0) {
            console.warn('AI member tidak menghasilkan promo - akan tampil notif di transaksi, bukan error');
        }

        return {
            memberSummary,
            tokoSummary,
            strategies: limitedMember,
            _isEmpty: limitedMember.length === 0
        };
    },

    async generateCustom({ systemPrompt, userPrompt, temperature, parseJson = true }) {
        return await this.generate({ systemPrompt, userPrompt, temperature, parseJson });
    }

};

export default AIModule;
