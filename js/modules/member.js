import DB from './db.js';

if (!window._memberState) {
  window._memberState = {
    currentPage: 1,
    perPage: 10,
    searchQuery: '',
    tierFilter: 'all'
  }
}

const MemberModule = {
  members: [],
  transactions: [],

  generateMemberId() {
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random()*90000);
    return `MBR-${year}-${rand}${Date.now().toString().slice(-3)}`;
  },

  DEFAULT_TIER_CONFIG: {
    bronze: { minSpend: 0, disc: 0, label: 'Bronze', color: '#a8a29e' },
    silver: { minSpend: 1000000, disc: 2, label: 'Silver', color: '#94a3b8' },
    gold: { minSpend: 3000000, disc: 5, label: 'Gold', color: '#eab308' },
    platinum: { minSpend: 10000000, disc: 10, label: 'Platinum', color: '#0ea5e9' }
  },

  DEFAULT_POINTS_CONFIG: {
    pointsRate: 10000,
    pointValue: 1,
    welcomePoints: 50,
    tierMultiplier: { bronze: 1, silver: 1, gold: 1, platinum: 1 }
  },

  getCustomTierConfig() {
    try {
      const saved = localStorage.getItem('edc_member_tier_custom');
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = JSON.parse(JSON.stringify(this.DEFAULT_TIER_CONFIG));
        Object.keys(parsed).forEach(k => {
          if (merged[k]) {
            merged[k].minSpend = Number(parsed[k].minSpend ?? merged[k].minSpend);
            merged[k].disc = Number(parsed[k].disc ?? merged[k].disc);
          }
        });
        return merged;
      }
    } catch(e){}
    return JSON.parse(JSON.stringify(this.DEFAULT_TIER_CONFIG));
  },

  saveCustomTierConfig(cfg) {
    localStorage.setItem('edc_member_tier_custom', JSON.stringify(cfg));
    if (window.MemberPromoModule && window.MemberPromoModule.config) {
      const td = {};
      Object.keys(cfg).forEach(k => td[k] = Number(cfg[k].disc||0));
      window.MemberPromoModule.config.tierDiscounts = td;
      localStorage.setItem('edc_member_promo_config', JSON.stringify(window.MemberPromoModule.config));
    }
  },

  resetCustomTierConfig() {
    localStorage.removeItem('edc_member_tier_custom');
  },

  getTierConfig() {
    return this.getCustomTierConfig();
  },

  calculateTier(totalSpend) {
    const cfg = this.getCustomTierConfig();
    const spend = Number(totalSpend||0);
    const sorted = Object.entries(cfg).sort((a,b)=> b[1].minSpend - a[1].minSpend);
    for (const [tier, data] of sorted) {
      if (spend >= Number(data.minSpend||0)) return tier;
    }
    return 'bronze';
  },

  getPointsConfig() {
    try {
      const saved = localStorage.getItem('edc_member_points_custom');
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = JSON.parse(JSON.stringify(this.DEFAULT_POINTS_CONFIG));
        merged.pointsRate = Number(parsed.pointsRate ?? merged.pointsRate);
        merged.pointValue = Number(parsed.pointValue ?? merged.pointValue);
        merged.welcomePoints = Number(parsed.welcomePoints ?? merged.welcomePoints);
        if (parsed.tierMultiplier) {
          Object.keys(merged.tierMultiplier).forEach(k => {
            if (parsed.tierMultiplier[k] !== undefined) merged.tierMultiplier[k] = Number(parsed.tierMultiplier[k]);
          });
        }
        return merged;
      }
    } catch(e){}
    return JSON.parse(JSON.stringify(this.DEFAULT_POINTS_CONFIG));
  },

  savePointsConfig(cfg) {
    localStorage.setItem('edc_member_points_custom', JSON.stringify(cfg));
    try {
      const promoCfgStr = localStorage.getItem('edc_member_promo_config');
      let promoCfg = promoCfgStr ? JSON.parse(promoCfgStr) : { tierDiscounts: { bronze:0, silver:2, gold:5, platinum:10 }, winbackThreshold:null, freqThreshold:4, birthdayDiscount:15, minSpendForTebus:50000 };
      promoCfg.pointsRate = cfg.pointsRate;
      promoCfg.pointValue = cfg.pointValue;
      localStorage.setItem('edc_member_promo_config', JSON.stringify(promoCfg));
      if (window.MemberPromoModule) {
        window.MemberPromoModule.config.pointsRate = cfg.pointsRate;
        window.MemberPromoModule.config.pointValue = cfg.pointValue;
      }
    } catch(e){}
  },

  resetPointsConfig() {
    localStorage.removeItem('edc_member_points_custom');
  },

  calculatePointsEarned(totalBelanja, tier) {
    const cfg = this.getPointsConfig();
    const rate = Number(cfg.pointsRate||10000);
    if (rate <= 0) return 0;
    const base = Math.floor(Number(totalBelanja||0) / rate);
    const mult = cfg.tierMultiplier ? (cfg.tierMultiplier[tier||'bronze']||1) : 1;
    return Math.floor(base * mult);
  },

  calculatePointsValue(points) {
    const cfg = this.getPointsConfig();
    return Number(points||0) * Number(cfg.pointValue||1);
  },

  async getAllMembers() {
    return await DB.getMembers() || [];
  },

  async render() {
    this.members = await this.getAllMembers();
    this.transactions = await DB.getTransactions() || [];

    const perPage = window._memberState.perPage || 10;
    let currentPage = window._memberState.currentPage || 1;
    let filtered = this.members;

    const q = (window._memberState.searchQuery||'').toLowerCase();
    if (q) {
      filtered = filtered.filter(m => 
        (m.name||'').toLowerCase().includes(q) ||
        (m.phone||'').includes(q) ||
        (m.id||'').toLowerCase().includes(q) ||
        (m.barcodeValue||'').toLowerCase().includes(q)
      );
    }
    const tierFilter = window._memberState.tierFilter || 'all';
    if (tierFilter !== 'all') {
      filtered = filtered.filter(m => (m.tier||'bronze') === tierFilter);
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    window._memberState.currentPage = currentPage;
    const startIdx = (currentPage-1)*perPage;
    const paginated = filtered.slice(startIdx, startIdx+perPage);
    const tiers = this.getTierConfig();
    const pointsCfg = this.getPointsConfig();

    return `
      <div style="display:flex; flex-direction:column; gap:12px; padding-bottom:20px;">
        <!-- HEADER -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:0.95rem; color:var(--text-primary); display:flex; align-items:center; gap:8px; font-weight:800;">
            <span style="background:var(--accent-color); color:#fff; width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center;">👥</span>
            Member Digital
          </h3>
          <span style="font-size:0.7rem; background:var(--bg-card); color:var(--text-secondary); padding:4px 10px; border-radius:20px; border:1px solid var(--border-color);">${this.members.length} Member</span>
        </div>

        <!-- THRESHOLD LEVEL - DARK THEME -->
        <div class="setting-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#8b5cf6; color:#fff; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">⚙️</span>
              <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">Threshold Level</span>
            </div>
            <button id="btn-reset-tier-threshold" class="btn-touch" style="font-size:0.7rem; padding:5px 10px;">Reset</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${Object.entries(tiers).map(([key, t]) => `
              <div style="display:flex; gap:8px; align-items:center; background:var(--bg-primary); padding:10px; border-radius:8px; border:1px solid var(--border-color); border-left:3px solid ${t.color};">
                <div style="width:60px; font-weight:700; font-size:0.75rem; color:${t.color};">${t.label}</div>
                <div style="flex:1;">
                  <label style="font-size:0.6rem; color:var(--text-secondary);">Min Belanja</label>
                  <input type="number" id="tier-min-${key}" value="${t.minSpend}" ${key==='bronze'?'disabled':''} class="form-control" style="margin-top:2px;" />
                </div>
                <div style="width:75px;">
                  <label style="font-size:0.6rem; color:var(--text-secondary);">Disc %</label>
                  <input type="number" id="tier-disc-${key}" value="${t.disc}" min="0" max="100" class="form-control" style="margin-top:2px;" />
                </div>
              </div>
            `).join('')}
          </div>
          <button id="btn-save-tier-threshold" class="btn-touch active" style="width:100%; margin-top:10px;">💾 Simpan Threshold</button>
        </div>

        <!-- POINTS CONFIG - DARK THEME -->
        <div class="setting-card" style="border-left:3px solid var(--success-color);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:var(--success-color); color:#fff; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">💰</span>
              <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">Custom Poin</span>
              <span style="font-size:0.6rem; background:rgba(16,185,129,0.15); color:var(--success-color); padding:2px 6px; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">1p = Rp${pointsCfg.pointValue}</span>
            </div>
            <button id="btn-reset-points-config" class="btn-touch" style="font-size:0.7rem; padding:5px 10px;">Reset</button>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
            <div>
              <label style="font-size:0.65rem; color:var(--text-secondary);">Rp Dapat 1 Poin</label>
              <input type="number" id="points-rate" value="${pointsCfg.pointsRate}" min="1" class="form-control" />
              <div style="font-size:0.6rem; color:var(--text-secondary); margin-top:2px;">Rp ${Number(pointsCfg.pointsRate).toLocaleString('id-ID')} = 1 poin</div>
            </div>
            <div>
              <label style="font-size:0.65rem; color:var(--success-color); font-weight:700;">1 Poin = Rp Berapa</label>
              <input type="number" id="points-value" value="${pointsCfg.pointValue}" min="1" class="form-control" style="border-color:var(--success-color); font-weight:700;" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
            <div>
              <label style="font-size:0.65rem; color:var(--text-secondary);">Welcome Points</label>
              <input type="number" id="points-welcome" value="${pointsCfg.welcomePoints}" min="0" class="form-control" />
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:8px; display:flex; flex-direction:column; justify-content:center;">
              <div style="font-size:0.6rem; color:var(--text-secondary);">Simulasi 50rb</div>
              <div style="font-size:0.8rem; font-weight:700; color:var(--success-color);">${Math.floor(50000/pointsCfg.pointsRate)} poin = Rp ${(Math.floor(50000/pointsCfg.pointsRate)*pointsCfg.pointValue).toLocaleString('id-ID')}</div>
            </div>
          </div>

          <!-- MULTIPLIER - FIXED DARK THEME -->
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:8px; padding:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:0.7rem; font-weight:700; color:var(--text-primary);">Multiplier per Tier</span>
              <span style="font-size:0.6rem; color:var(--text-secondary); background:var(--bg-card); padding:2px 6px; border-radius:10px; border:1px solid var(--border-color);">Tier × poin</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${Object.entries(tiers).map(([k,t]) => `
                <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-left:3px solid ${t.color}; border-radius:8px; padding:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.7rem; font-weight:700; color:${t.color};">${t.label}</span>
                    <span style="font-size:0.6rem; color:var(--text-secondary);">x poin</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <input type="number" id="points-mult-${k}" value="${pointsCfg.tierMultiplier[k]||1}" min="0" step="0.1" class="form-control" style="margin-top:0; font-weight:600;" />
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:700;">x</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <button id="btn-save-points-config" class="btn-touch active" style="width:100%; margin-top:10px; background:var(--success-color); border-color:var(--success-color);">💾 Simpan Config Poin (1p = Rp1)</button>
        </div>

        <!-- FORM GENERATOR - DARK THEME -->
        <div class="setting-card" style="border-left:3px solid var(--accent-color);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <span style="background:var(--accent-color); color:#fff; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">+</span>
            <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">Buat Member Baru</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
              <label style="font-size:0.7rem; color:var(--text-secondary);">Nama Lengkap *</label>
              <input id="member-input-name" placeholder="Contoh: Budi Santoso" class="form-control" />
            </div>
            <div>
              <label style="font-size:0.7rem; color:var(--text-secondary);">No HP (Unik) *</label>
              <input id="member-input-phone" placeholder="08xxxx" inputmode="numeric" class="form-control" />
            </div>
            <div>
              <label style="font-size:0.7rem; color:var(--text-secondary);">Tanggal Lahir 🎂 (Opsional untuk promo ultah)</label>
              <input id="member-input-birthday" type="date" class="form-control" />
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn-touch active" id="btn-generate-member" style="flex:1;">💾 Generate & Simpan</button>
            <button class="btn-touch" id="btn-clear-member-form">Clear</button>
          </div>

          <div id="member-card-preview" style="display:none; margin-top:12px; background:#fff; border-radius:12px; padding:12px; text-align:center; position:relative;">
            <div style="font-size:0.6rem; color:#0ea5e9; font-weight:700; margin-top:4px;">KARTU MEMBER DIGITAL</div>
            <div id="preview-member-name" style="font-weight:800; font-size:1rem; margin:6px 0; color:#0f172a;">-</div>
            <div style="background:#f8fafc; padding:8px; border-radius:6px; margin:6px 0;"><svg id="barcode-canvas"></svg></div>
            <div style="display:flex; justify-content:center; margin:8px 0;"><div id="qrcode-canvas" style="background:#fff; padding:6px; border-radius:6px;"></div></div>
            <div id="preview-member-id" style="font-size:0.65rem; font-family:monospace; background:#0f172a; color:#fff; padding:4px 8px; border-radius:20px; display:inline-block;">-</div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; margin-top:10px;">
              <button class="btn-touch" id="btn-close-member-card-2" style="font-size:0.65rem; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); color:var(--danger-color);">✕ Tutup</button>
              <button class="btn-touch" id="btn-print-member-card" style="font-size:0.65rem;">🖨️ Print</button>
              <button class="btn-touch" id="btn-download-member-card" style="font-size:0.65rem;">⬇️ PNG</button>
              <button class="btn-touch active" id="btn-share-member-wa" style="font-size:0.65rem;">WA</button>
            </div>
          </div>
        </div>

        <!-- SEARCH -->
        <div class="setting-card" style="padding:10px;">
          <div style="display:flex; gap:8px;">
            <input id="member-search" placeholder="🔍 Cari nama / HP / ID..." value="${window._memberState.searchQuery||''}" class="form-control" style="margin-top:0; flex:1;" />
            <select id="member-tier-filter" class="form-control" style="margin-top:0; width:110px;">
              <option value="all" ${tierFilter==='all'?'selected':''}>Semua</option>
              <option value="bronze" ${tierFilter==='bronze'?'selected':''}>Bronze</option>
              <option value="silver" ${tierFilter==='silver'?'selected':''}>Silver</option>
              <option value="gold" ${tierFilter==='gold'?'selected':''}>Gold</option>
              <option value="platinum" ${tierFilter==='platinum'?'selected':''}>Platinum</option>
            </select>
          </div>
        </div>

        <!-- LIST -->
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${paginated.length ? paginated.map(m => {
            const t = tiers[m.tier||'bronze'] || tiers.bronze;
            const memberTrx = this.transactions.filter(tr => String(tr.memberId) === String(m.id));
            const totalSpend = memberTrx.reduce((a,b)=>a+(Number(b.total||b.grandTotal||0)),0) || m.totalSpend || 0;
            return `
              <div class="setting-card" style="display:flex; justify-content:space-between; gap:8px; border-left:3px solid ${t.color}; margin-bottom:0; padding:10px;">
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <b style="font-size:0.85rem; color:var(--text-primary);">${m.name}</b>
                    <span style="font-size:0.55rem; padding:2px 6px; border-radius:20px; background:${t.color}; color:#fff; font-weight:700;">${(m.tier||'bronze').toUpperCase()}</span>
                    <span style="font-size:0.6rem; background:rgba(16,185,129,0.15); color:var(--success-color); padding:2px 6px; border-radius:6px; border:1px solid rgba(16,185,129,0.3);">${m.points||0} poin</span>
                  </div>
                  <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:3px;">${m.phone} • ${m.id}</div>
                  <div style="font-size:0.65rem; color:var(--text-secondary); opacity:0.7;">Rp ${Number(totalSpend).toLocaleString('id-ID')} • ${memberTrx.length} trx</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <button class="btn-show-barcode btn-touch" data-id="${m.id}" style="font-size:0.65rem; padding:5px 8px;">Barcode</button>
                  <button class="btn-delete-member btn-touch" data-id="${m.id}" style="font-size:0.65rem; padding:5px 8px; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); color:var(--danger-color);">Hapus</button>
                </div>
              </div>
            `;
          }).join('') : `<div style="text-align:center; padding:20px; background:var(--bg-secondary); border-radius:var(--radius); border:1px dashed var(--border-color); color:var(--text-secondary); font-size:0.8rem;">Belum ada member</div>`}
        </div>

        <!-- PAGINATION -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:8px 10px; border-radius:var(--radius); border:1px solid var(--border-color);">
          <button id="btn-member-prev" class="btn-touch" style="font-size:0.75rem; padding:6px 12px;" ${currentPage<=1?'disabled':''}>‹ Prev</button>
          <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">${currentPage} / ${totalPages}</span>
          <button id="btn-member-next" class="btn-touch" style="font-size:0.75rem; padding:6px 12px;" ${currentPage>=totalPages?'disabled':''}>Next ›</button>
        </div>
      </div>
    `;
  },

  async init() {
    document.getElementById('btn-generate-member')?.addEventListener('click', async () => {
      const name = document.getElementById('member-input-name').value.trim();
      const phone = document.getElementById('member-input-phone').value.trim();
      const birthday = document.getElementById('member-input-birthday')?.value || null;
      if (!name || !phone) return alert('Nama & No HP wajib diisi');
      const all = await this.getAllMembers();
      if (all.some(m => String(m.phone) === String(phone))) return alert('No HP sudah terdaftar');
      const member = await this.createMember({ name, phone, birthday });
      this.showBarcodePreview(member);
      window.app.loadModule('member');
    });

    document.getElementById('btn-clear-member-form')?.addEventListener('click', () => {
      document.getElementById('member-input-name').value = '';
      document.getElementById('member-input-phone').value = '';
      const bd = document.getElementById('member-input-birthday'); if (bd) bd.value = '';
    });

    document.getElementById('btn-save-tier-threshold')?.addEventListener('click', () => {
      const tiers = ['bronze','silver','gold','platinum'];
      const cfg = this.getCustomTierConfig();
      let valid = true;
      tiers.forEach(k => {
        const minEl = document.getElementById(`tier-min-${k}`);
        const discEl = document.getElementById(`tier-disc-${k}`);
        if (minEl && discEl) {
          const min = Number(minEl.value||0);
          const disc = Number(discEl.value||0);
          if (k!=='bronze' && min < 0) valid = false;
          if (disc < 0 || disc > 100) valid = false;
          cfg[k].minSpend = min;
          cfg[k].disc = disc;
        }
      });
      if (cfg.silver.minSpend <= cfg.bronze.minSpend || cfg.gold.minSpend <= cfg.silver.minSpend || cfg.platinum.minSpend <= cfg.gold.minSpend) {
        alert('Urutan Min Belanja harus naik: Bronze < Silver < Gold < Platinum');
        return;
      }
      if (!valid) { alert('Nilai threshold / disc tidak valid'); return; }
      this.saveCustomTierConfig(cfg);
      alert('Threshold level berhasil disimpan!');
      window.app.loadModule('member');
    });

    document.getElementById('btn-reset-tier-threshold')?.addEventListener('click', () => {
      if (!confirm('Reset threshold ke default?')) return;
      this.resetCustomTierConfig();
      localStorage.removeItem('edc_member_promo_config');
      window.app.loadModule('member');
    });

    document.getElementById('btn-save-points-config')?.addEventListener('click', () => {
      const rate = Number(document.getElementById('points-rate')?.value||10000);
      const value = Number(document.getElementById('points-value')?.value||1);
      const welcome = Number(document.getElementById('points-welcome')?.value||50);
      if (rate < 1 || value < 1 || welcome < 0) { alert('Nilai poin tidak valid'); return; }
      const cfg = this.getPointsConfig();
      cfg.pointsRate = rate;
      cfg.pointValue = value;
      cfg.welcomePoints = welcome;
      ['bronze','silver','gold','platinum'].forEach(k => {
        const el = document.getElementById(`points-mult-${k}`);
        if (el) cfg.tierMultiplier[k] = Number(el.value||1);
      });
      this.savePointsConfig(cfg);
      alert(`Config poin disimpan! 1 poin = Rp${value}`);
      window.app.loadModule('member');
    });

    document.getElementById('btn-reset-points-config')?.addEventListener('click', () => {
      if (!confirm('Reset config poin ke default? Default: Rp10rb = 1 poin, 1 poin = Rp1')) return;
      this.resetPointsConfig();
      localStorage.removeItem('edc_member_promo_config');
      window.app.loadModule('member');
    });

    document.getElementById('member-search')?.addEventListener('input', (e) => {
      window._memberState.searchQuery = e.target.value;
      window._memberState.currentPage = 1;
      window.app.loadModule('member');
    });

    document.getElementById('member-tier-filter')?.addEventListener('change', (e) => {
      window._memberState.tierFilter = e.target.value;
      window._memberState.currentPage = 1;
      window.app.loadModule('member');
    });

    document.getElementById('btn-member-prev')?.addEventListener('click', () => {
      if (window._memberState.currentPage > 1) {
        window._memberState.currentPage--;
        window.app.loadModule('member');
      }
    });
    document.getElementById('btn-member-next')?.addEventListener('click', () => {
      window._memberState.currentPage++;
      window.app.loadModule('member');
    });

    document.querySelectorAll('.btn-show-barcode').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const member = (await this.getAllMembers()).find(m => String(m.id) === String(id));
        if (member) this.showBarcodePreview(member);
      });
    });

    document.querySelectorAll('.btn-delete-member').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Hapus member ini?')) return;
        const id = btn.getAttribute('data-id');
        await DB.deleteMember(id);
        window.app.loadModule('member');
      });
    });

    document.getElementById('btn-print-member-card')?.addEventListener('click', () => {
      const preview = document.getElementById('member-card-preview');
      if (preview) {
        const w = window.open('', '_blank');
        w.document.write('<html><head><title>Member Card</title></head><body style="text-align:center;">'+preview.innerHTML+'</body></html>');
        w.document.close();
        w.print();
      }
    });

    document.getElementById('btn-download-member-card')?.addEventListener('click', async () => {
      const svg = document.getElementById('barcode-canvas');
      if (!svg) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const data = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img,0,0);
        const a = document.createElement('a');
        a.download = document.getElementById('preview-member-id').textContent + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(data);
    });

    document.getElementById('btn-share-member-wa')?.addEventListener('click', () => {
      const id = document.getElementById('preview-member-id').textContent;
      const name = document.getElementById('preview-member-name').textContent;
      const text = `*KARTU MEMBER DIGITAL*\n${name}\nID: ${id}\nTunjukkan barcode ini saat transaksi di kasir.`;
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    });

    const closePreview = () => {
      const preview = document.getElementById('member-card-preview');
      if (preview) preview.style.display = 'none';
    };
    document.getElementById('btn-close-member-card')?.addEventListener('click', closePreview);
    document.getElementById('btn-close-member-card-2')?.addEventListener('click', closePreview);
  },

  async createMember({ name, phone, birthday }) {
    const id = this.generateMemberId();
    const pointsCfg = this.getPointsConfig();
    const bdayDate = birthday ? new Date(birthday) : null;
    const member = {
      id,
      docId: id,
      name,
      phone: String(phone),
      birthday: bdayDate && !isNaN(bdayDate) ? bdayDate.toISOString() : null,
      birthMonth: bdayDate && !isNaN(bdayDate) ? bdayDate.getMonth()+1 : null,
      birthDay: bdayDate && !isNaN(bdayDate) ? bdayDate.getDate() : null,
      barcodeValue: id,
      tier: 'bronze',
      points: Number(pointsCfg.welcomePoints||50),
      totalSpend: 0,
      totalTrx: 0,
      joinedAt: Date.now(),
      lastTrxAt: null,
      isActive: true,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    };
    await DB.saveMember(member);
    return member;
  },

  showBarcodePreview(member) {
    const preview = document.getElementById('member-card-preview');
    if (!preview) return;
    preview.style.display = 'block';
    document.getElementById('preview-member-name').textContent = member.name;
    document.getElementById('preview-member-id').textContent = member.id + ' | ' + member.phone + (member.birthday ? ' | 🎂 ' + new Date(member.birthday).toLocaleDateString('id-ID') : '');
    if (window.JsBarcode) {
      try { JsBarcode('#barcode-canvas', member.barcodeValue || member.id, { format: 'CODE128', width: 2, height: 70, displayValue: true, fontSize: 14 }); } catch(e){}
    }
    const qrEl = document.getElementById('qrcode-canvas');
    if (qrEl) {
      qrEl.innerHTML = '';
      if (window.QRCode) new QRCode(qrEl, { text: member.barcodeValue || member.id, width: 128, height: 128 });
    }
    preview.scrollIntoView({ behavior: 'smooth' });
  },

  async lookupByBarcode(scanValue) {
    if (!scanValue) return null;
    const clean = String(scanValue).trim();
    const members = await this.getAllMembers();
    return members.find(m => 
      String(m.barcodeValue).trim() === clean ||
      String(m.id).trim() === clean ||
      String(m.phone).trim() === clean ||
      String(m.docId).trim() === clean
    ) || null;
  },

  async getMemberSpecificPromo(member) {
    if (!member) return null;
    const allTrx = await DB.getTransactions() || [];
    const memberTrx = allTrx.filter(t => String(t.memberId) === String(member.id));
    const totalSpend = memberTrx.reduce((a,b)=>a+Number(b.total||b.grandTotal||0),0) + (Number(member.totalSpend)||0);
    const freq30 = memberTrx.filter(t => {
      const time = t.createdAt || t.timestamp || t.date;
      let d = new Date(time);
      if (isNaN(d.getTime()) && !isNaN(Number(time))) d = new Date(Number(time));
      return !isNaN(d.getTime()) ? (Date.now() - d.getTime()) / (1000*60*60*24) <= 30 : true;
    }).length;
    const avgBasket = memberTrx.length ? totalSpend / memberTrx.length : 0;
    const last = memberTrx.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0))[0];
    const daysSinceLast = last ? Math.floor((Date.now() - new Date(last.createdAt||last.timestamp||Date.now()).getTime())/86400000) : 999;

    const categoryCount = {};
    const productCount = {};
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

    const tierCfg = this.getTierConfig()[member.tier||'bronze'] || this.getTierConfig().bronze;
    const newTier = this.calculateTier(totalSpend);

    let isBirthdayMonth = false;
    let isBirthdayToday = false;
    if (member.birthday) {
      const b = new Date(member.birthday);
      const now = new Date();
      if (!isNaN(b)) {
        isBirthdayMonth = b.getMonth() === now.getMonth();
        isBirthdayToday = b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
      }
    } else if (member.birthMonth) {
      isBirthdayMonth = Number(member.birthMonth) === (new Date().getMonth()+1);
    }

    return {
      member,
      totalSpend,
      freq30,
      avgBasket,
      daysSinceLast,
      tier: member.tier,
      newTier,
      tierDiscPercent: tierCfg.disc,
      shouldUpgrade: newTier !== member.tier,
      favoriteCategory,
      favoriteProducts,
      isBirthdayMonth,
      isBirthdayToday,
      categoryCount,
      productCount
    };
  }
};

export default MemberModule;
