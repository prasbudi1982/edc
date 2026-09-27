// admin.js - FINAL FIX - Style asli tetap (var(--primary) dll), Fetch lengkap, Modal detail user & laporan
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== STATS - FIX is_banned, active = online/active, driver_locations =====
export async function getAdminStats(){
  try{
    const { data: users, error } = await supabase.from('users').select('id, role, status, banned, is_banned, created_at');
    if(error) throw error;
    const total = users?.length||0;
    const active = users?.filter(u=> ['online','active'].includes(u.status) && !u.banned && !u.is_banned).length||0;
    const offline = users?.filter(u=>u.status==='offline').length||0;
    const banned = users?.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned').length||0;
    const drivers = users?.filter(u=>u.role==='driver').length||0;
    const passengers = users?.filter(u=>u.role==='passenger').length||0;
    const admins = users?.filter(u=>u.role==='admin').length||0;
    let ordersToday = 0;
    try{
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){}
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

// ===== FETCH USERS - LENGKAP + CLIENT SIDE FILTER (FIX RLS ilike) + driver_locations =====
export async function getUsersList(filter, search){
  if(filter===undefined) filter='all';
  if(search===undefined) search='';
  try{
    // Fetch all users dulu (biar RLS ilike tidak blokir)
    const { data, error } = await supabase.from('users').select('*').order('created_at', {ascending:false}).limit(200);
    if(error) throw error;
    let list = data||[];

    // Join driver_locations untuk online status
    try{
      const driverIds = list.filter(function(u){ return String(u.role||'').toLowerCase().indexOf('driver')>=0; }).map(function(u){ return u.id; });
      if(driverIds.length){
        const { data: locs } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').in('driver_id', driverIds).order('updated_at',{ascending:false});
        const map={};
        (locs||[]).forEach(function(l){ if(!map[l.driver_id]) map[l.driver_id]=l; });
        list = list.map(function(u){
          if(map[u.id]) return Object.assign({}, u, { last_seen: map[u.id].updated_at, _driverLoc: map[u.id], _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 });
          return Object.assign({}, u, { _isOnline: u.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000 : false });
        });
      }
    }catch(e){}

    // Filter
    if(filter==='active') list = list.filter(function(u){ return ['active','online'].indexOf(u.status)>=0 && !u.banned && !u.is_banned; });
    else if(filter==='offline') list = list.filter(function(u){ return u.status==='offline'; });
    else if(filter==='banned') list = list.filter(function(u){ return u.banned===true || u.is_banned===true || u.status==='banned'; });
    else if(filter==='online') list = list.filter(function(u){ return String(u.role||'').toLowerCase().indexOf('driver')>=0 && u._isOnline; });
    else if(filter==='driver') list = list.filter(function(u){ return u.role==='driver'; });
    else if(filter==='passenger') list = list.filter(function(u){ return u.role==='passenger'; });
    else if(filter==='admin') list = list.filter(function(u){ return u.role==='admin'; });

    // Search client-side (fix RLS)
    if(search){
      const cleanSearch = search.replace(/[%_,]/g, '').trim().toLowerCase();
      if(cleanSearch){
        list = list.filter(function(u){
          return String(u.name||'').toLowerCase().indexOf(cleanSearch)>=0 || String(u.email||'').toLowerCase().indexOf(cleanSearch)>=0 || String(u.hp||u.phone||'').toLowerCase().indexOf(cleanSearch)>=0 || String(u.desa||'').toLowerCase().indexOf(cleanSearch)>=0 || String(u.warung_name||'').toLowerCase().indexOf(cleanSearch)>=0;
        });
      }
    }
    return list;
  }catch(e){ return []; }
}
export const getUsers = getUsersList;

// ===== FETCH USER DETAIL - LENGKAP + driver_locations + orders =====
export async function getUserDetail(userId){
  try{
    if(!userId) throw new Error('userId kosong');
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    let detail = { user: data, orders: [], _driverLoc: null };
    try{
      const { data: orders } = await supabase.from('orders').select('id,status,created_at,total_fare').or('passenger_id.eq.'+userId+',driver_id.eq.'+userId).order('created_at',{ascending:false}).limit(20);
      detail.orders = orders||[];
    }catch(e){}
    try{
      const { data: loc } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').eq('driver_id', userId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(loc) detail._driverLoc = loc;
    }catch(e){}
    return detail;
  }catch(e){ return null; }
}

export async function banUser(userId, reason){
  if(reason===undefined) reason='Pelanggaran';
  // FIX: jangan set status='banned' karena violates check constraint users_status_check, cukup banned & is_banned
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason: reason }); }catch(e){}
  return true;
}

export async function unbanUser(userId){
  const { error, data } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  return true;
}

// ===== FETCH REPORTS - LENGKAP v_reports_detail + fallback + join =====
export async function getReports(status){
  if(status===undefined) status='all';
  // Coba v_reports_detail dulu (dari debug log kamu ada 1 laporan di sini)
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(!error && data && data.length>=0) return data;
  }catch(e){}
  // Fallback reports dengan join reporter/reported
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name, email, hp), reported:reported_id(name, email, hp, role)').order('created_at',{ascending:false}).limit(80);
    if(!error) {
      let list = data||[];
      if(status!=='all') list = list.filter(function(r){ return r.status===status; });
      return list;
    }
  }catch(e){}
  try{
    const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(80);
    let list = data||[];
    if(status!=='all') list = list.filter(function(r){ return r.status===status; });
    return list;
  }catch(err){ return []; }
}

