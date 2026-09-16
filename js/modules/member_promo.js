import DB from './db.js';

if (!window._memberPromoState) {
  window._memberPromoState = {
    appliedIds: [],
    lastMemberId: null,
    aiCache: {},
    aiEnabled: true,
    _productsCache: []
  }
}

const MemberPromoModule = {
  getDefaultConfig() {
    return {
      tierDiscounts: { bronze: 0, silver: 2, gold: 5, platinum: 10 },
      pointsRate: 10000,
      pointValue: 1,
      winbackThreshold: 14,
      freqThreshold: 4,
      birthdayDiscount: 15,
      minSpendForTebus: 50000,
      enableAI: true,
      minMarginPercent: 15,
      maxDiscountPercent: 15
    };
  },

  loadConfig() {
    try {
      const tierCustom = localStorage.getItem('edc_member_tier_custom');
      let tierDiscounts = { bronze: 0, silver: 2, gold: 5, platinum: 10 };
      if (tierCustom) {
        const parsed = JSON.parse(tierCustom);
        Object.keys(parsed).forEach(k => {
          if (tierDiscounts.hasOwnProperty(k)) tierDiscounts[k] = Number(parsed[k].disc||0);
        });
      }
      const pointsCustom = localStorage.getItem('edc_member_points_custom');
      let pointsRate = 10000;
      let pointValue = 1;
      if (pointsCustom) {
        try {
          const pc = JSON.parse(pointsCustom);
          pointsRate = Number(pc.pointsRate ?? pointsRate);
          pointValue = Number(pc.pointValue ?? pointValue);
        } catch(e){}
      }
      const savedPromo = localStorage.getItem('edc_member_promo_config');
      if (savedPromo) {
        const p = JSON.parse(savedPromo);
        if (tierCustom) p.tierDiscounts = tierDiscounts;
        if (pointsCustom) { p.pointsRate = pointsRate; p.pointValue = pointValue; }
        if (!p.pointValue || p.pointValue === 100) p.pointValue = pointValue;
        if (p.enableAI === undefined) p.enableAI = true;
        if (!p.minMarginPercent) p.minMarginPercent = 15;
        if (!p.maxDiscountPercent) p.maxDiscountPercent = 15;
        return p;
      }
      const def = this.getDefaultConfig();
      def.tierDiscounts = tierDiscounts;
      def.pointsRate = pointsRate;
      def.pointValue = pointValue;
      return def;
    } catch(e) {
      return this.getDefaultConfig();
    }
  },

  config: (() => {
    try {
      const tierCustom = localStorage.getItem('edc_member_tier_custom');
      let tierDiscounts = { bronze: 0, silver: 2, gold: 5, platinum: 10 };
      if (tierCustom) {
        const parsed = JSON.parse(tierCustom);
        Object.keys(parsed).forEach(k => { if (tierDiscounts.hasOwnProperty(k)) tierDiscounts[k] = Number(parsed[k].disc||0); });
      }
      const saved = localStorage.getItem('edc_member_promo_config');
      if (saved) {
        const p = JSON.parse(saved);
        if (tierCustom) p.tierDiscounts = tierDiscounts;
        if (p.enableAI === undefined) p.enableAI = true;
        if (!p.minMarginPercent) p.minMarginPercent = 15;
        if (!p.maxDiscountPercent) p.maxDiscountPercent = 15;
        return p;
      }
      return { tierDiscounts, pointsRate: 10000, pointValue: 1, winbackThreshold: 14, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000, enableAI: true, minMarginPercent: 15, maxDiscountPercent: 15 };
    } catch(e) {
      return { tierDiscounts: { bronze: 0, silver: 2, gold: 5, platinum: 10 }, pointsRate: 10000, pointValue: 1, winbackThreshold: 14, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000, enableAI: true, minMarginPercent: 15, maxDiscountPercent: 15 };
    }
  })(),

  validateMemberDiscount(products, cart, proposedDisc) {
    if (!cart || !cart.length) return { amount: proposedDisc, safe: true, reason: 'preview' };
    let totalCost = 0;
    let subtotal = 0;
    let minMargin = this.config.minMarginPercent || 15;
    let maxDiscPercent = this.config.maxDiscountPercent || 15;

    cart.forEach(item => {
      const prod = products.find(p => String(p.id||p.docId) === String(item.prodId));
      const cost = prod ? this.getProductCost(prod) : Number(item.buyPrice||item.costPrice||0);
      const price = Number(item.price||0);
      const qty = Number(item.qty||1);
      totalCost += cost * qty;
      subtotal += price * qty;
    });

    if (totalCost === 0 && subtotal > 0) totalCost = subtotal * 0.7;
    if (subtotal <= 0) return { amount: 0, safe: false, reason: 'subtotal 0' };

    const maxDiscByPercent = Math.floor(subtotal * maxDiscPercent / 100);
    let cappedDisc = Math.min(proposedDisc, maxDiscByPercent);
    const minRevenue = totalCost * (1 + minMargin/100);
    const afterDisc = subtotal - cappedDisc;

    if (afterDisc < minRevenue) {
      const maxAllowedByMargin = Math.max(0, Math.floor(subtotal - minRevenue));
      const finalDisc = Math.min(cappedDisc, maxAllowedByMargin);
      return { amount: finalDisc, safe: finalDisc === proposedDisc, maxAllowed: maxAllowedByMargin, totalCost, subtotal, minRevenue, reason: finalDisc < proposedDisc ? `Dibatasi profit ${minMargin}%` : 'aman' };
    }
    return { amount: cappedDisc, safe: cappedDisc === proposedDisc, totalCost, subtotal, minRevenue, reason: cappedDisc < proposedDisc ? `Dibatasi max ${maxDiscPercent}%` : 'aman' };
  },

  getProductCost(p) {
    if (!p) return 0;
    return Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.hpp ?? p.cost ?? 0) || 0;
  },

  getProductPrice(p) {
    if (!p) return 0;
    return Number(p.price ?? p.hargaJual ?? p.harga ?? p.jual ?? 0) || 0;
  },

  getNextTierInfo(totalSpend) {
    const tiers = [
      { tier: 'bronze', min: 0 },
      { tier: 'silver', min: 1000000 },
      { tier: 'gold', min: 3000000 },
      { tier: 'platinum', min: 10000000 }
    ];
    for (let i=0;i<tiers.length-1;i++) {
      if (totalSpend >= tiers[i].min && totalSpend < tiers[i+1].min) {
        return { currentTier: tiers[i].tier, nextTier: tiers[i+1].tier, needed: tiers[i+1].min - totalSpend };
      }
    }
    return null;
  },

  // CORE - RULE BASED + REAL AI (TANPA FALLBACK DUMMY) - DIMUAT PERTAMA KALI SAAT LOAD MEMBER
  async getAvailablePromos(member, cart = [], options = {}) {
    if (!member) return { member: null, promos: [], totalSpend: 0, totalTrxCount: 0, freq30: 0, spend30: 0, avgBasket: 0, daysSinceLast: 999, aiPromos: [], rulePromos: [] };

    const products = options.products || await DB.getProducts() || [];
    const allTrx = options.transactions || await DB.getTransactions() || [];
    const promotions = options.promotions || await DB.getPromotions() || [];

    const memberTrx = allTrx.filter(t => String(t.memberId) === String(member.id));
    const now = new Date();
    const totalSpend = memberTrx.reduce((a,b) => a + Number(b.total || b.grandTotal || b.subtotal || 0), 0) + (Number(member.totalSpend)||0);
    const totalTrxCount = memberTrx.length + (Number(member.totalTrx)||0);

    const lastTrx = memberTrx.sort((a,b) => {
      const da = new Date(a.createdAt || a.timestamp || a.date || 0);
      const db = new Date(b.createdAt || b.timestamp || b.date || 0);
      return db - da;
    })[0];

    const daysSinceLast = lastTrx ? Math.floor((now - new Date(lastTrx.createdAt || lastTrx.timestamp || lastTrx.date || now).getTime())/86400000) : 999;
    
    const trx30 = memberTrx.filter(t => {
      const time = t.createdAt || t.timestamp || t.date;
      let d = new Date(time);
      if (isNaN(d.getTime()) && !isNaN(Number(time))) d = new Date(Number(time));
      return !isNaN(d.getTime()) ? (now - d) / 86400000 <= 30 : true;
    });
    const freq30 = trx30.length;
    const spend30 = trx30.reduce((a,b)=>a+Number(b.total||0),0);
    const avgBasket = memberTrx.length ? totalSpend / memberTrx.length : 0;

    const cartSubtotal = cart.reduce((a,i) => a + Number(i.price||0)*Number(i.qty||1), 0);
    const promos = [];

    // 1. TIER DISCOUNT
    try { const latest = this.loadConfig(); if (latest && latest.tierDiscounts) this.config.tierDiscounts = latest.tierDiscounts; } catch(e){}
    let tierDisc = this.config.tierDiscounts[member.tier||'bronze'] || 0;
    if (tierDisc > (this.config.maxDiscountPercent||15)) tierDisc = this.config.maxDiscountPercent||15;
    
    if (tierDisc > 0) {
      const rawDisc = cartSubtotal > 0 ? Math.round(cartSubtotal * tierDisc / 100) : 0;
      const validation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawDisc) : { amount: rawDisc, safe: true, reason: 'preview' };
      const discAmount = validation.amount;
      promos.push({
        id: `MEM-TIER-${member.id}`,
        rule: 'TIER_DISCOUNT',
        promoType: 'member_tier',
        type: 'member_tier',
        name: `Diskon Tier ${String(member.tier||'bronze').toUpperCase()} ${tierDisc}%`,
        desc: cartSubtotal > 0 ? (validation.safe ? `Member ${member.tier} extra ${tierDisc}%` : `Disesuaikan ${Math.round(discAmount/cartSubtotal*100)}% biar profit ${this.config.minMarginPercent}%`) : `Total belanja Rp${totalSpend.toLocaleString('id-ID')} - Tambah produk untuk klaim ${tierDisc}%`,
        discount: discAmount,
        discountAmount: discAmount,
        priority: 100,
        canApply: cartSubtotal > 0 && discAmount > 0,
        autoApply: cartSubtotal > 0 && discAmount > 0,
        memberId: member.id,
        config: { tier: member.tier, percent: tierDisc },
        reason: validation.reason,
        isRule: true
      });
    } else if (member.tier === 'bronze') {
      const nextInfo = this.getNextTierInfo(totalSpend);
      if (nextInfo) {
        promos.push({
          id: `MEM-TIER-INFO-${member.id}`,
          rule: 'TIER_INFO',
          promoType: 'member_tier_info',
          type: 'member_tier',
          name: `Naik ke ${nextInfo.nextTier.toUpperCase()} kurang Rp${nextInfo.needed.toLocaleString('id-ID')} lagi`,
          desc: `Total belanja Rp${totalSpend.toLocaleString('id-ID')} - Belanja lagi untuk naik tier`,
          discount: 0,
          discountAmount: 0,
          priority: 50,
          canApply: false,
          autoApply: false,
          memberId: member.id,
          config: {},
          reason: 'info tier',
          isRule: true
        });
      }
    }

    // 2. BIRTHDAY - DARI FIELD BIRTHDAY
    let isBirthdayMonth = false;
    let isBirthdayToday = false;
    if (member.birthday) {
      const b = new Date(member.birthday);
      if (!isNaN(b)) {
        isBirthdayMonth = b.getMonth() === now.getMonth();
        isBirthdayToday = b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
      }
    } else if (member.birthMonth) {
      isBirthdayMonth = Number(member.birthMonth) === (now.getMonth()+1);
    }
    
    if (isBirthdayMonth) {
      let bdayDisc = this.config.birthdayDiscount || 15;
      if (bdayDisc > (this.config.maxDiscountPercent||15)) bdayDisc = this.config.maxDiscountPercent||15;
      const rawBday = cartSubtotal > 0 ? Math.round(cartSubtotal * bdayDisc / 100) : 0;
      const bdayValidation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawBday) : { amount: rawBday, safe: true, reason: 'preview' };
      const discAmount = bdayValidation.amount;
      promos.push({
        id: `MEM-BDAY-${member.id}`,
        rule: 'BIRTHDAY',
        promoType: 'member_birthday',
        type: 'member_tier',
        name: `🎂 Ultah ${bdayDisc}% ${isBirthdayToday ? '(HARI INI!)' : '(Bulan Ini)'}`,
        desc: `Selamat ultah ${member.name}! ${cartSubtotal>0 ? 'Klaim diskon ultah' : 'Tambah produk untuk klaim'}`,
        discount: discAmount,
        discountAmount: discAmount,
        priority: 95,
        canApply: cartSubtotal > 0,
        autoApply: false,
        memberId: member.id,
        config: { percent: bdayDisc },
        reason: bdayValidation.reason,
        isRule: true
      });
    }

    // 3. WINBACK
    const winbackThreshold = this.config.winbackThreshold || 14;
    if (daysSinceLast >= winbackThreshold) {
      let winbackDisc = 10;
      if (winbackDisc > (this.config.maxDiscountPercent||15)) winbackDisc = this.config.maxDiscountPercent||15;
      const rawWinback = cartSubtotal > 0 ? Math.round(cartSubtotal * winbackDisc / 100) : 0;
      const winbackValidation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawWinback) : { amount: rawWinback, safe: true, reason: 'preview' };
      const discAmount = winbackValidation.amount;
      promos.push({
        id: `MEM-WINBACK-${member.id}`,
        rule: 'WINBACK',
        promoType: 'member_winback',
        type: 'member_tier',
        name: `Kangen! Diskon Winback ${winbackDisc}%`,
        desc: `${daysSinceLast} hari tidak belanja`,
        discount: discAmount,
        discountAmount: discAmount,
        priority: 90,
        canApply: cartSubtotal > 0,
        autoApply: false,
        memberId: member.id,
        config: { percent: winbackDisc, daysSinceLast },
        reason: winbackValidation.reason,
        isRule: true
      });
    }

    // 4. POINTS REDEEM - PASTI MUNCUL KALAU PUNYA POIN >=1
    const points = Number(member.points||0);
    if (points >= 1) {
      const pointValue = this.config.pointValue || 1;
      let maxRedeem = Math.min(points, 1000);
      let value = maxRedeem * pointValue;
      
      if (cartSubtotal > 0) {
        const maxValueByPercent = Math.floor(cartSubtotal * (this.config.maxDiscountPercent||15) / 100);
        if (maxValueByPercent > 0 && value > maxValueByPercent) {
          value = maxValueByPercent;
          maxRedeem = Math.floor(value / pointValue);
        }
        const pointsValidation = this.validateMemberDiscount(products, cart, value);
        value = pointsValidation.amount;
      }
      
      // Selalu muncul, walau cart kosong
      promos.push({
        id: `MEM-POINTS-${member.id}`,
        rule: 'POINTS_REDEEM',
        promoType: 'member_points',
        type: 'member_points',
        name: `💰 Tukar ${maxRedeem} Poin = Rp${value.toLocaleString('id-ID')}`,
        desc: `Kamu punya ${points} poin • ${cartSubtotal>0 ? (value>0 ? `Bisa ditukar jadi diskon` : 'Cart terlalu kecil') : 'Tambah produk untuk tukar'}`,
        discount: value,
        discountAmount: value,
        priority: 92,
        canApply: cartSubtotal > 0 && value > 0 && points >= 10,
        autoApply: false,
        memberId: member.id,
        config: { pointsNeeded: maxRedeem, value },
        reason: cartSubtotal>0 ? 'redeem' : 'preview',
        isRule: true
      });
    }

    // 5. FREQUENT
    if (freq30 >= (this.config.freqThreshold||4)) {
      promos.push({
        id: `MEM-FREQ-${member.id}`,
        rule: 'FREQUENT',
        promoType: 'member_frequent',
        type: 'member_frequent',
        name: `Frequent: Beli 3 Gratis 1 Termurah`,
        desc: `${freq30}x belanja 30 hari`,
        priority: 75,
        canApply: cart.length >= 3,
        autoApply: false,
        memberId: member.id,
        config: { freq: freq30 },
        reason: `Frequent buyer`,
        isRule: true
      });
    }

    // 6. AI PROMOS - REAL AI SAJA, DIMUAT PERTAMA KALI SAAT LOAD MEMBER (TANPA FALLBACK DUMMY)
    let aiPromos = [];
    try {
      const enableAI = this.config.enableAI === true || window._memberPromoState.aiEnabled === true;
      if (enableAI) {
        // Cek cache dulu biar tidak panggil Worker terus
        const cached = window._memberPromoState.aiCache[member.id];
        if (cached && (Date.now() - cached.ts) < 10*60*1000) {
          aiPromos = cached.promos;
          console.log('AI promo dari cache:', aiPromos.length);
        } else {
          // Panggil REAL AI - pertama kali saat load member
          console.log('Load AI promo pertama kali untuk member', member.id);
          aiPromos = await this.getAIPromos(member, cart, { products, transactions: allTrx, promotions, totalSpend, freq30, daysSinceLast, isBirthdayMonth });
          if (aiPromos.length > 0) {
            window._memberPromoState.aiCache[member.id] = { key: `${member.id}-${Date.now()}`, promos: aiPromos, ts: Date.now() };
          }
        }
      }
    } catch(e) {
      console.warn('AI promo gagal (Worker oke tapi error):', e);
      // TIDAK PAKAI FALLBACK DUMMY - biarkan kosong kalau AI gagal, jangan merusak manajemen
      aiPromos = [];
    }

    promos.sort((a,b) => b.priority - a.priority);
    const allPromos = [...promos, ...aiPromos];
    allPromos.sort((a,b) => b.priority - a.priority);

    return {
      member,
      totalSpend,
      totalTrxCount,
      freq30,
      spend30,
      avgBasket,
      daysSinceLast,
      isBirthdayMonth,
      isBirthdayToday,
      promos: allPromos,
      rulePromos: promos,
      aiPromos: aiPromos,
      totalPromos: allPromos.length
    };
  },

  // REAL AI SAJA - TANPA FALLBACK DUMMY
  async getAIPromos(member, cart = [], options = {}) {
    if (!member) return [];
    
    try {
      const AI = (await import('./ai.js')).default;
      if (!AI || !AI.generateMemberPromosi) {
        console.warn('AI module tidak ada generateMemberPromosi');
        return [];
      }

      const products = options.products || await DB.getProducts() || [];
      const allTrx = options.transactions || await DB.getTransactions() || [];
      
      // Hitung favorite
      const categoryCount = {};
      const productCount = {};
      const memberTrx = allTrx.filter(t => String(t.memberId) === String(member.id));
      memberTrx.forEach(trx => {
        const items = trx.items || trx.cart || trx.produk || [];
        (Array.isArray(items) ? items : []).forEach(item => {
          const cat = item.category || item.kategori || 'Umum';
          categoryCount[cat] = (categoryCount[cat]||0) + Number(item.qty||1);
          const pname = item.name || item.nama || String(item.prodId||item.id||'');
          productCount[pname] = (productCount[pname]||0) + Number(item.qty||1);
        });
      });
      const favoriteCategory = Object.entries(categoryCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
      const favoriteProducts = Object.entries(productCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name])=>name);

      let tokoSummary = null;
      try { 
        tokoSummary = await AI.getProductsSummary(); 
        console.log('Toko summary untuk AI:', tokoSummary ? 'ok' : 'null');
      } catch(e) {
        console.warn('getProductsSummary gagal:', e);
      }

      console.log('Panggil AI Worker generateMemberPromosi untuk', member.name);
      const aiResult = await AI.generateMemberPromosi({
        memberSummary: {
          member,
          totalSpend: options.totalSpend || 0,
          freq30: options.freq30 || 0,
          avgBasket: 0,
          daysSinceLast: options.daysSinceLast || 0,
          tier: member.tier,
          favoriteCategory,
          favoriteProducts,
          isBirthdayMonth: options.isBirthdayMonth || false,
          isBirthdayToday: false
        },
        tokoSummary,
        cart,
        goal: options.isBirthdayMonth ? 'birthday' : 'member_retention'
      });

      console.log('AI Worker result:', aiResult.strategies?.length || 0, 'strategies');

      const cartSubtotal = cart.reduce((a,i) => a + Number(i.price||0)*Number(i.qty||1), 0);
      const productsList = products;

      const aiPromos = (aiResult.strategies||[]).map((s, idx) => {
        const cfg = s.config || {};
        const type = s.type || 'tebus_member';
        let discountAmount = 0;

        if (type === 'member_tier' || type === 'birthday' || type === 'winback') {
          discountAmount = Math.round(cartSubtotal * (cfg.percent||5) / 100);
        } else if (type === 'tebus_member') {
          const prod = productsList.find(p => String(p.id||p.docId) === String(cfg.targetProdId||''));
          if (prod) {
            const normalPrice = Number(prod.price||0);
            const tebusPrice = Number(cfg.discountPrice||0);
            const cost = this.getProductCost(prod);
            const minTebus = Math.ceil(cost * 1.15);
            let finalTebusPrice = tebusPrice < minTebus ? minTebus : tebusPrice;
            cfg.discountPrice = finalTebusPrice;
            discountAmount = Math.max(0, normalPrice - finalTebusPrice);
          }
        } else if (type === 'bundle_member') {
          const prodA = productsList.find(p => String(p.id||p.docId) === String(cfg.prodA||''));
          const prodB = productsList.find(p => String(p.id||p.docId) === String(cfg.prodB||''));
          if (prodA && prodB) {
            const normalTotal = Number(prodA.price||0) + Number(prodB.price||0);
            const costTotal = this.getProductCost(prodA) + this.getProductCost(prodB);
            const minBundle = Math.ceil(costTotal * 1.15);
            let finalBundlePrice = Number(cfg.bundlePrice||0) < minBundle ? minBundle : Number(cfg.bundlePrice||0);
            cfg.bundlePrice = finalBundlePrice;
            discountAmount = Math.max(0, normalTotal - finalBundlePrice);
          }
        }

        const validated = this.validateMemberDiscount(productsList, cart, discountAmount);
        // Jika cart kosong, tetap tampilkan walau discount 0 (preview)
        if (cart.length > 0 && validated.amount <= 0) return null;

        const ruleMap = {
          'tebus_member': 'TEBUS_MEMBER',
          'bundle_member': 'BUNDLE_MEMBER',
          'member_tier': 'TIER_DISCOUNT',
          'birthday': 'BIRTHDAY',
          'winback': 'WINBACK',
          'frequent': 'FREQUENT'
        };

        return {
          id: `MEM-AI-${member.id}-${idx}-${Date.now()}`,
          rule: ruleMap[type] || 'TEBUS_MEMBER',
          promoType: `ai_${type}`,
          type: type,
          name: `✨ ${s.title}`,
          desc: s.reason || s.copywriting || 'AI Personal - Real Worker',
          discount: validated.amount,
          discountAmount: validated.amount,
          priority: s.priority || 85,
          canApply: cart.length > 0 || type === 'tebus_member' || type === 'bundle_member',
          autoApply: false,
          memberId: member.id,
          config: cfg,
          target_product_ids: s.target_product_ids,
          reason: validated.reason,
          isAI: true,
          source: 'ai_real_worker',
          products: s.target_product_ids?.map(id => productsList.find(p => String(p.id||p.docId) === String(id))).filter(Boolean),
          product: productsList.find(p => String(p.id||p.docId) === String(cfg.targetProdId||'')) || null
        };
      }).filter(Boolean);

      console.log('AI Worker berhasil (real, tanpa dummy):', aiPromos.length, 'promo');
      return aiPromos;

    } catch(e) {
      console.error('AI Worker gagal (real error, tanpa fallback dummy):', e);
      // JANGAN PAKAI FALLBACK DUMMY - kembalikan kosong biar tidak merusak manajemen toko
      return [];
    }
  },

  applyPromoToCart(promo, transaksiModule) {
    if (!promo || !transaksiModule) return { success: false, message: 'Invalid promo' };
    const state = window._memberPromoState;
    if (state.appliedIds.includes(promo.id)) {
      return { success: false, message: 'Promo sudah di-apply' };
    }
    const rule = (promo.rule || '').toUpperCase();
    const type = (promo.type || '').toLowerCase();
    const cfg = promo.config || {};

    if (transaksiModule.products) window._memberPromoState._productsCache = transaksiModule.products;

    if (['TIER_DISCOUNT','WINBACK','BIRTHDAY'].includes(rule) || ['member_tier','birthday','winback'].includes(type)) {
      const amount = Number(promo.discountAmount||0);
      if (amount > 0 || promo.rule === 'TIER_INFO') {
        if (amount > 0) transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + amount;
        state.appliedIds.push(promo.id);
        return { success: true, type: 'discount', amount };
      }
    }

    if (rule === 'POINTS_REDEEM' || type.includes('points')) {
      const val = Number(cfg.value||promo.discountAmount||0);
      const pts = Number(cfg.pointsNeeded||0);
      if (val <= 0) return { success: false, message: 'Nilai redeem 0 - tambah produk dulu atau poin kurang' };
      if (transaksiModule.currentMember && Number(transaksiModule.currentMember.points||0) < pts) {
        return { success: false, message: `Poin tidak cukup. Punya ${transaksiModule.currentMember.points}, butuh ${pts}` };
      }
      transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + val;
      transaksiModule.redeemPoints = (transaksiModule.redeemPoints||0) + pts;
      state.appliedIds.push(promo.id);
      return { success: true, type: 'points', amount: val, pointsUsed: pts };
    }

    if (rule === 'TEBUS_MEMBER' || type === 'tebus_member' || type === 'tebus_murah' || type.includes('tebus')) {
      let p = promo.product;
      if (!p) {
        const allProducts = transaksiModule.products || window._memberPromoState._productsCache || [];
        const targetId = cfg.targetProdId || cfg.prodId || cfg.prodA || (promo.target_product_ids||[])[0];
        console.log('Tebus resolve ID:', targetId, 'from products:', allProducts.length);
        p = allProducts.find(pp => String(pp.id||pp.docId) === String(targetId));
        if (!p && promo.target_product_ids && promo.target_product_ids[0]) {
          p = allProducts.find(pp => String(pp.id||pp.docId) === String(promo.target_product_ids[0]));
        }
      }
      if (p) {
        const existing = (transaksiModule.cart||[]).find(i => String(i.prodId) === String(p.id||p.docId) && i.promoId === promo.id);
        if (!existing) {
          const cost = this.getProductCost(p);
          const minTebus = Math.ceil(cost * 1.15);
          let tebusPrice = Number(cfg.discountPrice||0);
          if (!tebusPrice || tebusPrice <= 0) {
            tebusPrice = Number(p.price||0) - Number(promo.discountAmount||0);
            if (tebusPrice <= 0) tebusPrice = Math.floor(Number(p.price||0) * 0.5);
          }
          if (tebusPrice < minTebus) {
            return { success: false, message: `Harga tebus ${p.name} terlalu murah, min Rp${minTebus} biar profit 15% (modal Rp${cost})` };
          }
          transaksiModule.cart.push({
            prodId: p.id||p.docId,
            name: (p.name||'Produk') + ' (Tebus Member)',
            price: tebusPrice,
            buyPrice: cost,
            qty: 1,
            isMemberPromo: true,
            promoId: promo.id,
            taxEnabled: false
          });
        }
        state.appliedIds.push(promo.id);
        return { success: true, type: 'tebus', product: p };
      } else {
        return { success: false, message: `Produk tebus tidak ditemukan: ${cfg.targetProdId || (promo.target_product_ids||[])[0]}` };
      }
    }

    if (rule === 'BUNDLE_MEMBER' || type === 'bundle_member' || type === 'bundling' || type.includes('bundle')) {
      let pair = promo.products;
      if (!pair || !pair[0]) {
        const allProducts = transaksiModule.products || window._memberPromoState._productsCache || [];
        // Coba berbagai sumber ID
        const idA = cfg.prodA || cfg.buyProdId || cfg.prodId || (promo.target_product_ids||[])[0];
        const idB = cfg.prodB || cfg.getProdId || cfg.targetProdId || (promo.target_product_ids||[])[1] || idA;
        
        console.log('Bundle resolve IDs:', idA, idB, 'from products:', allProducts.length);
        
        const prodA = allProducts.find(pp => String(pp.id||pp.docId) === String(idA));
        const prodB = allProducts.find(pp => String(pp.id||pp.docId) === String(idB));
        
        if (prodA && prodB) {
          pair = [prodA, prodB];
        } else {
          // Jika tidak ketemu di cache, coba cari di promo.target_product_ids yang sudah ada product object
          if (promo.target_product_ids && promo.target_product_ids.length >= 2) {
            // Gunakan ID langsung sebagai fallback, buat pseudo product
            const fallbackA = allProducts.find(p => String(p.id||p.docId) === String(promo.target_product_ids[0]));
            const fallbackB = allProducts.find(p => String(p.id||p.docId) === String(promo.target_product_ids[1]));
            if (fallbackA && fallbackB) pair = [fallbackA, fallbackB];
          }
          
          if (!pair) {
            return { success: false, message: `Produk bundle tidak ditemukan: ${idA}, ${idB}. Cek produk masih ada?` };
          }
        }
      }
      
      if (pair && pair[0] && pair[1]) {
        const bundlePrice = Number(cfg.bundlePrice|| cfg.discount || 0);
        const normalTotal = this.getProductPrice(pair[0]) + this.getProductPrice(pair[1]);
        const costTotal = this.getProductCost(pair[0]) + this.getProductCost(pair[1]);
        const minBundle = Math.ceil(costTotal * 1.15);
        
        // Jika bundlePrice 0 atau tidak ada, hitung dari discountAmount
        let finalBundlePrice = bundlePrice;
        if (!finalBundlePrice || finalBundlePrice <= 0) {
          finalBundlePrice = normalTotal - Number(promo.discountAmount||0);
          if (finalBundlePrice <= 0) finalBundlePrice = Math.floor(normalTotal * 0.8);
        }
        
        if (finalBundlePrice < minBundle) {
          return { success: false, message: `Harga bundle terlalu murah, min Rp${minBundle} biar profit 15% (modal Rp${costTotal})` };
        }
        
        // Cek apakah bundle sudah ada di cart
        const existingBundle = transaksiModule.cart.find(i => String(i.prodId) === String(`bundle-${promo.id}`));
        if (existingBundle) {
          return { success: false, message: 'Bundle sudah ada di cart' };
        }
        
        const bundleItem = {
          prodId: `bundle-${promo.id}`,
          name: promo.name?.replace('✨','').trim() || `Paket ${pair[0].name} + ${pair[1].name}`,
          price: finalBundlePrice,
          buyPrice: costTotal,
          qty: 1,
          isMemberPromo: true,
          isBundle: true,
          promoId: promo.id,
          bundleProducts: [pair[0].id||pair[0].docId, pair[1].id||pair[1].docId],
          taxEnabled: false
        };
        transaksiModule.cart.push(bundleItem);
        state.appliedIds.push(promo.id);
        return { success: true, type: 'bundle', amount: normalTotal - finalBundlePrice };
      } else {
        return { success: false, message: 'Produk bundle tidak lengkap' };
      }
    }

    if (rule === 'FREQUENT' || type === 'frequent' || type.includes('buy')) {
      if ((transaksiModule.cart||[]).length >= 3) {
        const sorted = [...transaksiModule.cart].sort((a,b)=> Number(a.price)-Number(b.price));
        const cheapest = sorted[0];
        if (cheapest) {
          const freeDisc = Number(cheapest.price);
          const val = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], freeDisc);
          if (val.amount > 0) {
            transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + val.amount;
            state.appliedIds.push(promo.id);
            return { success: true, type: 'free_item', amount: val.amount, freeProduct: cheapest.name };
          }
        }
      } else {
        return { success: false, message: 'Butuh minimal 3 item di cart' };
      }
    }

    if (promo.discountAmount || promo.discount || cfg.discount || cfg.percent) {
      const amount = Number(promo.discountAmount||promo.discount||cfg.discount||0) || Math.round((transaksiModule.cart||[]).reduce((a,i)=>a+Number(i.price||0)*Number(i.qty||1),0) * Number(cfg.percent||0) / 100);
      const val = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], amount);
      if (val.amount > 0) {
        transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + val.amount;
        state.appliedIds.push(promo.id);
        return { success: true, type: 'discount', amount: val.amount };
      }
    }

    return { success: false, message: `Tipe promo belum di-handle: ${promo.type||promo.rule}` };
  },

  removePromoFromCart(promoId, transaksiModule) {
    if (!transaksiModule) return;
    const state = window._memberPromoState;
    const idx = state.appliedIds.indexOf(promoId);
    if (idx > -1) state.appliedIds.splice(idx,1);
    transaksiModule.cart = transaksiModule.cart.filter(item => item.promoId !== promoId);
  },

  resetForNewTransaction() {
    window._memberPromoState.appliedIds = [];
    window._memberPromoState.lastMemberId = null;
  },

  setAIEnabled(enabled) {
    window._memberPromoState.aiEnabled = enabled;
    this.config.enableAI = enabled;
    localStorage.setItem('edc_member_promo_config', JSON.stringify(this.config));
  }
};

export default MemberPromoModule;
