import DB from './db.js';
import PromosiModule from './promosi.js';

if (!window._memberPromoState) {
  window._memberPromoState = {
    appliedIds: [], // promo member yang sudah di-apply di cart
    lastMemberId: null
  }
}

const MemberPromoModule = {
  // Config global promo member - sekarang sync dengan custom threshold member.js
  getDefaultConfig() {
    return {
      tierDiscounts: { bronze: 0, silver: 2, gold: 5, platinum: 10 },
      pointsRate: 10000,
      pointValue: 1,
      winbackThreshold: null,
      freqThreshold: 4,
      birthdayDiscount: 15,
      minSpendForTebus: 50000
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
      // load custom points
      const pointsCustom = localStorage.getItem('edc_member_points_custom');
      let pointsRate = 10000;
      let pointValue = 1; // default Rp1 sesuai request
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
        // sync points
        if (pointsCustom) { p.pointsRate = pointsRate; p.pointValue = pointValue; }
        else {
          // kalau belum ada custom, pastikan default 1
          if (!p.pointValue || p.pointValue === 100) p.pointValue = pointValue;
        }
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
        return p;
      }
      return { tierDiscounts, pointsRate: 10000, pointValue: 1, winbackThreshold: null, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000 };
    } catch(e) {
      return { tierDiscounts: { bronze: 0, silver: 2, gold: 5, platinum: 10 }, pointsRate: 10000, pointValue: 1, winbackThreshold: null, freqThreshold: 4, birthdayDiscount: 15, minSpendForTebus: 50000 };
    }
  })(),

  // === CORE: OLAH DATA MEMBER + CART + HISTORY ===
  async getAvailablePromos(member, cart = [], options = {}) {
    if (!member) return [];

    const products = options.products || await DB.getProducts() || [];
    const allTrx = options.transactions || await DB.getTransactions() || [];
    const promotions = options.promotions || await DB.getPromotions() || [];

    const memberTrx = allTrx.filter(t => String(t.memberId) === String(member.id));
    const now = new Date();
    const periodCfg = PromosiModule.getPeriodConfig ? PromosiModule.getPeriodConfig() : { days: 7, deadThreshold: 7, label: 'Mingguan' };

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
    const cartProductIds = cart.map(c => String(c.prodId || c.id)).filter(Boolean);

    const promos = [];
    const alreadyPromoIndex = new Set();
    promotions.forEach(p => {
      const c = p.config||{};
      const ids = [c.targetProdId,c.prodA,c.prodId,c.buyProdId,c.getProdId,c.prodB].filter(Boolean).map(String);
      ids.forEach(id => alreadyPromoIndex.add(`${p.type}:${id}`));
    });

    // 1. TIER DISCOUNT - selalu ada kalau bukan bronze
    // Selalu load config terbaru (biar custom threshold kepakai)
    try { const latest = this.loadConfig(); if (latest && latest.tierDiscounts) this.config.tierDiscounts = latest.tierDiscounts; } catch(e){}
    const tierDisc = this.config.tierDiscounts[member.tier||'bronze'] || 0;
    if (tierDisc > 0 && cartSubtotal > 0) {
      const discAmount = Math.round(cartSubtotal * tierDisc / 100);
      promos.push({
        id: `MEM-TIER-${member.id}`,
        rule: 'TIER_DISCOUNT',
        promoType: 'member_tier',
        type: 'member_tier',
        name: `Diskon Tier ${String(member.tier||'bronze').toUpperCase()} ${tierDisc}%`,
        desc: `Member ${member.tier} dapat extra ${tierDisc}%`,
        discount: discAmount,
        discountAmount: discAmount,
        priority: 100,
        canApply: true,
        autoApply: true,
        memberId: member.id,
        config: { tier: member.tier, percent: tierDisc },
        reason: `Tier benefit`
      });
    }

    // 2. WINBACK - tidak belanja lama (pakai deadThreshold dari promosi)
    const deadThreshold = this.config.winbackThreshold || periodCfg.deadThreshold || 7;
    if (daysSinceLast >= deadThreshold) {
      const winbackDisc = Math.round(cartSubtotal * 0.1);
      const profitSafe = this.validateMemberDiscount(products, cart, winbackDisc);
      promos.push({
        id: `MEM-WINBACK-${member.id}`,
        rule: 'WINBACK',
        promoType: 'weekend',
        type: 'weekend',
        name: `Winback - Kangen nih! ${daysSinceLast} hari`,
        desc: `Tidak belanja ${daysSinceLast} hari, diskon 10% khusus`,
        discount: profitSafe.amount,
        discountAmount: profitSafe.amount,
        priority: 95,
        canApply: true,
        autoApply: false,
        memberId: member.id,
        config: { prodId: null, discount: profitSafe.amount, daysSinceLast },
        reason: `Churn ${daysSinceLast} hari`
      });
    }

    // 3. FREQUENT BUYER - belanja >= 4x sebulan
    if (freq30 >= this.config.freqThreshold) {
      promos.push({
        id: `MEM-FREQ-${member.id}`,
        rule: 'FREQUENT',
        promoType: 'buy_x_get_y',
        type: 'buy_x_get_y',
        name: `Loyal Customer - Buy 3 Get 1`,
        desc: `${freq30}x belanja 30 hari terakhir, bonus Buy 3 Get 1 untuk produk termurah di cart`,
        discount: 0, // dihitung saat apply
        discountAmount: 0,
        priority: 90,
        canApply: cart.length >= 1,
        autoApply: false,
        memberId: member.id,
        config: { type: 'cheapest_free', minQty: 3 },
        reason: `Loyal ${freq30}x/bulan`
      });
    }

    // 4. BIRTHDAY MONTH - kalau member punya birthdate
    if (member.birthdate || member.tglLahir) {
      const bd = new Date(member.birthdate || member.tglLahir);
      if (!isNaN(bd.getTime()) && bd.getMonth() === now.getMonth()) {
        const bDisc = Math.round(cartSubtotal * this.config.birthdayDiscount / 100);
        const safe = this.validateMemberDiscount(products, cart, bDisc);
        promos.push({
          id: `MEM-BDAY-${member.id}`,
          rule: 'BIRTHDAY',
          promoType: 'weekend',
          type: 'weekend',
          name: `🎂 Birthday Month ${this.config.birthdayDiscount}% OFF`,
          desc: `Selamat ulang tahun! Diskon ${this.config.birthdayDiscount}% bulan ini`,
          discount: safe.amount,
          discountAmount: safe.amount,
          priority: 92,
          canApply: true,
          autoApply: false,
          memberId: member.id,
          config: { percent: this.config.birthdayDiscount },
          reason: `Birthday month`
        });
      }
    }

    // 5. MILESTONE - hampir naik tier
    const nextTierInfo = this.getNextTierInfo(totalSpend);
    if (nextTierInfo && nextTierInfo.needed <= 500000 && nextTierInfo.needed > 0) {
      promos.push({
        id: `MEM-MILESTONE-${member.id}`,
        rule: 'MILESTONE',
        promoType: 'member_tier',
        type: 'member_tier',
        name: `Hampir ${nextTierInfo.nextTier.toUpperCase()}! Kurang Rp ${nextTierInfo.needed.toLocaleString('id-ID')}`,
        desc: `Belanja Rp ${nextTierInfo.needed.toLocaleString('id-ID')} lagi untuk naik tier`,
        discount: 0,
        discountAmount: 0,
        priority: 70,
        canApply: false,
        autoApply: false,
        memberId: member.id,
        config: { needed: nextTierInfo.needed, nextTier: nextTierInfo.nextTier },
        reason: `Milestone tier`
      });
    }

    // 6. TEBUS MURAH KHUSUS MEMBER - dari produk slow/dead tapi profit aman
    // Ambil produk yang member pernah beli
    const memberBoughtIds = [...new Set(memberTrx.flatMap(t => (t.items||t.cart||[]).map(i => String(i.prodId||i.docId||i.id||'')).filter(Boolean)))];
    const candidateForTebus = products.filter(p => {
      const pid = String(p.id||p.docId);
      const stock = Number(p.stock||p.stok||0);
      if (stock <= 0) return false;
      // jangan kasih expired
      if (PromosiModule.getProductExpiredInfo) {
        const exp = PromosiModule.getProductExpiredInfo(p);
        if (exp && exp.isExpired) return false;
      }
      // prioritas produk yang pernah dibeli member
      if (memberBoughtIds.includes(pid)) return true;
      return false;
    }).slice(0,3);

    candidateForTebus.forEach(p => {
      const cost = this.getProductCost(p);
      const price = this.getProductPrice(p);
      const minTebusPrice = Math.ceil(cost * 1.05);
      if (minTebusPrice < price && cartSubtotal >= this.config.minSpendForTebus) {
        if (!alreadyPromoIndex.has(`tebus_murah:${String(p.id||p.docId)}`)) {
          promos.push({
            id: `MEM-TEBUS-${member.id}-${p.id||p.docId}`,
            rule: 'TEBUS_MEMBER',
            promoType: 'tebus_murah',
            type: 'tebus_murah',
            name: `Tebus Murah Member: ${p.name||p.nama||'Produk'}`,
            desc: `Min belanja Rp ${this.config.minSpendForTebus.toLocaleString('id-ID')}, tebus Rp ${minTebusPrice.toLocaleString('id-ID')}`,
            discount: 0,
            discountAmount: price - minTebusPrice,
            priority: 85,
            canApply: cartSubtotal >= this.config.minSpendForTebus,
            autoApply: false,
            memberId: member.id,
            config: { targetProdId: p.id||p.docId, discountPrice: minTebusPrice, minSpend: this.config.minSpendForTebus },
            product: p,
            reason: `Khusus member - pernah beli`
          });
        }
      }
    });

    // 7. POINTS REDEEM - tukar poin jadi diskon
    const points = Number(member.points||0);
    if (points >= 100) {
      const maxRedeemValue = points * this.config.pointValue;
      const redeemOptions = [
        { points: 100, value: 100 * this.config.pointValue },
        { points: 500, value: 500 * this.config.pointValue },
        { points: 1000, value: 1000 * this.config.pointValue }
      ].filter(o => o.points <= points);

      redeemOptions.forEach(opt => {
        promos.push({
          id: `MEM-POINTS-${member.id}-${opt.points}`,
          rule: 'POINTS_REDEEM',
          promoType: 'points',
          type: 'points',
          name: `Tukar ${opt.points} Poin = Rp ${opt.value.toLocaleString('id-ID')}`,
          desc: `${points} poin tersedia, tukar jadi diskon`,
          discount: opt.value,
          discountAmount: opt.value,
          priority: 88,
          canApply: points >= opt.points,
          autoApply: false,
          memberId: member.id,
          config: { pointsNeeded: opt.points, value: opt.value },
          reason: `Redeem points`
        });
      });
    }

    // 8. BUNDLE KHUSUS MEMBER - dari co-occurrence history member sendiri
    const coOcc = {};
    memberTrx.forEach(trx => {
      const items = trx.items || trx.cart || [];
      const ids = items.map(i => String(i.prodId||i.docId||i.id||'')).filter(Boolean);
      for (let i=0;i<ids.length;i++) {
        for (let j=i+1;j<ids.length;j++) {
          const key = [ids[i], ids[j]].sort().join('+');
          coOcc[key] = (coOcc[key]||0)+1;
        }
      }
    });
    const sortedCoOcc = Object.entries(coOcc).sort((a,b)=>b[1]-a[1]).slice(0,2);
    sortedCoOcc.forEach(([key, count]) => {
      if (count >= 2) {
        const [a,b] = key.split('+');
        const prodA = products.find(p => String(p.id||p.docId)===a);
        const prodB = products.find(p => String(p.id||p.docId)===b);
        if (prodA && prodB) {
          const bundlePrice = Math.round((this.getProductPrice(prodA)+this.getProductPrice(prodB))*0.85);
          const bundleCfg = { prodA: prodA.id||prodA.docId, prodB: prodB.id||prodB.docId, bundlePrice };
          const profitCheck = PromosiModule.checkProfitability ? PromosiModule.checkProfitability('bundling', bundleCfg, { prodA, prodB }) : { isProfitable: true };
          if (profitCheck.isProfitable) {
            promos.push({
              id: `MEM-BUNDLE-${member.id}-${key}`,
              rule: 'BUNDLE_MEMBER',
              promoType: 'bundling',
              type: 'bundling',
              name: `Paket Langganan: ${prodA.name} + ${prodB.name}`,
              desc: `${count}x beli bareng, paket hemat 15% khusus kamu`,
              discount: (this.getProductPrice(prodA)+this.getProductPrice(prodB))-bundlePrice,
              discountAmount: (this.getProductPrice(prodA)+this.getProductPrice(prodB))-bundlePrice,
              priority: 80,
              canApply: true,
              autoApply: false,
              memberId: member.id,
              config: bundleCfg,
              products: [prodA, prodB],
              reason: `${count}x bareng`
            });
          }
        }
      }
    });

    // Sort by priority desc
    promos.sort((a,b) => b.priority - a.priority);

    return {
      member,
      totalSpend,
      totalTrxCount,
      freq30,
      spend30,
      avgBasket,
      daysSinceLast,
      promos
    };
  },

  // Validasi agar diskon member tidak bikin rugi (pakai logika PromosiModule)
  validateMemberDiscount(products, cart, proposedDisc) {
    if (!cart.length) return { amount: proposedDisc, safe: true };
    let totalCost = 0;
    cart.forEach(item => {
      const prod = products.find(p => String(p.id||p.docId) === String(item.prodId));
      const cost = prod ? this.getProductCost(prod) : Number(item.buyPrice||0);
      totalCost += cost * Number(item.qty||1);
    });
    const subtotal = cart.reduce((a,i)=>a+Number(i.price)*Number(i.qty),0);
    const afterDisc = subtotal - proposedDisc;
    const minRevenue = totalCost * 1.05;
    if (afterDisc < minRevenue) {
      const maxDisc = Math.max(0, Math.floor(subtotal - minRevenue));
      return { amount: maxDisc, safe: false, maxAllowed: maxDisc };
    }
    return { amount: proposedDisc, safe: true };
  },

  getProductCost(p) {
    if (!p) return 0;
    return Number(p.costPrice ?? p.cogs ?? p.buyPrice ?? p.hargaBeli ?? p.modal ?? p.hpp ?? 0) || 0;
  },

  getProductPrice(p) {
    if (!p) return 0;
    return Number(p.price ?? p.hargaJual ?? p.harga ?? 0) || 0;
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
    return null; // sudah platinum
  },

  // Apply promo ke cart (dipanggil dari transaksi.js)
  applyPromoToCart(promo, transaksiModule) {
    if (!promo || !transaksiModule) return { success: false, message: 'Invalid promo' };

    const state = window._memberPromoState;
    if (state.appliedIds.includes(promo.id)) {
      return { success: false, message: 'Promo sudah di-apply' };
    }

    switch(promo.rule) {
      case 'TIER_DISCOUNT':
      case 'WINBACK':
      case 'BIRTHDAY':
        transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + Number(promo.discountAmount||0);
        state.appliedIds.push(promo.id);
        return { success: true, type: 'discount', amount: promo.discountAmount };

      case 'POINTS_REDEEM':
        transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + Number(promo.config.value||0);
        transaksiModule.redeemPoints = (transaksiModule.redeemPoints||0) + Number(promo.config.pointsNeeded||0);
        state.appliedIds.push(promo.id);
        // potong poin nanti saat transaksi sukses
        return { success: true, type: 'points', amount: promo.config.value, pointsUsed: promo.config.pointsNeeded };

      case 'TEBUS_MEMBER':
        // tambah produk tebus murah ke cart dengan harga khusus
        const p = promo.product;
        if (p) {
          const existing = transaksiModule.cart.find(i => String(i.prodId) === String(p.id||p.docId));
          if (existing) {
            // kalau sudah ada, jangan dobel, tapi update harga tebus untuk 1 qty
          } else {
            transaksiModule.cart.push({
              prodId: p.id||p.docId,
              name: p.name + ' (Tebus Member)',
              price: Number(promo.config.discountPrice),
              buyPrice: this.getProductCost(p),
              qty: 1,
              isMemberPromo: true,
              promoId: promo.id,
              taxEnabled: false
            });
          }
          state.appliedIds.push(promo.id);
          return { success: true, type: 'tebus', product: p };
        }
        break;

      case 'BUNDLE_MEMBER':
        // bundle member: cek apakah kedua produk ada di cart, kalau belum tambahkan
        const prodA = promo.products?.[0];
        const prodB = promo.products?.[1];
        if (prodA && prodB) {
          // hapus kedua produk jika ada di cart (harga normal)
          // lalu tambah 1 bundle item
          const bundleItem = {
            prodId: `bundle-${promo.id}`,
            name: `Paket ${prodA.name} + ${prodB.name}`,
            price: Number(promo.config.bundlePrice),
            buyPrice: this.getProductCost(prodA) + this.getProductCost(prodB),
            qty: 1,
            isMemberPromo: true,
            isBundle: true,
            promoId: promo.id,
            bundleProducts: [prodA.id||prodA.docId, prodB.id||prodB.docId],
            taxEnabled: false
          };
          transaksiModule.cart.push(bundleItem);
          state.appliedIds.push(promo.id);
          return { success: true, type: 'bundle', amount: promo.discountAmount };
        }
        break;

      case 'FREQUENT':
        // buy 3 get 1 cheapest free
        if (transaksiModule.cart.length >= 3) {
          const sorted = [...transaksiModule.cart].sort((a,b)=> Number(a.price)-Number(b.price));
          const cheapest = sorted[0];
          const freeDisc = Number(cheapest.price);
          transaksiModule.memberDiscount = (transaksiModule.memberDiscount||0) + freeDisc;
          state.appliedIds.push(promo.id);
          return { success: true, type: 'free_item', amount: freeDisc, freeProduct: cheapest.name };
        }
        break;
    }

    return { success: false, message: 'Tipe promo belum di-handle' };
  },

  removePromoFromCart(promoId, transaksiModule) {
    if (!transaksiModule) return;
    const state = window._memberPromoState;
    const idx = state.appliedIds.indexOf(promoId);
    if (idx > -1) state.appliedIds.splice(idx,1);

    // hapus item promo dari cart
    transaksiModule.cart = transaksiModule.cart.filter(item => item.promoId !== promoId);
    
    // kalau discount, harus recalculate - panggil calculateTotalWithPromos lagi di transaksi
    // reset memberDiscount dan hitung ulang dari appliedIds yang tersisa tidak disupport incremental,
    // jadi transaksi.js harus re-render
  },

  resetForNewTransaction() {
    window._memberPromoState.appliedIds = [];
    window._memberPromoState.lastMemberId = null;
  }
};

export default MemberPromoModule;