// ===== APP SETTINGS - TETAP SAMA, JANGAN UBAH STYLE =====
export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return Object.assign({}, APP_SETTINGS_DEFAULT, JSON.parse(saved));
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export async function saveAppSettings(newSettings){
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode){
    localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  }
  try{
    await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'});
  }catch(e){}
  applyAppTheme(newSettings);
  setTimeout(function(){ location.reload(); }, 350);
  return true;
}

export function applyAppTheme(settings){
  try{
    const root = document.documentElement;
    if(settings.primaryColor) root.style.setProperty('--primary', settings.primaryColor);
    if(settings.secondaryColor) root.style.setProperty('--secondary', settings.secondaryColor);
    if(settings.appName) document.title = settings.appName;
  }catch(e){}
}
export function getSettingsLive(){ return getAppSettings(); }

export const ADMIN_SQL = `
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),
  reported_id uuid references users(id),
  reason text,
  description text,
  status text default 'pending',
  created_at timestamptz default now()
);
alter table users add column if not exists banned boolean default false;
alter table users add column if not exists is_banned boolean default false;
alter table users add column if not exists banned_reason text;
alter table users add column if not exists banned_at timestamptz;
create table if not exists banned_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reason text,
  banned_by uuid references users(id),
  created_at timestamptz default now()
);
create table if not exists app_settings (
  id int primary key,
  settings jsonb,
  updated_at timestamptz default now()
);
`;

export async function logoutAdmin(){
  try{ await supabase.auth.signOut(); }catch(e){}
  location.hash='#/login';
  setTimeout(function(){ location.reload(); }, 300);
}

