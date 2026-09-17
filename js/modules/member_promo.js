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
      minMarginPercent: 10,
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
        if (!p.minMarginPercent) p.minMarginPercent = 10;
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
        if (!p.minMarginPercent) p.minMarginPercent = 10;
        if (!p.maxDiscountPercent) p.maxDiscountPercent = 15;
        return p;
      }
      return { tierDiscounts, pointsRate: 10000, pointValue: 1, winbackThreshold: 14, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000, enableAI: true, minMarginPercent: 10, maxDiscountPercent: 15 };
    } catch(e) {
      return { tierDiscounts: { bronze: 0, silver: 2, gold: 5, platinum: 10 }, pointsRate: 10000, pointValue: 1, winbackThreshold: 14, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000, enableAI: true, minMarginPercent: 10, maxDiscountPercent: 15 };
    }
  })(),

  validateMemberDiscount(products, cart, proposedDisc) {
    if (!cart || !cart.length) return { amount: proposedDisc, safe: true, reason: 'preview' };
    let totalCost = 0;
    let subtotal = 0;
    let minMargin = this.config.minMarginPercent || 10;
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

  // BONUS: hitung bonus poin sesuai setting member.js
  getBonusPoints(totalBelanja) {
    let pointsRate = 10000;
    try {
      const pcStr = localStorage.getItem('edc_member_points_custom');
      if (pcStr) {
        const pc = JSON.parse(pcStr);
        pointsRate = Number(pc.pointsRate ?? pc.rate ?? this.config.pointsRate ?? 10000);
      } else {
        pointsRate = Number(this.config.pointsRate ?? 10000);
      }
      const promoCfgStr = localStorage.getItem('edc_member_promo_config');
      if (promoCfgStr) {
        const promoCfg = JSON.parse(promoCfgStr);
        if (promoCfg.pointsRate !== undefined) pointsRate = Number(promoCfg.pointsRate);
      }
    } catch(e) {}
    if (!pointsRate || pointsRate <=0) pointsRate = 10000;
    return Math.floor(Number(totalBelanja||0) / pointsRate);
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

  async getAvailablePromos(member, cart = [], options = {}) {
    if (!member) return { member: null, promos: [], totalSpend: 0, totalTrxCount: 0, freq30: 0, spend30: 0, avgBasket: 0, daysSinceLast: 999, aiPromos: [], rulePromos: [] };
    const useAI = options.useAI === true;
    try {
      const pointsCustom = localStorage.getItem('edc_member_points_custom');
      if (pointsCustom) {
        const pc = JSON.parse(pointsCustom);
        if (pc.pointValue !== undefined) this.config.pointValue = Number(pc.pointValue);
        if (pc.pointsRate !== undefined) this.config.pointsRate = Number(pc.pointsRate);
      }
    } catch(e){}
    const products = options.products || await DB.getProducts() || [];
    const allTrx = options.transactions || await DB.getTransactions() || [];
    const memberTrx = allTrx.filter(t => String(t.memberId) === String(member.id));
    const now = new Date();
    const totalSpend = memberTrx.reduce((a,b) => a + Number(b.total || b.grandTotal || b.subtotal || 0), 0) + (Number(member.totalSpend)||0);
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
    const cartSubtotal = cart.reduce((a,i) => a + Number(i.price||0)*Number(i.qty||1), 0);
    const promos = [];
    try { const latest = this.loadConfig(); if (latest && latest.tierDiscounts) this.config.tierDiscounts = latest.tierDiscounts; } catch(e){}
    let tierDisc = this.config.tierDiscounts[member.tier||'bronze'] || 0;
    if (tierDisc > (this.config.maxDiscountPercent||15)) tierDisc = this.config.maxDiscountPercent||15;
    if (tierDisc > 0) {
      const rawDisc = cartSubtotal > 0 ? Math.round(cartSubtotal * tierDisc / 100) : 0;
      const validation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawDisc) : { amount: rawDisc, safe: true, reason: 'preview' };
      const discAmount = validation.amount;
      promos.push({
        id: `MEM-TIER-${member.id}`, rule: 'TIER_DISCOUNT', promoType: 'member_tier', type: 'member_tier',
        name: `Diskon Tier ${String(member.tier||'bronze').toUpperCase()} ${tierDisc}%`,
        desc: cartSubtotal > 0 ? (validation.safe ? `Member ${member.tier} extra ${tierDisc}%` : `Disesuaikan ${Math.round(discAmount/cartSubtotal*100)}% biar profit ${this.config.minMarginPercent}%`) : `Total belanja Rp${totalSpend.toLocaleString('id-ID')} - Tambah produk untuk klaim ${tierDisc}%`,
        discount: discAmount, discountAmount: discAmount, priority: 100, canApply: true, autoApply: cartSubtotal > 0 && discAmount > 0, memberId: member.id, config: { tier: member.tier, percent: tierDisc }, reason: validation.reason, isRule: true
      });
    }
    let isBirthdayMonth = false;
    let isBirthdayToday = false;
    if (member.birthday) {
      const b = new Date(member.birthday);
      if (!isNaN(b)) { isBirthdayMonth = b.getMonth() === now.getMonth(); isBirthdayToday = b.getMonth() === now.getMonth() && b.getDate() === now.getDate(); }
    } else if (member.birthMonth) { isBirthdayMonth = Number(member.birthMonth) === (now.getMonth()+1); }
    if (isBirthdayMonth) {
      let bdayDisc = this.config.birthdayDiscount || 15;
      if (bdayDisc > (this.config.maxDiscountPercent||15)) bdayDisc = this.config.maxDiscountPercent||15;
      const rawBday = cartSubtotal > 0 ? Math.round(cartSubtotal * bdayDisc / 100) : 0;
      const bdayValidation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawBday) : { amount: rawBday, safe: true, reason: 'preview' };
      const discAmount = bdayValidation.amount;
      promos.push({
        id: `MEM-BDAY-${member.id}`, rule: 'BIRTHDAY', promoType: 'member_birthday', type: 'member_tier',
        name: `🎂 Ultah ${bdayDisc}% ${isBirthdayToday ? '(HARI INI!)' : '(Bulan Ini)'}`, desc: `Selamat ultah ${member.name}! ${cartSubtotal>0 ? 'Klaim diskon ultah' : 'Tambah produk untuk klaim'}`,
        discount: discAmount, discountAmount: discAmount, priority: 95, canApply: true, autoApply: false, memberId: member.id, config: { percent: bdayDisc }, reason: bdayValidation.reason, isRule: true
      });
    }
    const winbackThreshold = this.config.winbackThreshold || 14;
    if (daysSinceLast >= winbackThreshold) {
      let winbackDisc = 10;
      if (winbackDisc > (this.config.maxDiscountPercent||15)) winbackDisc = this.config.maxDiscountPercent||15;
      const rawWinback = cartSubtotal > 0 ? Math.round(cartSubtotal * winbackDisc / 100) : 0;
      const winbackValidation = cartSubtotal > 0 ? this.validateMemberDiscount(products, cart, rawWinback) : { amount: rawWinback, safe: true, reason: 'preview' };
      const discAmount = winbackValidation.amount;
      promos.push({
        id: `MEM-WINBACK-${member.id}`, rule: 'WINBACK', promoType: 'member_winback', type: 'member_tier',
        name: `Kangen! Diskon Winback ${winbackDisc}%`, desc: `${daysSinceLast} hari tidak belanja`,
        discount: discAmount, discountAmount: discAmount, priority: 90, canApply: true, autoApply: false, memberId: member.id, config: { percent: winbackDisc, daysSinceLast }, reason: winbackValidation.reason, isRule: true
      });
    }
    const points = Number(member.points||0);
    if (points >= 1) {
      // FIX FINAL: Nilai poin ikut setting member.js, tukar semua poin (bukan cuma 10)
      let pointValue = 1;
      let pointsRate = 10000;
      try {
        const pcStr = localStorage.getItem('edc_member_points_custom');
        if (pcStr) {
          const pc = JSON.parse(pcStr);
          pointValue = Number(pc.pointValue ?? pc.point_value ?? pc.value ?? this.config.pointValue ?? 1);
          pointsRate = Number(pc.pointsRate ?? pc.rate ?? this.config.pointsRate ?? 10000);
        } else {
          pointValue = Number(this.config.pointValue ?? 1);
          pointsRate = Number(this.config.pointsRate ?? 10000);
        }
        const promoCfgStr = localStorage.getItem('edc_member_promo_config');
        if (promoCfgStr) {
          const promoCfg = JSON.parse(promoCfgStr);
          if (promoCfg.pointValue !== undefined) pointValue = Number(promoCfg.pointValue);
          if (promoCfg.pointsRate !== undefined) pointsRate = Number(promoCfg.pointsRate);
        }
      } catch(e) {
        pointValue = Number(this.config.pointValue || 1);
        pointsRate = Number(this.config.pointsRate || 10000);
      }
      if (!pointValue || pointValue <= 0) pointValue = 1;
      if (!pointsRate || pointsRate <= 0) pointsRate = 10000;
      this.config.pointValue = pointValue;
      this.config.pointsRate = pointsRate;

      // FIX: Tukar SEMUA poin yang ada, bukan cuma 10
      // Batasi agar diskon tidak melebihi subtotal
      let maxRedeem = points; // semua poin
      let rawValue = maxRedeem * pointValue;

      // Jika cart ada, batasi diskon max = subtotal (jangan lebih)
      if (cartSubtotal > 0 && rawValue > cartSubtotal) {
        maxRedeem = Math.floor(cartSubtotal / pointValue);
        rawValue = maxRedeem * pointValue;
      }

      // Jangan pakai validateMemberDiscount untuk poin display - biar muncul nilai asli
      // Validasi margin hanya untuk safety, tapi jangan sampai jadi Rp10
      let value = rawValue;
      if (value <= 0) value = 0;

      if (maxRedeem > 0 && value > 0) {
        promos.push({
          id: `MEM-POINTS-${member.id}`, rule: 'POINTS_REDEEM', promoType: 'member_points', type: 'member_points',
          name: `💰 Tukar ${maxRedeem} Poin = Rp${value.toLocaleString('id-ID')}`, 
          desc: `Kamu punya ${points} poin • ${cartSubtotal>0 ? `Tukar semua ${maxRedeem} poin jadi diskon Rp${value.toLocaleString('id-ID')}` : 'Tambah produk untuk tukar'}`,
          discount: value, discountAmount: value, priority: 92, canApply: cartSubtotal > 0 && value > 0, autoApply: false, memberId: member.id, 
          config: { pointsNeeded: maxRedeem, value, pointValue, pointsRate }, 
          reason: 'redeem_all', isRule: true
        });
      }
    }
    if (freq30 >= (this.config.freqThreshold||4)) {
      promos.push({
        id: `MEM-FREQ-${member.id}`, rule: 'FREQUENT', promoType: 'member_frequent', type: 'member_frequent',
        name: `Frequent: Beli 3 Gratis 1 Termurah`, desc: `${freq30}x belanja 30 hari`, priority: 75, canApply: true, autoApply: false, memberId: member.id, config: { freq: freq30 }, reason: `Frequent buyer`, isRule: true
      });
    }

    let aiPromos = [];
    let aiError = null;
    let aiEmpty = false;
    try {
      const enableAI = this.config.enableAI === true || window._memberPromoState.aiEnabled === true;
      const cached = window._memberPromoState.aiCache[member.id];
      const isCacheValid = cached && (Date.now() - cached.ts) < 10*60*1000;
      if (enableAI) {
        if (useAI) {
          if (isCacheValid) {
            aiPromos = cached.promos.slice(0,3);
            console.log('AI promo dari cache (max 3):', aiPromos.length);
          } else {
            console.log('AI member scan dipicu tombol scan member untuk', member.id);
            aiPromos = await this.getAIPromos(member, cart, { products, transactions: allTrx, totalSpend, freq30, daysSinceLast, isBirthdayMonth });
            aiPromos = (aiPromos||[]).slice(0,3);
            if (aiPromos.length > 0) {
              window._memberPromoState.aiCache[member.id] = { key: `${member.id}-${Date.now()}`, promos: aiPromos, ts: Date.now() };
            } else { aiEmpty = true; console.warn('AI tidak menghasilkan promo'); }
          }
        } else {
          if (isCacheValid) {
            aiPromos = cached.promos.slice(0,3);
            console.log('Member promo pakai cache AI (tanpa scan baru):', aiPromos.length);
          }
        }
      }
    } catch(e) {
      console.warn('AI promo gagal:', e);
      aiError = e.message || 'Gagal ambil data AI';
      aiPromos = [];
      const cached = window._memberPromoState.aiCache[member.id];
      if (cached && cached.promos.length > 0) { aiPromos = cached.promos.slice(0,3); aiError = null; }
    }

    const aiStatus = { attempted: useAI, error: aiError, empty: aiEmpty || (useAI && aiPromos.length === 0 && !aiError), count: aiPromos.length };
    promos.sort((a,b) => b.priority - a.priority);
    const allPromos = [...promos, ...aiPromos];
    allPromos.sort((a,b) => b.priority - a.priority);
    if (typeof aiStatus !== 'undefined') {
      if (useAI || aiStatus.error || aiStatus.empty || aiPromos.length > 0) {
        window._lastAIMemberStatus = { ...aiStatus, timestamp: Date.now() };
      }
    }
    return { member, totalSpend, totalTrxCount: memberTrx.length, freq30, daysSinceLast, isBirthdayMonth, isBirthdayToday, promos: allPromos, rulePromos: promos, aiPromos: aiPromos, totalPromos: allPromos.length };
  },

  async getAIPromos(member, cart = [], options = {}) {
    if (!member) return [];
    try {
      const AI = (await import('./ai.js')).default;
      if (!AI || !AI.generateMemberPromosi) return [];
      const products = options.products || await DB.getProducts() || [];
      const allTrx = options.transactions || await DB.getTransactions() || [];
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
      try { tokoSummary = await AI.getProductsSummary(); } catch(e) {}
      const aiResult = await AI.generateMemberPromosi({
        memberSummary: { member, totalSpend: options.totalSpend || 0, freq30: options.freq30 || 0, avgBasket: 0, daysSinceLast: options.daysSinceLast || 0, tier: member.tier, favoriteCategory, favoriteProducts, isBirthdayMonth: options.isBirthdayMonth || false, isBirthdayToday: false },
        tokoSummary, cart, goal: options.isBirthdayMonth ? 'birthday' : 'member_retention'
      });
      let strategies = aiResult.strategies || [];
      const allProductIds = new Set(products.map(p => String(p.id||p.docId)));
      const converted = strategies.map((s, idx) => {
        const validTargetIds = (s.target_product_ids||[]).filter(id => allProductIds.has(String(id)));
        let finalIds = validTargetIds;
        if (finalIds.length === 0 && s.config) {
          const cfgIds = [s.config.targetProdId, s.config.prodId, s.config.prodA, s.config.prodB, s.config.buyProdId, s.config.getProdId].filter(Boolean).map(String);
          const validCfgIds = cfgIds.filter(id => allProductIds.has(id));
          finalIds = validCfgIds;
        }
        // FIX: jangan fallback ke ID ngawur yang tidak ada di DB - kalau kosong, buang promo
        if (finalIds.length === 0) {
          console.warn(`AI promo "${s.title}" dibuang karena produk tidak ada di DB:`, s.target_product_ids);
          return null;
        }
        const cfg = s.config || {};
        let discountAmount = Number(s.discountAmount || s.discount || cfg.discount || cfg.discountPrice || 0);
        let rawName = s.title || s.name || `${s.type || 'Promo'} Personal`;
        if (!rawName.includes('✨') && !rawName.includes('🎁') && !rawName.includes('🔥') && !rawName.includes('💎') && !rawName.includes('🎂') && !rawName.includes('💰')) {
          rawName = `✨ ${rawName}`;
        }
        const name = rawName;
        const desc = s.reason || s.copywriting || s.desc || `Rekomendasi AI untuk ${member.name} • ${s.predicted_lift || 'Hemat lebih'}`;
        return {
          id: `AI-MEM-${member.id}-${Date.now()}-${idx}`,
          rule: (s.type||'AI_MEMBER').toUpperCase(),
          promoType: s.type || 'member_tier',
          type: s.type || 'member_tier',
          name: name,
          desc: desc,
          discount: discountAmount,
          discountAmount: discountAmount,
          priority: Number(s.priority||88),
          canApply: true,
          autoApply: false,
          memberId: member.id,
          config: cfg,
          target_product_ids: finalIds,
          reason: s.reason || s.predicted_lift || 'AI personalized',
          copywriting: s.copywriting || '',
          predicted_lift: s.predicted_lift || '',
          urgency: s.urgency || 'medium',
          isAI: true,
          source: 'ai_member',
          isRule: false
        };
      }).filter(s => s && s.target_product_ids && s.target_product_ids.length > 0);
      console.log(`AI Member strategies: ${strategies.length} -> validated & converted: ${converted.length}`);
      return converted;
    } catch(e) {
      console.error('getAIPromos error:', e);
      throw e;
    }
  },

  // FIX UTAMA: applyPromo tidak pernah gagal karena profit, selalu sukses
  async applyPromo(promo, transaksiModule) {
    if (!transaksiModule) return { success: false, message: 'Transaksi module tidak ada' };
    const state = window._memberPromoState;
    if (state.appliedIds.includes(promo.id)) {
      return { success: false, message: 'Promo sudah dipakai' };
    }
    const type = (promo.type||promo.promoType||'').toLowerCase();
    const rule = (promo.rule||'').toUpperCase();
    const cfg = promo.config || {};

    // Simpan products ke cache untuk resolve berikutnya
    if (transaksiModule.products && transaksiModule.products.length) {
      window._memberPromoState._productsCache = transaksiModule.products;
    }

    // === POINTS REDEEM - HARUS DI ATAS DISCOUNT, JANGAN MASUK isDiscountType ===
    if (rule === 'POINTS_REDEEM' || type === 'member_points') {
      const ptsNeeded = Number(cfg.pointsNeeded||cfg.points||cfg.valuePoints||0);
      const member = transaksiModule.currentMember || transaksiModule.selectedMember;
      if (!member) {
        return { success: false, message: 'Member tidak ditemukan untuk tukar poin' };
      }
      const available = Number(member.points||0);
      if (available < ptsNeeded || ptsNeeded <= 0) {
        return { success: false, message: `Poin tidak cukup, butuh ${ptsNeeded}, punya ${available}` };
      }
      const amount = Number(promo.discountAmount||cfg.value||0);
      let finalAmount = amount;
      
      const subtotal = (transaksiModule.cart||[]).reduce((a,i)=>a+Number(i.price||0)*Number(i.qty||1),0);
      if (subtotal > 0 && finalAmount > subtotal) {
        finalAmount = subtotal;
      }
      if (finalAmount <= 0) {
        return { success: false, message: 'Nilai tukar poin 0, cek setting pointValue di member.js' };
      }

      const existingPoints = transaksiModule.cart.find(i => String(i.promoId) === String(promo.id) && i.isPointsRedeem);
      if (existingPoints) {
        return { success: false, message: 'Poin sudah ditukar' };
      }

      // FIX BUG: Insert ke cart agar TOTAL berkurang
      const pointsItem = {
        prodId: `points-redeem-${promo.id}`,
        name: `💰 Tukar ${ptsNeeded} Poin`,
        price: -finalAmount,
        buyPrice: 0,
        qty: 1,
        isMemberPromo: true,
        isPointsRedeem: true,
        promoId: promo.id,
        taxEnabled: false
      };
      transaksiModule.cart.push(pointsItem);

      // Set untuk laporan & pengurangan setelah bayar - INI YANG PENTING
      // FIX DOUBLE: Untuk poin, diskon lewat cart negatif saja, jangan double via memberDiscount
      // memberDiscount khusus untuk Tier/Birthday/Winback, poin via cart
      transaksiModule.redeemPoints = (transaksiModule.redeemPoints||0) + ptsNeeded;
      // JANGAN tambah ke memberDiscount agar tidak double discount (subtotal sudah termasuk item negatif)
      // transaksiModule.memberDiscount += finalAmount; // DISABLED - FIX DOUBLE
      
      if (window._memberPromoState) {
        window._memberPromoState.memberDiscount = transaksiModule.memberDiscount;
        window._memberPromoState.redeemPoints = transaksiModule.redeemPoints;
      }

      // JANGAN ubah member.points disini, biar pengurangan terjadi setelah bayar
      state.appliedIds.push(promo.id);
      console.log(`✅ Tukar poin APPLY: ${ptsNeeded} poin = Rp${finalAmount}, redeemPoints ${transaksiModule.redeemPoints}, poin akan dikurangi setelah bayar`);
      return { success: true, type: 'points', amount: finalAmount, pointsUsed: ptsNeeded, remainingPoints: available - ptsNeeded };
    }

    // === TIER / BIRTHDAY / WINBACK / AI PERCENT -> DISCOUNT ===
    // Semua discount sekarang selalu sukses, meski validasi margin 0
    // FIX: POINTS sudah di-handle di atas, jangan masuk sini
    const isDiscountType = rule.includes('TIER') || rule.includes('BIRTHDAY') || rule.includes('WINBACK') || type.includes('member_tier') || (promo.isAI && cfg.percent);

    if (isDiscountType) {
      const subtotal = (transaksiModule.cart||[]).reduce((a,i)=>a+Number(i.price||0)*Number(i.qty||1),0);
      let amount = Number(promo.discountAmount||promo.discount||cfg.discount||cfg.value||0);
      if (!amount && cfg.percent) {
        amount = Math.round(subtotal * Number(cfg.percent)/100);
      }
      if (subtotal <= 0) {
        // Cart kosong, tetap allow preview
        state.appliedIds.push(promo.id);
        return { success: true, type: 'discount', amount: 0, preview: true };
      }
      const val = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], amount);
      let finalAmount = val.amount;
      // FIX: jika validasi 0 karena margin, jangan gagal, pakai max allowed atau minimal 1% subtotal
      if (finalAmount <= 0 && amount > 0) {
        if (val.maxAllowed && val.maxAllowed > 0) {
          finalAmount = val.maxAllowed;
        } else {
          // minimal Rp100 atau 1% subtotal biar tidak 0
          finalAmount = Math.min(amount, Math.max(100, Math.floor(subtotal * 0.01)));
          const retry = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], finalAmount);
          finalAmount = retry.amount;
        }
      }
      // Selalu sukses, bahkan jika finalAmount 0 (untuk preview)
      transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + (finalAmount||0);
      state.appliedIds.push(promo.id);
      return { success: true, type: 'discount', amount: finalAmount||0, requested: amount, reason: val.reason };
    }

    // === POINTS REDEEM SUDAH DI-HANDLE DI ATAS (BUGFIX) ===

    // === TEBUS MEMBER - FIX: jangan gagal karena harga terlalu murah, sesuaikan harga ===
    if (rule.includes('TEBUS') || type.includes('tebus')) {
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
      if (!p) {
        return { success: false, message: `Produk tebus tidak ditemukan: ${cfg.targetProdId || (promo.target_product_ids||[])[0]}` };
      }
      const existing = (transaksiModule.cart||[]).find(i => String(i.prodId) === String(p.id||p.docId) && i.promoId === promo.id);
      if (existing) {
        return { success: false, message: 'Tebus sudah ada di cart' };
      }
      const cost = this.getProductCost(p);
      const normalPrice = this.getProductPrice(p) || Number(p.price||0);
      const minTebus = Math.ceil(cost * 1.10);
      let tebusPrice = Number(cfg.discountPrice||cfg.discount||0);
      if (!tebusPrice || tebusPrice <= 0) {
        tebusPrice = normalPrice - Number(promo.discountAmount||0);
        if (tebusPrice <= 0) tebusPrice = Math.floor(normalPrice * 0.5);
      }
      // FIX AI: Jika AI ngasih harga tebus lebih mahal dari harga normal, paksa jadi lebih murah
      if (normalPrice > 0 && tebusPrice >= normalPrice) {
        console.warn(`⚠️ AI tebus ${p.name} Rp${tebusPrice} >= normal Rp${normalPrice}, turunkan jadi promo`);
        tebusPrice = Math.floor(normalPrice * 0.7); // 30% off biar kelihatan promo
        if (cost > 0) {
          const maxPromoByMargin = Math.max(minTebus, Math.floor(normalPrice * 0.9)); // minimal tetap lebih murah 10%
          // Jika 70% masih di bawah minTebus, pakai minTebus tapi pastikan minTebus < normalPrice
          if (tebusPrice < minTebus) tebusPrice = minTebus;
          // Jika minTebus sendiri >= normalPrice, paksa normalPrice - 10%
          if (tebusPrice >= normalPrice) tebusPrice = Math.max(1000, Math.floor(normalPrice * 0.9));
        }
      }
      // Jika terlalu murah, naikkan ke minTebus, jangan gagal
      if (cost > 0 && tebusPrice < minTebus) {
        console.warn(`Harga tebus ${p.name} Rp${tebusPrice} < min Rp${minTebus}, sesuaikan ke min`);
        // Tapi pastikan minTebus tidak bikin lebih mahal dari normal
        if (minTebus < normalPrice) tebusPrice = minTebus;
        else tebusPrice = Math.max(1000, Math.floor(normalPrice * 0.9));
      }
      if (tebusPrice <= 0) tebusPrice = minTebus || 1000;
      // Final safety: tebus harus selalu < normalPrice
      if (normalPrice > 0 && tebusPrice >= normalPrice) {
        tebusPrice = Math.max(1000, Math.floor(normalPrice * 0.85));
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
      state.appliedIds.push(promo.id);
      return { success: true, type: 'tebus', product: p, price: tebusPrice };
    }

    // === BUNDLE MEMBER - FIX: insert per produk ke cart (bukan 1 bundle item) ===
    if (rule.includes('BUNDLE') || type.includes('bundle') || type.includes('bundling') || (promo.isAI && cfg.prodA && cfg.prodB)) {
      let pair = promo.products;
      if (!pair || !pair[0]) {
        const allProducts = transaksiModule.products || window._memberPromoState._productsCache || [];
        const idA = cfg.prodA || cfg.buyProdId || cfg.prodId || (promo.target_product_ids||[])[0];
        const idB = cfg.prodB || cfg.getProdId || cfg.targetProdId || (promo.target_product_ids||[])[1] || idA;
        const prodA = allProducts.find(pp => String(pp.id||pp.docId) === String(idA));
        const prodB = allProducts.find(pp => String(pp.id||pp.docId) === String(idB));
        if (prodA && prodB) {
          pair = [prodA, prodB];
        } else {
          if (promo.target_product_ids && promo.target_product_ids.length >= 2) {
            const fallbackA = allProducts.find(p => String(p.id||p.docId) === String(promo.target_product_ids[0]));
            const fallbackB = allProducts.find(p => String(p.id||p.docId) === String(promo.target_product_ids[1]));
            if (fallbackA && fallbackB) pair = [fallbackA, fallbackB];
          }
          if (!pair) {
            return { success: false, message: `Produk bundle tidak ditemukan: ${idA}, ${idB}` };
          }
        }
      }
      if (pair && pair[0] && pair[1]) {
        const bundlePrice = Number(cfg.bundlePrice|| cfg.discount || cfg.bundlePriceFinal || 0);
        const normalTotal = this.getProductPrice(pair[0]) + this.getProductPrice(pair[1]);
        const costTotal = this.getProductCost(pair[0]) + this.getProductCost(pair[1]);
        const minBundle = Math.ceil(costTotal * 1.10);
        let finalBundlePrice = bundlePrice;
        if (!finalBundlePrice || finalBundlePrice <= 0) {
          finalBundlePrice = normalTotal - Number(promo.discountAmount||0);
          if (finalBundlePrice <= 0) finalBundlePrice = Math.floor(normalTotal * 0.8);
        }
        // FIX AI: Jika AI ngasih bundle lebih mahal dari normal, paksa jadi promo
        if (normalTotal > 0 && finalBundlePrice >= normalTotal) {
          console.warn(`⚠️ AI bundle Rp${finalBundlePrice} >= normal Rp${normalTotal}, turunkan jadi promo`);
          finalBundlePrice = Math.floor(normalTotal * 0.7); // 30% off
        }
        if (costTotal > 0 && finalBundlePrice < minBundle) {
          console.warn(`Bundle Rp${finalBundlePrice} < min Rp${minBundle}, sesuaikan`);
          // Pastikan minBundle tidak bikin lebih mahal dari normal
          if (minBundle < normalTotal) finalBundlePrice = minBundle;
          else finalBundlePrice = Math.floor(normalTotal * 0.85);
        }
        if (finalBundlePrice <= 0) finalBundlePrice = minBundle || Math.floor(normalTotal * 0.8);
        // Final safety: bundle harus selalu < normalTotal
        if (normalTotal > 0 && finalBundlePrice >= normalTotal) {
          finalBundlePrice = Math.floor(normalTotal * 0.85);
        }
        // Safety tambahan: jangan sampai bundle < minBundle kecuali minBundle >= normalTotal
        if (costTotal > 0 && finalBundlePrice < minBundle && minBundle < normalTotal) {
          finalBundlePrice = minBundle;
        }

        // Cek apakah bundle dengan promoId ini sudah ada (per produk)
        const existingBundle = transaksiModule.cart.find(i => String(i.promoId) === String(promo.id) && i.isBundle);
        if (existingBundle) {
          return { success: false, message: 'Bundle sudah ada di cart' };
        }

        // FIX: Insert per produk, harga dibagi proporsional
        const priceA = this.getProductPrice(pair[0]);
        const priceB = this.getProductPrice(pair[1]);
        const totalNormal = priceA + priceB || 1;
        let priceA_Final = Math.floor(finalBundlePrice * (priceA / totalNormal));
        let priceB_Final = finalBundlePrice - priceA_Final; // sisa untuk B agar total pas

        // Pastikan tidak di bawah cost + 10%
        const minA = Math.ceil(this.getProductCost(pair[0]) * 1.10);
        const minB = Math.ceil(this.getProductCost(pair[1]) * 1.10);
        if (priceA_Final < minA) { priceA_Final = minA; priceB_Final = finalBundlePrice - minA; }
        if (priceB_Final < minB) { priceB_Final = minB; priceA_Final = finalBundlePrice - minB; }

        const itemA = {
          prodId: pair[0].id||pair[0].docId,
          name: pair[0].name + ' (Bundle)',
          price: priceA_Final,
          buyPrice: this.getProductCost(pair[0]),
          qty: 1,
          isMemberPromo: true,
          isBundle: true,
          promoId: promo.id,
          bundleGroup: promo.id,
          taxEnabled: false
        };
        const itemB = {
          prodId: pair[1].id||pair[1].docId,
          name: pair[1].name + ' (Bundle)',
          price: priceB_Final,
          buyPrice: this.getProductCost(pair[1]),
          qty: 1,
          isMemberPromo: true,
          isBundle: true,
          promoId: promo.id,
          bundleGroup: promo.id,
          taxEnabled: false
        };

        transaksiModule.cart.push(itemA);
        transaksiModule.cart.push(itemB);
        state.appliedIds.push(promo.id);
        console.log(`✅ Bundle per produk: ${pair[0].name} Rp${priceA_Final} + ${pair[1].name} Rp${priceB_Final} = Rp${finalBundlePrice}`);
        return { success: true, type: 'bundle', amount: normalTotal - finalBundlePrice, price: finalBundlePrice, items: [itemA, itemB] };
      } else {
        return { success: false, message: 'Produk bundle tidak lengkap' };
      }
    }

    // === FREQUENT ===
    if (rule === 'FREQUENT' || type === 'frequent' || type.includes('buy')) {
      if ((transaksiModule.cart||[]).length >= 3) {
        const sorted = [...transaksiModule.cart].sort((a,b)=> Number(a.price)-Number(b.price));
        const cheapest = sorted[0];
        if (cheapest) {
          const freeDisc = Number(cheapest.price);
          const val = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], freeDisc);
          const finalAmt = val.amount > 0 ? val.amount : Math.floor(freeDisc * 0.5);
          transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + finalAmt;
          state.appliedIds.push(promo.id);
          return { success: true, type: 'free_item', amount: finalAmt, freeProduct: cheapest.name };
        }
      } else {
        // FIX: jika cart <3, jangan gagal, beri info tapi tetap sukses 0
        state.appliedIds.push(promo.id);
        return { success: true, type: 'free_item', amount: 0, message: 'Butuh minimal 3 item, promo dicatat dulu' };
      }
    }

    // === FALLBACK DISCOUNT ===
    if (promo.discountAmount || promo.discount || cfg.discount || cfg.percent || promo.isAI) {
      const subtotal = (transaksiModule.cart||[]).reduce((a,i)=>a+Number(i.price||0)*Number(i.qty||1),0);
      const amount = Number(promo.discountAmount||promo.discount||cfg.discount||0) || Math.round(subtotal * Number(cfg.percent||0) / 100) || 0;
      const val = this.validateMemberDiscount(transaksiModule.products||[], transaksiModule.cart||[], amount);
      let finalAmt = val.amount;
      if (finalAmt <= 0 && amount > 0) finalAmt = val.maxAllowed || Math.floor(subtotal * 0.01) || 0;
      transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + (finalAmt||0);
      state.appliedIds.push(promo.id);
      return { success: true, type: 'discount', amount: finalAmt||0 };
    }

    return { success: false, message: `Tipe promo belum di-handle: ${promo.type||promo.rule} - hubungi dev` };
  },

  removePromoFromCart(promoId, transaksiModule) {
    if (!transaksiModule) return;
    const state = window._memberPromoState;
    const idx = state.appliedIds.indexOf(promoId);
    if (idx > -1) state.appliedIds.splice(idx,1);
    const before = transaksiModule.cart.length;
    // Hapus semua item dengan promoId ini (bundle per produk = 2 item, points = 1 item)
    transaksiModule.cart = transaksiModule.cart.filter(item => String(item.promoId) !== String(promoId));
    const promo = (transaksiModule.memberPromoData?.promos||[]).find(p=>p.id===promoId);
    if (promo) {
      if (promo.rule === 'POINTS_REDEEM' || promo.type === 'member_points') {
        const pts = Number(promo.config?.pointsNeeded||0);
        const amount = Number(promo.discountAmount||0);
        if (pts > 0) {
          const member = transaksiModule.currentMember || transaksiModule.selectedMember;
          if (member) member.points = Number(member.points||0) + pts;
          transaksiModule.redeemPoints = Math.max(0, (transaksiModule.redeemPoints||0) - pts);
          // FIX DOUBLE: poin tidak pernah ditambah ke memberDiscount, jadi jangan kurangi
          // transaksiModule.memberDiscount = Math.max(0, (transaksiModule.memberDiscount||0) - amount);
          console.log(`Batal tukar poin: kembalikan ${pts} poin, amount Rp${amount} (tanpa ubah memberDiscount)`);
        }
      } else if (promo.type && promo.type.includes('bundle')) {
        // Bundle per produk: kembalikan tidak perlu logic khusus, cart sudah di-filter
        const amount = Number(promo.discountAmount||0);
        console.log(`Batal bundle per produk: ${promoId}`);
      } else if (promo.discountAmount) {
        transaksiModule.memberDiscount = Math.max(0, (transaksiModule.memberDiscount||0) - Number(promo.discountAmount||0));
      }
    }
    console.log(`Remove promo ${promoId}: cart ${before} -> ${transaksiModule.cart.length}`);
  },

  // === FINALIZE POINTS - PANGGIL SETELAH BAYAR SUKSES ===
  // Ini yang harus dipanggil di transaksi.js setelah pembayaran berhasil
  async finalizePointsAfterPayment(transaksiModule) {
    try {
      const member = transaksiModule.currentMember || transaksiModule.selectedMember;
      if (!member) return { success: false, message: 'Member tidak ada' };
      const redeem = Number(transaksiModule.redeemPoints||0);
      const totalBelanja = (transaksiModule.cart||[]).reduce((a,i)=>{
        // total belanja untuk bonus = hanya item positif (jangan hitung diskon negatif)
        const price = Number(i.price||0);
        return price > 0 ? a + price * Number(i.qty||1) : a;
      }, 0);
      const bonus = this.getBonusPoints(totalBelanja);
      const oldPoints = Number(member.points||0);
      const newPoints = oldPoints - redeem + bonus;
      
      console.log(`Finalize points: old ${oldPoints} - redeem ${redeem} + bonus ${bonus} = new ${newPoints}`);

      // Update di memory
      member.points = newPoints;
      if (transaksiModule.currentMember) transaksiModule.currentMember.points = newPoints;
      if (transaksiModule.selectedMember) transaksiModule.selectedMember.points = newPoints;

      // Persist ke DB (Dexie/IndexedDB)
      try {
        if (DB && DB.updateMember) {
          await DB.updateMember(member.id, { points: newPoints });
        } else if (DB && DB.putMember) {
          await DB.putMember({ ...member, points: newPoints });
        } else if (window.DB && window.DB.updateMember) {
          await window.DB.updateMember(member.id, { points: newPoints });
        }
        console.log(`✅ Poin berhasil diupdate di DB: ${newPoints}`);
      } catch(dbErr) {
        console.warn('Gagal update poin di DB, tapi memory sudah update:', dbErr);
      }

      return { success: true, oldPoints, redeem, bonus, newPoints };
    } catch(e) {
      console.error('finalizePointsAfterPayment error:', e);
      return { success: false, message: e.message };
    }
  },

  resetForNewTransaction() {
    window._memberPromoState.appliedIds = [];
    window._memberPromoState.lastMemberId = null;
  },

  setAIEnabled(enabled) {
    window._memberPromoState.aiEnabled = enabled;
    this.config.enableAI = enabled;
    localStorage.setItem('edc_member_promo_config', JSON.stringify(this.config));
  },

  async applyPromoToCart(promo, transaksiModule) {
    return await this.applyPromo(promo, transaksiModule);
  }
};

export default MemberPromoModule;