// ===== VIEW DASHBOARD - STYLE ASLI TETAP, JANGAN UBAH =====
export function viewAdminDashboard(stats){
  if(stats===null) stats=null;
  const kec = getActiveKecamatanLive();
  return `
  <div class="admin-page">
    <h2>📊 Admin - `+kec.name+`</h2>
    <div class="admin-stats">
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Total User</b><div id="statTotal">`+(stats?.total??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Aktif</b><div id="statActive">`+(stats?.active??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--muted)"><b>Offline</b><div id="statOffline">`+(stats?.offline??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--danger)"><b>Banned</b><div id="statBanned">`+(stats?.banned??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Driver</b><div id="statDrivers">`+(stats?.drivers??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Penumpang</b><div id="statPassengers">`+(stats?.passengers??'-')+`</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Order Hari Ini</b><div id="statOrders">`+(stats?.ordersToday??'-')+`</div></div>
    </div>
    <div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:140px"><option value="all">Semua</option><option value="active">Aktif</option><option value="online">Online (driver)</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button></div>
    <div class="admin-grid" style="margin-top:12px">
      <div><h3 style="font-size:13px">👥 List User <span class="muted" id="userCount"></span></h3><div id="adminUserList" class="admin-list">Loading...</div></div>
      <div><h3 style="font-size:13px">🚩 Laporan & Detail</h3><div id="adminReportList" class="admin-list">Loading...</div><div id="adminUserDetail" class="card" style="display:none;margin-top:10px"></div></div>
    </div>
  </div>`;
}

// ===== VIEW SETTINGS - STYLE ASLI TETAP, JANGAN UBAH =====
export function viewAdminSettings(settings, profile){
  const s = settings||getAppSettings();
  const p = profile||{};
  const kecOptions = Object.entries(KECAMATAN_DATA).map(function(entry){ return '<option value="'+entry[0]+'" '+(s.activeKecamatanCode===entry[0]?'selected':'')+'>'+entry[1].name+'</option>'; }).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting</h2>
    <div class="card">
      <h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4>
      <label>Kecamatan Aktif
        <select id="setKecamatan" class="input">`+kecOptions+`</select>
      </label>
      <p class="muted" style="font-size:11px;margin-top:6px">Ganti wilayah tanpa edit file.</p>
    </div>
    <div class="card">
      <h4 style="margin:0 0 12px">💰 Setting Tarif</h4>
      <p class="muted" style="font-size:11px;margin:0 0 10px">Tarif live - langsung dipakai hitungTarif(). Kosongkan = pakai default.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:12px">🏍️ Motor - Base Fare</label>
          <input id="setMotorBase" type="number" class="input" value="`+(s.tarifMotorBase||3000)+`" placeholder="3000">
        </div>
        <div>
          <label style="font-size:12px">🏍️ Motor - Per Km</label>
          <input id="setMotorPerKm" type="number" class="input" value="`+(s.tarifMotorPerKm||2500)+`" placeholder="2500">
        </div>
        <div>
          <label style="font-size:12px">🏍️ Motor - Minimal</label>
          <input id="setMotorMin" type="number" class="input" value="`+(s.tarifMotorMin||5000)+`" placeholder="5000">
        </div>
        <div>
          <label style="font-size:12px">🔄 PP Multiplier</label>
          <input id="setPpMultiplier" type="number" step="0.1" class="input" value="`+(s.ppMultiplier||1.6)+`" placeholder="1.6">
        </div>
        <div>
          <label style="font-size:12px">🚗 Mobil - Base Fare</label>
          <input id="setMobilBase" type="number" class="input" value="`+(s.tarifMobilBase||8000)+`" placeholder="8000">
        </div>
        <div>
          <label style="font-size:12px">🚗 Mobil - Per Km</label>
          <input id="setMobilPerKm" type="number" class="input" value="`+(s.tarifMobilPerKm||5500)+`" placeholder="5500">
        </div>
        <div style="grid-column:1 / -1">
          <label style="font-size:12px">🚗 Mobil - Minimal</label>
          <input id="setMobilMin" type="number" class="input" value="`+(s.tarifMobilMin||15000)+`" placeholder="15000">
        </div>
      </div>
      <div class="card" style="margin:12px 0 0;background:var(--card2);border-style:dashed">
        <div style="font-size:11px" class="muted">Preview hitung:</div>
        <div style="font-size:12px;margin-top:4px">Motor 5km = <b id="previewMotor">-</b> | Mobil 5km = <b id="previewMobil">-</b></div>
      </div>
    </div>
    <div class="card">
      <h4 style="margin:0 0 10px">🎨 Tampilan</h4>
      <label>Nama App</label><input id="setAppName" class="input" value="`+(s.appName||'').replace(/"/g,'&quot;')+`">
      <label>Nama Pendek</label><input id="setAppShort" class="input" value="`+(s.appShortName||'').replace(/"/g,'&quot;')+`">
      <div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="`+(s.primaryColor||'#22c55e')+`" class="input" style="height:42px;padding:4px"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="`+(s.secondaryColor||'#f59e0b')+`" class="input" style="height:42px;padding:4px"></div></div>
      <label>Judul Disclaimer</label><input id="setDiscTitle" class="input" value="`+(s.disclaimerTitle||'').replace(/"/g,'&quot;')+`">
      <label>Isi Disclaimer</label><textarea id="setDiscText" class="input" style="min-height:120px">`+(s.disclaimerText||'')+`</textarea>
      <label>Footer</label><input id="setFooter" class="input" value="`+(s.footerText||'').replace(/"/g,'&quot;')+`">
      <div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Semua</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div>
      <div id="settingStatus" class="status"></div>
    </div>
    <div class="card"><h4 style="margin:0 0 8px">👑 Admin</h4><div class="muted" style="font-size:12px">Nama: <b style="color:var(--text)">`+(p?.name||'-')+`</b><br>Email: `+(p?.email||'-')+`<br>Role: `+(p?.role||'-')+`</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Profil</button></div></div>
  </div>`;
}

// ===== RENDERERS - TETAP STYLE ASLI + TAMBAH ONLINE STATUS =====
export function renderUserList(users){
  const el=document.getElementById('adminUserList');
  const cnt=document.getElementById('userCount');
  if(!el) return;
  if(cnt) cnt.textContent='('+users.length+')';
  if(!users.length){ el.innerHTML='<div class="admin-list-item"><span class="muted">Tidak ada user</span></div>'; return; }
  el.innerHTML = users.map(function(u){
    const isBanned = u.banned || u.is_banned || u.status==='banned';
    const isOnline = u._isOnline;
    const badgeClass = isBanned ? 'badge-banned' : u.role==='admin' ? 'badge-admin' : u.role==='driver' ? 'badge-driver' : 'badge-passenger';
    const dotClass = isBanned ? 'err' : (isOnline || ['active','online'].indexOf(u.status)>=0 ? 'ok' : '');
    const icon = u.role==='driver' ? '🏍️' : u.role==='admin' ? '👑' : '👤';
    // FIX MOBILE: box-sizing, width 100%, email truncate, tombol Detail selalu kelihatan di kanan
    return '<div class="admin-list-item" style="flex-direction:column;align-items:stretch;padding:10px 12px;gap:6px;width:100%;box-sizing:border-box;max-width:100%;overflow:hidden">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;width:100%">'
        + '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden">'
          + '<span class="dot '+dotClass+'" '+(dotClass?'':'style="background:var(--muted);flex-shrink:0"')+'></span>'
          + '<span style="font-size:16px;flex-shrink:0">'+icon+'</span>'
          + '<div style="min-width:0;flex:1;overflow:hidden">'
            + '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap">'
              + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:140px">'+(u.name||'Tanpa Nama')+'</span>'
              + '<span class="admin-badge '+badgeClass+'" style="font-size:9px;padding:2px 6px;flex-shrink:0">'+(isBanned?'BANNED':u.role)+'</span>'
              + (isOnline ? '<span style="font-size:9px;color:var(--primary);font-weight:700;flex-shrink:0">● ONLINE</span>' : '')
            + '</div>'
            + '<div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">'+(u.email||u.hp||'-')+'</div>'
          + '</div>'
        + '</div>'
        + '<button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;flex-shrink:0;white-space:nowrap" onclick="adminViewUser(\''+u.id+'\')">Detail</button>'
      + '</div>'
      + ((u.desa||u.warung_name||u._driverLoc) ? '<div class="muted" style="font-size:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;max-width:100%;overflow:hidden">'
        + (u.desa ? '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">'+u.desa+'</span>' : '')
        + (u.warung_name ? '<span style="white-space:nowrap">• '+u.warung_name.slice(0,20)+'</span>' : '')
        + (u._driverLoc ? '<span style="background:var(--card2);padding:2px 6px;border-radius:10px;white-space:nowrap;font-size:9px">📍 '+(new Date(u._driverLoc.updated_at).toLocaleTimeString('id-ID'))+' • '+(u._driverLoc.speed_kmh||0)+'km/h</span>' : '')
      + '</div>' : '')
    + '</div>';
  }).join('');
}


export function renderReports(reports){
  const el=document.getElementById('adminReportList'); if(!el) return;
  if(!reports.length){ el.innerHTML='<div class="admin-list-item"><span class="muted" style="font-size:12px">Belum ada laporan</span></div>'; return; }
  el.innerHTML = reports.map(function(r){
    const col = r.status==='pending' ? 'var(--warning)' : r.status==='banned' || r.status==='resolved' ? 'var(--danger)' : 'var(--primary)';
    const reporterName = r.reporter_name || r.reporter?.name || (r.reporter_id ? r.reporter_id.toString().slice(0,8) : 'Pelapor');
    const reportedName = r.reported_name || r.reported?.name || (r.reported_id ? r.reported_id.toString().slice(0,8) : 'Terlapor');
    const reportedId = r.reported_id || r.reported_google_id || r.reported?.id || '';
    const reporterId = r.reporter_id || '';
    return '<div class="admin-list-item" style="flex-direction:column;align-items:flex-start;border-left:3px solid '+col+';padding:10px 12px;gap:6px">'
      + '<div style="width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px">'
        + '<div style="font-weight:700;font-size:12px;min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🎯 '+reportedName+'</div>'
        + '<span class="admin-badge" style="background:'+col+';color:'+(r.status==='pending'?'#111':'white')+';font-size:9px;flex-shrink:0">'+(r.status||'pending')+'</span>'
      + '</div>'
      + '<div style="font-size:11px;margin-top:2px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>'+(r.reason||'')+'</b> '+(r.description||'').toString().slice(0,60)+'</div>'
      + '<div class="muted" style="font-size:10px;width:100%">Pelapor: '+reporterName+' • '+new Date(r.created_at).toLocaleString('id-ID')+'</div>'
      + '<div class="admin-actions" style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;width:100%">'
        + '<button class="btn primary" style="width:auto;padding:6px 12px;font-size:11px;flex:1" onclick="adminViewReport(\''+r.id+'\')">Detail Laporan</button>'
        + '<button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="adminViewUser(\''+reportedId+'\')">Akun Terlapor</button>'
        + '<button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="adminViewUser(\''+reporterId+'\')">Akun Pelapor</button>'
      + '</div>'
    + '</div>';
  }).join('');
}

// ===== MODAL DETAIL USER - BARU, STYLE ASLI =====
function ensureUserModal(){
  let modal = document.getElementById('adminUserModal');
  if(modal) return modal;
  modal = document.createElement('div');
  modal.id = 'adminUserModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
  modal.innerHTML = '<div id="adminUserModalContent" style="width:100%;max-width:480px;max-width:92vw;max-height:85vh;overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;box-sizing:border-box;word-break:break-word"></div>';
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.style.display='none'; });
  document.body.appendChild(modal);
  return modal;
}

// ===== MODAL DETAIL LAPORAN - BARU, STYLE ASLI =====
function ensureReportModal(){
  let modal = document.getElementById('adminReportModal');
  if(modal) return modal;
  modal = document.createElement('div');
  modal.id = 'adminReportModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
  modal.innerHTML = '<div id="adminReportModalContent" style="width:100%;max-width:480px;max-width:92vw;max-height:85vh;overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;box-sizing:border-box;word-break:break-word"></div>';
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.style.display='none'; });
  document.body.appendChild(modal);
  return modal;
}

// ===== GLOBAL HANDLERS - MODAL DETAIL USER =====
window.adminViewUser = async function(id){
  const modal = ensureUserModal();
  const content = document.getElementById('adminUserModalContent');
  modal.style.display='flex';
  content.innerHTML='<div class="muted" style="padding:20px;text-align:center">Loading...</div>';
  
  const res = await getUserDetail(id);
  if(!res){ content.innerHTML='<div class="muted" style="padding:20px">User tidak ditemukan<br><button class="btn secondary" style="margin-top:10px" onclick="document.getElementById(\'adminUserModal\').style.display=\'none\'">Tutup</button></div>'; return; }
  
  const u = res.user;
  const isB = u.banned || u.is_banned || u.status==='banned';
  const loc = res._driverLoc;
  // FIX: WKB hex 010100... bikin keluar layar, truncate & format speed
  const speedFmt = loc ? (Number(loc.speed_kmh||0).toFixed(1)) : '0';
  const rawLokasi = String(loc?.lokasi||'');
  const isWKB = rawLokasi.startsWith('0101') || rawLokasi.length > 80;
  const lokasiDisplay = isWKB ? (rawLokasi.slice(0,30)+'... [WKB]') : rawLokasi.slice(0,80);
  const locHtml = loc ? '<div class="card" style="background:var(--card2);margin-top:10px;max-width:100%;overflow:hidden;box-sizing:border-box"><div style="font-size:11px" class="muted">📍 driver_locations</div><div style="font-size:11px;margin-top:4px;word-break:break-all;max-width:100%;overflow:hidden">Update: '+new Date(loc.updated_at).toLocaleString('id-ID')+'<br>Heading: '+(loc.heading||'-')+'° • Speed: '+speedFmt+' km/h<br>Lokasi: <span style="word-break:break-all;display:inline-block;max-width:100%">'+lokasiDisplay+'</span></div></div>' : '<div class="muted" style="font-size:11px;margin-top:8px">Tidak ada data driver_locations</div>';
  const ordersHtml = res.orders.length ? res.orders.map(function(o){ return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;display:flex;justify-content:space-between"><span>'+new Date(o.created_at).toLocaleDateString('id-ID')+' • '+o.status+'</span><span>Rp '+(Number(o.total_fare||0).toLocaleString('id-ID'))+'</span></div>'; }).join('') : '<div class="muted" style="font-size:11px">Tidak ada order</div>';
  const banInfo = u.banned_reason ? '<div class="card" style="background:var(--danger);color:white;margin-top:10px;padding:8px;font-size:11px"><b>Alasan Banned:</b> '+u.banned_reason+'</div>' : '';
  
  content.innerHTML = ''
    + '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">👤 Detail User</b><button class="btn secondary" style="width:auto;padding:4px 10px" onclick="document.getElementById(\'adminUserModal\').style.display=\'none\'">✕</button></div>'
    + '<div style="margin-top:12px"><div style="font-weight:800;font-size:16px">'+(u.name||'-')+' <span class="admin-badge '+(isB?'badge-banned':u.role==='admin'?'badge-admin':u.role==='driver'?'badge-driver':'badge-passenger')+'">'+(isB?'BANNED':u.role)+'</span></div>'
    + '<div class="muted" style="font-size:12px;margin-top:6px;line-height:1.6">Email: '+(u.email||'-')+'<br>HP: '+(u.hp||u.phone||'-')+'<br>Role: '+(u.role||'-')+'<br>Desa: '+(u.desa||'-')+' '+(u.warung_name ? '• Warung: '+u.warung_name : '')+'<br>Status: <b style="color:'+(isB?'var(--danger)':'var(--primary)')+'">'+(u.status||'-')+'</b><br>Daftar: '+new Date(u.created_at).toLocaleString('id-ID')+'</div>'
    + '<div class="muted" style="font-size:10px;margin-top:6px;word-break:break-all">ID: '+u.id+'<br>Google ID: '+(u.google_id||'-')+'</div>'
    + banInfo
    + locHtml
    + '</div>'
    + '<div class="row" style="margin-top:14px">'+(isB?'<button class="btn primary" style="flex:1" onclick="adminUnbanUser(\''+u.id+'\');document.getElementById(\'adminUserModal\').style.display=\'none\'">✅ Unban</button>':'<button class="btn secondary" style="flex:1;color:var(--danger)" onclick="adminBanUser(\''+u.id+'\');document.getElementById(\'adminUserModal\').style.display=\'none\'">🚫 Ban</button>')+'<button class="btn secondary" style="flex:1" onclick="window.open(\'https://wa.me/'+(String(u.hp||u.phone||'').replace(/[^0-9]/g,'').replace(/^0/,'62'))+'\',\'_blank\')">💬 WA</button></div>'
    + '<div style="margin-top:14px"><b style="font-size:12px">📦 '+res.orders.length+' Order Terakhir</b><div style="max-height:160px;overflow:auto;margin-top:6px;border:1px solid var(--border);border-radius:8px;padding:6px">'+ordersHtml+'</div></div>'
    + '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn secondary" style="flex:1" onclick="document.getElementById(\'adminUserModal\').style.display=\'none\'">Tutup</button></div>';
};

// ===== GLOBAL HANDLERS - MODAL DETAIL LAPORAN =====
window.adminViewReport = async function(reportId){
  const modal = ensureReportModal();
  const content = document.getElementById('adminReportModalContent');
  modal.style.display='flex';
  content.innerHTML='<div class="muted" style="padding:20px;text-align:center">Loading laporan...</div>';
  
  try{
    let report = null;
    // Coba ambil dari v_reports_detail dulu
    try{
      const { data } = await supabase.from('v_reports_detail').select('*').eq('id', reportId).maybeSingle();
      if(data) report = data;
    }catch(e){}
    if(!report){
      const { data } = await supabase.from('reports').select('*, reporter:reporter_id(name, email, hp, role), reported:reported_id(name, email, hp, role, status, banned)').eq('id', reportId).maybeSingle();
      if(data) report = data;
    }
    if(!report){
      const { data } = await supabase.from('reports').select('*').eq('id', reportId).maybeSingle();
      report = data;
    }
    if(!report){ content.innerHTML='<div class="muted" style="padding:20px">Laporan tidak ditemukan</div>'; return; }
    
    const reporterName = report.reporter_name || report.reporter?.name || 'Pelapor';
    const reporterEmail = report.reporter_email || report.reporter?.email || '-';
    const reporterHp = report.reporter?.hp || '-';
    const reportedName = report.reported_name || report.reported?.name || 'Terlapor';
    const reportedEmail = report.reported_email || report.reported?.email || '-';
    const reportedHp = report.reported?.hp || '-';
    const reportedRole = report.reported?.role || report.reported_role || '-';
    const reportedStatus = report.reported?.status || '-';
    const isReportedBanned = report.reported?.banned || false;
    
    content.innerHTML = ''
      + '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">🚩 Detail Laporan</b><button class="btn secondary" style="width:auto;padding:4px 10px" onclick="document.getElementById(\'adminReportModal\').style.display=\'none\'">✕</button></div>'
      + '<div class="card" style="margin-top:12px;background:var(--card2)"><div style="font-size:11px" class="muted">Status</div><div style="font-weight:700;margin-top:2px"><span class="admin-badge" style="background:'+(report.status==='pending'?'var(--warning)':report.status==='banned'||report.status==='resolved'?'var(--danger)':'var(--primary)')+'">'+(report.status||'pending')+'</span> • '+new Date(report.created_at).toLocaleString('id-ID')+'</div></div>'
      + '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;width:100%;max-width:100%;box-sizing:border-box">'
      + '<div class="card" style="width:100%;max-width:100%;box-sizing:border-box;overflow:hidden"><div style="font-size:11px" class="muted">👤 Pelapor</div><div style="font-weight:700;font-size:13px;margin-top:4px;word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">'+reporterName+'</div><div class="muted" style="font-size:11px;margin-top:4px;word-break:break-all;max-width:100%;overflow:hidden"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">'+reporterEmail+'</div><div>'+reporterHp+'</div></div><button class="btn secondary" style="width:100%;margin-top:8px;padding:6px;font-size:11px;box-sizing:border-box" onclick="adminViewUser(\''+(report.reporter_id||'')+'\');document.getElementById(\'adminReportModal\').style.display=\'none\'">Lihat Pelapor</button></div>'
      + '<div class="card" style="width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;border:1px solid '+(isReportedBanned?'var(--danger)':'var(--border)')+'"><div style="font-size:11px" class="muted">🎯 Terlapor</div><div style="font-weight:700;font-size:13px;margin-top:4px;word-break:break-all;max-width:100%">'+reportedName+' '+(isReportedBanned?'<span class="admin-badge badge-banned">BANNED</span>':'')+'</div><div class="muted" style="font-size:11px;margin-top:4px;word-break:break-all;max-width:100%;overflow:hidden"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">'+reportedEmail+'</div><div>'+reportedHp+'</div><div>Role: '+reportedRole+' • Status: '+reportedStatus+'</div></div><button class="btn secondary" style="width:100%;margin-top:8px;padding:6px;font-size:11px;box-sizing:border-box" onclick="adminViewUser(\''+(report.reported_id||report.reported_google_id||'')+'\');document.getElementById(\'adminReportModal\').style.display=\'none\'">Lihat Terlapor</button></div>'
      + '</div>'
      + '<div class="card" style="margin-top:12px"><div style="font-size:11px" class="muted">Alasan Laporan</div><div style="font-weight:700;margin-top:4px;font-size:13px">'+(report.reason||'-')+'</div>'+(report.description ? '<div style="font-size:12px;margin-top:8px;white-space:pre-wrap;background:var(--card2);padding:8px;border-radius:8px">'+report.description+'</div>' : '')+'</div>'
      + '<div class="muted" style="font-size:10px;margin-top:8px;word-break:break-all">Report ID: '+report.id+'<br>Reporter ID: '+(report.reporter_id||'-')+'<br>Reported ID: '+(report.reported_id||report.reported_google_id||'-')+'</div>'
      + '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box">'
        + '<div class="muted" style="font-size:11px;text-align:center">Status: '+(report.status||'pending')+' • Laporan sudah '+(report.status||'pending')+'</div>'
        + '<div style="display:flex;gap:8px;width:100%">'
          + '<button class="btn secondary" style="flex:1;min-width:0;color:var(--danger);border-color:var(--danger);padding:10px;font-size:12px;box-sizing:border-box" onclick="adminBanFromReport(\''+(report.reported_id||report.reported_google_id||'')+'\',\''+report.id+'\');document.getElementById(\'adminReportModal\').style.display=\'none\'">🔨 Ban Terlapor</button>'
          + '<button class="btn secondary" style="flex:1;min-width:0;padding:10px;font-size:12px;box-sizing:border-box" onclick="adminReviewReport(\''+report.id+'\');document.getElementById(\'adminReportModal\').style.display=\'none\'">✅ Tolak Laporan</button>'
        + '</div>'
        + '<button class="btn secondary" style="width:100%;padding:10px;font-size:12px;box-sizing:border-box" onclick="document.getElementById(\'adminReportModal\').style.display=\'none\'">Tutup</button>'
      + '</div>';
  }catch(e){
    content.innerHTML='<div class="muted" style="padding:20px">Error: '+e.message+'</div>';
  }
};

window.adminBanUser = async function(id){
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan'); if(reason===null) return;
  if(!confirm('Yakin BAN?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

window.adminUnbanUser = async function(id){
  if(!confirm('Yakin UNBAN?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

window.adminBanFromReport = async function(uid, rid){
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{
    let targetId = uid;
    // Coba resolve google_id ke id
    try{
      const { data: u } = await supabase.from('users').select('id').or('google_id.eq.'+uid+',id.eq.'+uid).maybeSingle();
      if(u) targetId = u.id;
    }catch(e){}
    await banUser(targetId, r);
    // Update status laporan
    try{ await supabase.from('reports').update({ status:'banned' }).eq('id', rid); }catch(e){}
    try{ await supabase.from('reports').update({ status:'banned' }).eq('id', rid); }catch(e){}
    for(const tbl of ['reports','user_reports']){
      try{ await supabase.from(tbl).update({ status:'resolved' }).eq('id', rid); }catch(e){}
    }
    alert('User di-ban & laporan selesai'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('Gagal: '+e.message); }
};

window.adminReviewReport = async function(rid){
  if(!confirm('Tandai laporan ditolak?')) return;
  try{
    for(const tbl of ['reports','user_reports']){
      try{ await supabase.from(tbl).update({ status:'reviewed' }).eq('id', rid); }catch(e){}
    }
    await supabase.from('reports').update({ status:'reviewed' }).eq('id', rid);
    const reports=await getReports(); renderReports(reports);
  }catch(e){ alert('Gagal: '+e.message); }
};

// ===== INIT - TETAP SAMA =====
export async function initAdminPage(){
  const stats=await getAdminStats();
  const set=function(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
  const loadUsers = async function(){ const f=document.getElementById('adminFilter')?.value||'all'; const s=document.getElementById('adminSearch')?.value||''; renderUserList(await getUsersList(f,s)); };
  const loadReports = async function(){ renderReports(await getReports()); };
  await Promise.all([loadUsers(), loadReports()]);
  document.getElementById('adminSearch')?.addEventListener('input', function(){ clearTimeout(window._admT); window._admT=setTimeout(loadUsers,300); });
  document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', async function(){
    const st=await getAdminStats(); set('statTotal', st.total); set('statActive', st.active); set('statOffline', st.offline); set('statBanned', st.banned); set('statDrivers', st.drivers); set('statPassengers', st.passengers); set('statOrders', st.ordersToday);
    await Promise.all([loadUsers(), loadReports()]);
  });
}

export async function initAdminSettingsPage(){
  const cur=getAppSettings();
  const calcPreview=function(){
    const getVal=function(id, def){ const el=document.getElementById(id); const v=el?parseFloat(el.value):def; return isNaN(v)?def:v; };
    const mBase=getVal('setMotorBase', cur.tarifMotorBase||3000);
    const mPer=getVal('setMotorPerKm', cur.tarifMotorPerKm||2500);
    const mMin=getVal('setMotorMin', cur.tarifMotorMin||5000);
    const mbBase=getVal('setMobilBase', cur.tarifMobilBase||8000);
    const mbPer=getVal('setMobilPerKm', cur.tarifMobilPerKm||5500);
    const mbMin=getVal('setMobilMin', cur.tarifMobilMin||15000);
    const dist=5;
    let motorCost=mBase + dist*mPer; motorCost=Math.max(motorCost, mMin); motorCost=Math.round(motorCost/500)*500;
    let mobilCost=mbBase + dist*mbPer; mobilCost=Math.max(mobilCost, mbMin); mobilCost=Math.round(mobilCost/500)*500;
    const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
    const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');
  };
  ['setMotorBase','setMotorPerKm','setMotorMin','setMobilBase','setMobilPerKm','setMobilMin','setPpMultiplier'].forEach(function(id){
    document.getElementById(id)?.addEventListener('input', calcPreview);
  });
  calcPreview();
  const btnSave=document.getElementById('btnSaveSettings');
  const btnReset=document.getElementById('btnResetSettings');
  const statusEl=document.getElementById('settingStatus');
  if(btnSave){
    btnSave.onclick=async function(){
      const parseNum=function(id, def){ const el=document.getElementById(id); if(!el) return def; const v=parseFloat(el.value); return isNaN(v)?def:v; };
      const ns=Object.assign({}, cur, {
        activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode,
        appName: document.getElementById('setAppName')?.value || cur.appName,
        appShortName: document.getElementById('setAppShort')?.value || cur.appShortName,
        primaryColor: document.getElementById('setPrimary')?.value || cur.primaryColor,
        secondaryColor: document.getElementById('setSecondary')?.value || cur.secondaryColor,
        disclaimerTitle: document.getElementById('setDiscTitle')?.value || cur.disclaimerTitle,
        disclaimerText: document.getElementById('setDiscText')?.value || cur.disclaimerText,
        footerText: document.getElementById('setFooter')?.value || cur.footerText,
        tarifMotorBase: parseNum('setMotorBase', 3000),
        tarifMotorPerKm: parseNum('setMotorPerKm', 2500),
        tarifMotorMin: parseNum('setMotorMin', 5000),
        tarifMobilBase: parseNum('setMobilBase', 8000),
        tarifMobilPerKm: parseNum('setMobilPerKm', 5500),
        tarifMobilMin: parseNum('setMobilMin', 15000),
        ppMultiplier: parseNum('setPpMultiplier', 1.6),
      });
      if(statusEl) statusEl.textContent='⏳ Menyimpan...';
      btnSave.disabled=true; btnSave.textContent='Menyimpan...';
      try{
        await saveAppSettings(ns);
        if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='var(--primary)'; }
      }catch(e){
        if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='var(--danger)'; }
        btnSave.disabled=false; btnSave.textContent='💾 Simpan Semua';
      }
    };
  }
  if(btnReset){
    btnReset.onclick=function(){ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
  }
  document.getElementById('btnLogout')?.addEventListener('click', async function(){ try{ await supabase.auth.signOut(); }catch(e){} localStorage.clear(); location.href='/'; });
  document.getElementById('btnGoProfile')?.addEventListener('click', function(){ location.hash='#/profile'; });
}


// ===== BANNED GUARD - TAMBAHAN BARU, TIDAK MERUBAH FUNGSI LAIN =====
export function checkIsBanned(profile){
  if(!profile) return false;
  return !!(profile.banned===true || profile.is_banned===true || profile.status==='banned');
}

export function getBannedReason(profile){
  return profile?.banned_reason || 'Akun Anda telah diblokir oleh admin karena pelanggaran kebijakan.';
}

export function viewBannedBlocked(profile){
  const reason = getBannedReason(profile);
  const name = profile?.name || 'User';
  const email = profile?.email || '';
  const bannedAt = profile?.banned_at ? new Date(profile.banned_at).toLocaleString('id-ID') : '-';
  return `
  <div style="position:fixed;inset:0;z-index:999999;background:var(--bg, #0f172a);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
    <div style="width:100%;max-width:400px;background:var(--card);border:2px solid var(--danger);border-radius:20px;padding:24px;text-align:center;box-sizing:border-box">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--danger);color:white;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px">🚫</div>
      <h2 style="margin:0 0 8px;color:var(--danger);font-size:20px">Akun Diblokir</h2>
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">`+name+`</div>
      <div class="muted" style="font-size:12px;margin-bottom:16px">`+email+`</div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:left;margin-bottom:16px;box-sizing:border-box;max-width:100%;overflow:hidden">
        <div style="font-size:11px" class="muted">Alasan Blokir:</div>
        <div style="font-size:13px;font-weight:600;margin-top:4px;word-break:break-word">`+reason+`</div>
        <div style="font-size:10px;margin-top:8px" class="muted">Diblokir pada: `+bannedAt+`</div>
        <div style="font-size:10px;margin-top:4px;word-break:break-all" class="muted">ID: `+(profile?.id||'-')+`</div>
      </div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-bottom:16px">
        <div style="font-size:12px;color:#991b1b;font-weight:600">⛔ Anda tidak diizinkan masuk</div>
        <div style="font-size:11px;color:#7f1d1d;margin-top:4px">Hubungi admin untuk banding atau buat akun baru dengan data valid.</div>
      </div>
      <button id="btnBannedLogout" class="btn secondary" style="width:100%;padding:12px;font-size:14px;box-sizing:border-box">Keluar & Kembali ke Login</button>
      <div style="font-size:10px;margin-top:12px" class="muted">Jika ini kesalahan, hubungi admin via WhatsApp resmi.</div>
    </div>
  </div>`;
}

export function showBannedWarning(profile){
  // Hapus modal lama jika ada
  const old = document.getElementById('bannedBlockedOverlay');
  if(old) old.remove();
  const div = document.createElement('div');
  div.id = 'bannedBlockedOverlay';
  div.innerHTML = viewBannedBlocked(profile);
  document.body.appendChild(div);
  const btn = document.getElementById('btnBannedLogout');
  if(btn){
    btn.onclick = async function(){
      try{ 
        const { supabase } = await import('./supabase.js');
        await supabase.auth.signOut(); 
      }catch(e){}
      localStorage.clear();
      location.hash='#/login';
      location.reload();
    };
  }
  // Blokir scroll & interaksi
  document.body.style.overflow='hidden';
  return div;
}

export async function enforceBannedBlock(profile){
  // Fungsi untuk dipanggil setelah getProfile di app.js / user.js
  // Return true jika diblokir
  if(!checkIsBanned(profile)) return false;
  showBannedWarning(profile);
  // Otomatis logout setelah 5 detik jika tidak klik
  setTimeout(async function(){
    try{
      const { supabase } = await import('./supabase.js');
      await supabase.auth.signOut();
    }catch(e){}
  }, 5000);
  return true;
}

// Helper untuk login guard - cek sebelum masuk home
export async function guardLoginByEmail(email){
  if(!email) return { banned:false };
  try{
    const { supabase } = await import('./supabase.js');
    const { data, error } = await supabase.from('users').select('id, name, email, banned, is_banned, banned_reason, banned_at, status').eq('email', email).maybeSingle();
    if(error) return { banned:false };
    if(!data) return { banned:false };
    if(checkIsBanned(data)){
      return { banned:true, profile:data, reason:getBannedReason(data) };
    }
    return { banned:false };
  }catch(e){
    return { banned:false };
  }
}

export async function guardLoginById(userId){
  if(!userId) return { banned:false };
  try{
    const { supabase } = await import('./supabase.js');
    const { data } = await supabase.from('users').select('id, name, email, banned, is_banned, banned_reason, banned_at, status').eq('id', userId).maybeSingle();
    if(!data) return { banned:false };
    if(checkIsBanned(data)){
      return { banned:true, profile:data };
    }
    return { banned:false };
  }catch(e){ return { banned:false }; }
}


export const viewAdminSetting = viewAdminSettings;
export const viewAdminPanel = viewAdminDashboard;
export const bindAdminEvents = initAdminPage;
