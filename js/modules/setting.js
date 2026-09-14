import Scanner from './scanner.js';
import Printer from './printer.js';
import DB from './db.js';

const SettingModule = {
    render() {
        const currentTheme = localStorage.getItem('edc_theme') || 'dark';
        const currentAccent = localStorage.getItem('edc_accent') || '#2563eb';
        const scannerMode = localStorage.getItem('edc_scanner_mode') || 'camera';
        const printerType = localStorage.getItem('edc_printer_type') || 'bluetooth';
        const dbMode = localStorage.getItem('edc_db_mode') || 'local';
        const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');
        const scannerDeviceType = localStorage.getItem('edc_scanner_device_type') || 'hid_keyboard';
        const scannerTerminator = localStorage.getItem('edc_scanner_terminator') || 'enter';
        const scannerMinLen = localStorage.getItem('edc_scanner_min_len') || '3';
        const scannerBufferTimeout = localStorage.getItem('edc_scanner_buffer_timeout') || '300';
        const scannerBtName = localStorage.getItem('edc_scanner_bt_name') || '';
        const scannerLastTest = localStorage.getItem('edc_scanner_last_test') || '';
        const adminAccount = JSON.parse(localStorage.getItem('edc_admin_account') || '{"username":"admin","pin":"1234"}');
        const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');

        return `
            <div class="setting-section" style="padding-bottom:40px;">
                <div style="text-align:center; margin-bottom:18px;">
                    <div style="font-size:32px;">⚙️</div>
                    <h3 style="color:var(--text-primary); font-size:1.2rem; font-weight:800; margin:4px 0 0 0;">Pengaturan Sistem</h3>
                    <p style="color:var(--text-secondary); font-size:0.78rem; margin-top:4px;">Kelola akun, database, tema, scanner & printer</p>
                </div>

                <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-left:4px solid var(--accent-color, #2563eb); border-radius:16px; padding:16px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <div style="width:36px; height:36px; background:var(--accent-color, #2563eb); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;">👥</div>
                        <div>
                            <h4 style="color:var(--text-primary); margin:0; font-size:0.95rem; font-weight:700;">👥 Akun & Hak Akses</h4>
                            <small style="color:var(--text-secondary); font-size:0.72rem;">Admin & operator kasir</small>
                        </div>
                    </div>
                    <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:12px;">
                        <h5 style="color:var(--text-primary); font-size:0.85rem; margin:0 0 8px 0;">🔐 Admin Utama @${adminAccount.username}</h5>
                        <input type="password" id="input-admin-old-pin" placeholder="🔑 PIN Lama" style="width:100%; padding:10px 12px; margin-bottom:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        <input type="password" id="input-admin-new-pin" placeholder="✨ PIN Baru" style="width:100%; padding:10px 12px; margin-bottom:10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        <button id="btn-update-admin-pin" style="width:100%; background:var(--accent-color, #2563eb); color:white; padding:10px; border-radius:10px; border:none; font-weight:600;">💾 Update PIN Admin</button>
                    </div>

                    <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:12px; padding:12px;">
                        <h5 style="color:var(--text-primary); font-size:0.85rem; margin:0 0 8px 0;">👤 Tambah Operator</h5>
                        <input type="text" id="input-op-name" placeholder="🧑 Nama Operator" style="width:100%; padding:10px 12px; margin-bottom:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        
                        <input type="tel" id="input-op-phone" placeholder="📞 Nomor HP / WhatsApp Operator (cth: 08123456789)" style="width:100%; padding:10px 12px; margin-bottom:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        
                        <input type="password" id="input-op-pin" placeholder="🔒 PIN Operator" style="width:100%; padding:10px 12px; margin-bottom:10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        <button id="btn-add-operator" style="width:100%; background:#10b981; color:white; padding:10px; border-radius:10px; border:none; font-weight:600;">➕ Simpan Operator</button>
                        
                        <div style="margin-top:12px; border-top:1px dashed var(--border-color); padding-top:10px;">
                            <h5 style="color:var(--text-secondary); font-size:0.75rem; margin:0 0 8px 0;">📋 Daftar Operator (${operators.length})</h5>
                            <ul id="list-operators" style="list-style:none; padding:0; margin:0;">
                                ${operators.length === 0 ? '<li style="color:var(--text-secondary); font-size:0.8rem; text-align:center; padding:8px; background:var(--bg-secondary); border-radius:8px;">🤷 Belum ada operator</li>' : ''}
                                ${operators.map(op => `
                                    <li style="display:flex; justify-content:space-between; align-items:center; padding:9px 10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; margin-bottom:6px;">
                                        <span style="color:var(--text-primary); font-size:0.85rem;">👤 <b>${op.name}</b> <small style="color:var(--text-secondary);">(${op.phone || op.noHp || '-'}) [${op.role.toUpperCase()}]</small></span>
                                        <button class="btn-delete-op" data-id="${op.id}" style="color:#ef4444; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.2); padding:4px 10px; border-radius:7px; font-weight:700; font-size:0.7rem;">🗑️ Hapus</button>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:16px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <div style="width:36px; height:36px; background:#10b981; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;">🗄️</div>
                        <div>
                            <h4 style="color:var(--text-primary); margin:0; font-size:0.95rem; font-weight:700;">🗄️ Mode Database</h4>
                            <small style="color:var(--text-secondary); font-size:0.72rem;">Local atau Cloud Firestore</small>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <button id="btn-db-local" class="btn-touch ${dbMode === 'local' ? 'active' : ''}" style="flex:1; padding:11px; background:${dbMode==='local'?'#10b981':'var(--bg-secondary)'}; color:${dbMode==='local'?'white':'var(--text-primary)'}; border:1px solid var(--border-color); border-radius:10px; font-weight:600;">📱 Local</button>
                        <button id="btn-db-cloud" class="btn-touch ${dbMode === 'cloud' ? 'active' : ''}" style="flex:1; padding:11px; background:${dbMode==='cloud'?'#10b981':'var(--bg-secondary)'}; color:${dbMode==='cloud'?'white':'var(--text-primary)'}; border:1px solid var(--border-color); border-radius:10px; font-weight:600;">☁️ Cloud</button>
                    </div>
                    <div id="firestore-config" style="display:${dbMode==='cloud' || config.apiKey ? 'block':'none'}; background:var(--bg-primary); padding:12px; border-radius:12px; border:1px solid var(--border-color);">
                        <h5 style="color:var(--text-primary); font-size:0.8rem; margin:0 0 8px 0;">🔧 Konfigurasi Firebase</h5>
                        <input type="text" id="fb-apiKey" placeholder="🔑 API Key" value="${config.apiKey || ''}" style="width:100%; padding:10px 12px; margin-bottom:8px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        <input type="text" id="fb-projectId" placeholder="🆔 Project ID" value="${config.projectId || ''}" style="width:100%; padding:10px 12px; margin-bottom:10px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary);">
                        <div style="display:flex; gap:8px;">
                            <button id="btn-test-db-config" style="flex:1; background:#0ea5e9; color:white; padding:10px; border-radius:10px; border:none; font-weight:600;">🔍 Tes Koneksi</button>
                            <button id="btn-save-db-config" style="flex:1; background:var(--accent-color, #2563eb); color:white; padding:10px; border-radius:10px; border:none; font-weight:600;">💾 Simpan</button>
                        </div>
                    </div>
                </div>

                <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-left:4px solid #f59e0b; border-radius:16px; padding:16px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <div style="width:36px; height:36px; background:linear-gradient(135deg, #f59e0b, #ec4899); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;">🎨</div>
                        <div>
                            <h4 style="color:var(--text-primary); margin:0; font-size:0.95rem; font-weight:700;">🎨 Tema Aplikasi</h4>
                            <small style="color:var(--text-secondary); font-size:0.72rem;">Tampilan nyaman untuk kasir</small>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; margin-bottom:14px;">
                        <button id="btn-theme-dark" class="btn-touch ${currentTheme === 'dark' ? 'active' : ''}" style="flex:1; padding:12px 6px; background:${currentTheme==='dark'?'#1e293b':'var(--bg-secondary)'}; color:${currentTheme==='dark'?'white':'var(--text-primary)'}; border:2px solid ${currentTheme==='dark'?'var(--accent-color)':'var(--border-color)'}; border-radius:12px; font-weight:600; font-size:0.8rem;">🌙<br>Gelap</button>
                        <button id="btn-theme-light" class="btn-touch ${currentTheme === 'light' ? 'active' : ''}" style="flex:1; padding:12px 6px; background:${currentTheme==='light'?'#ffffff':'var(--bg-secondary)'}; color:${currentTheme==='light'?'#0f172a':'var(--text-primary)'}; border:2px solid ${currentTheme==='light'?'var(--accent-color)':'var(--border-color)'}; border-radius:12px; font-weight:600; font-size:0.8rem;">☀️<br>Terang</button>
                        <button id="btn-theme-auto" class="btn-touch ${currentTheme === 'auto' ? 'active' : ''}" style="flex:1; padding:12px 6px; background:${currentTheme==='auto'?'#f59e0b':'var(--bg-secondary)'}; color:${currentTheme==='auto'?'white':'var(--text-primary)'}; border:2px solid ${currentTheme==='auto'?'#f59e0b':'var(--border-color)'}; border-radius:12px; font-weight:600; font-size:0.8rem;">🔄<br>Auto</button>
                    </div>
                    <div style="background:var(--bg-primary); padding:12px; border-radius:12px; border:1px solid var(--border-color);">
                        <h5 style="margin-bottom:10px; font-size:0.8rem; color:var(--text-primary);">🌈 Warna Aksen</h5>
                        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                            <button class="btn-accent" data-color="#2563eb" style="width:40px; height:40px; border-radius:50%; background:#2563eb; border:3px solid ${currentAccent==='#2563eb'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#2563eb'?'#2563eb':'transparent'};"></button>
                            <button class="btn-accent" data-color="#10b981" style="width:40px; height:40px; border-radius:50%; background:#10b981; border:3px solid ${currentAccent==='#10b981'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#10b981'?'#10b981':'transparent'};"></button>
                            <button class="btn-accent" data-color="#f59e0b" style="width:40px; height:40px; border-radius:50%; background:#f59e0b; border:3px solid ${currentAccent==='#f59e0b'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#f59e0b'?'#f59e0b':'transparent'};"></button>
                            <button class="btn-accent" data-color="#ef4444" style="width:40px; height:40px; border-radius:50%; background:#ef4444; border:3px solid ${currentAccent==='#ef4444'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#ef4444'?'#ef4444':'transparent'};"></button>
                            <button class="btn-accent" data-color="#8b5cf6" style="width:40px; height:40px; border-radius:50%; background:#8b5cf6; border:3px solid ${currentAccent==='#8b5cf6'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#8b5cf6'?'#8b5cf6':'transparent'};"></button>
                            <button class="btn-accent" data-color="#ec4899" style="width:40px; height:40px; border-radius:50%; background:#ec4899; border:3px solid ${currentAccent==='#ec4899'?'var(--bg-card)':'transparent'}; outline:3px solid ${currentAccent==='#ec4899'?'#ec4899':'transparent'};"></button>
                        </div>
                    </div>
                </div>

                <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:16px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <div style="width:36px; height:36px; background:#7c3aed; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;">📷</div>
                        <div>
                            <h4 style="color:var(--text-primary); margin:0; font-size:0.95rem; font-weight:700;">📷 Mode Scanner</h4>
                            <small style="color:var(--text-secondary); font-size:0.72rem;">Kamera HP atau device eksternal</small>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <button id="btn-scanner-camera" style="flex:1; padding:11px; background:${scannerMode==='camera'?'#7c3aed':'var(--bg-secondary)'}; color:${scannerMode==='camera'?'white':'var(--text-primary)'}; border-radius:10px; border:1px solid var(--border-color); font-weight:600;">📱 Kamera HP</button>
                        <button id="btn-scanner-device" style="flex:1; padding:11px; background:${scannerMode==='device'?'#7c3aed':'var(--bg-secondary)'}; color:${scannerMode==='device'?'white':'var(--text-primary)'}; border-radius:10px; border:1px solid var(--border-color); font-weight:600;">🔌 Device</button>
                    </div>
                    <div id="scanner-device-panel" style="display:${scannerMode==='device' ? 'block' : 'none'}; background:var(--bg-primary); padding:12px; border-radius:12px; border:1px solid var(--border-color);">
                        <h5 style="color:var(--text-primary); font-size:0.85rem; margin:0 0 10px 0;">⚙️ Konfigurasi Device</h5>
                        <div id="scanner-connection-status" style="padding:10px; border-radius:10px; margin-bottom:10px; background:var(--bg-secondary); border:1px solid var(--border-color);">
                            <div style="font-size:0.8rem; display:flex; justify-content:space-between; color:var(--text-primary);">
                                <span>📡 Status: <b id="scanner-status-text">${scannerLastTest ? 'Terhubung - ' + scannerLastTest : '⏳ Belum Dites'}</b></span>
                                <span id="scanner-status-dot" style="width:10px; height:10px; border-radius:50%; background:${scannerLastTest ? '#16a34a' : '#d97706'}; display:inline-block;"></span>
                            </div>
                            ${scannerBtName ? `<small style="font-size:0.72rem; color:var(--text-secondary);">🔗 Device: ${scannerBtName} (${scannerDeviceType})</small>` : ''}
                        </div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">🔌 Jenis Koneksi</label>
                        <select id="input-scanner-device-type" style="width:100%; padding:10px; margin:6px 0 10px 0; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:10px;">
                            <option value="hid_keyboard" ${scannerDeviceType==='hid_keyboard' ? 'selected' : ''}>⌨️ HID Keyboard Wedge</option>
                            <option value="bluetooth_ble" ${scannerDeviceType==='bluetooth_ble' ? 'selected' : ''}>🔵 Bluetooth BLE</option>
                            <option value="serial" ${scannerDeviceType==='serial' ? 'selected' : ''}>🔌 USB Serial</option>
                            <option value="usb_hid" ${scannerDeviceType==='usb_hid' ? 'selected' : ''}>🎮 USB HID Raw</option>
                        </select>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:0.7rem; color:var(--text-secondary);">⌨️ Terminator</label>
                                <select id="input-scanner-terminator" style="width:100%; padding:9px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:10px;">
                                    <option value="enter" ${scannerTerminator==='enter' ? 'selected' : ''}>Enter</option>
                                    <option value="tab" ${scannerTerminator==='tab' ? 'selected' : ''}>Tab</option>
                                    <option value="none" ${scannerTerminator==='none' ? 'selected' : ''}>None</option>
                                    <option value="enter_tab" ${scannerTerminator==='enter_tab' ? 'selected' : ''}>Enter+Tab</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.7rem; color:var(--text-secondary);">🔢 Min Length</label>
                                <input type="number" id="input-scanner-minlen" value="${scannerMinLen}" style="width:100%; padding:9px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:10px;">
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:0.7rem; color:var(--text-secondary);">⏱️ Timeout: <span id="timeout-value" style="color:var(--accent-color); font-weight:700;">${scannerBufferTimeout}ms</span></label>
                            <input type="range" id="input-scanner-timeout" min="50" max="1000" step="50" value="${scannerBufferTimeout}" style="width:100%;">
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:10px;">
                            <button id="btn-connect-bt" style="background:#2563eb; color:white; padding:9px 4px; border-radius:10px; border:none; font-size:0.7rem; font-weight:600;">🔵 BLE</button>
                            <button id="btn-connect-serial" style="background:#7c3aed; color:white; padding:9px 4px; border-radius:10px; border:none; font-size:0.7rem; font-weight:600;">🔌 Serial</button>
                            <button id="btn-connect-hid" style="background:#059669; color:white; padding:9px 4px; border-radius:10px; border:none; font-size:0.7rem; font-weight:600;">🎮 HID</button>
                        </div>
                        <div style="display:flex; gap:8px; margin-bottom:10px;">
                            <button id="btn-test-scanner" style="flex:1; background:#f59e0b; color:white; padding:9px; border-radius:10px; border:none; font-weight:600;">🧪 Test Scan</button>
                            <button id="btn-clear-scanner-log" style="flex:1; background:var(--bg-secondary); color:var(--text-primary); padding:9px; border-radius:10px; border:1px solid var(--border-color);">🗑️ Clear</button>
                        </div>
                        <div id="scanner-test-log" style="background:#0f172a; color:#a5f3fc; padding:10px; border-radius:10px; max-height:120px; overflow-y:auto; font-family:monospace; font-size:0.7rem;">📝 Belum ada data scan...</div>
                    </div>
                </div>

                <div class="setting-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:16px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                        <div style="width:36px; height:36px; background:linear-gradient(135deg, #f59e0b, #ef4444); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;">🖨️</div>
                        <div>
                            <h4 style="color:var(--text-primary); margin:0; font-size:0.95rem; font-weight:700;">🖨️ Pengaturan Printer</h4>
                            <small style="color:var(--text-secondary); font-size:0.72rem;">Thermal / Bluetooth / USB / Serial</small>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <button id="btn-printer-bt" class="btn-touch ${printerType === 'bluetooth' ? 'active' : ''}" style="flex:1; padding:10px; background:${printerType==='bluetooth'?'#f59e0b':'var(--bg-secondary)'}; color:${printerType==='bluetooth'?'white':'var(--text-primary)'}; border-radius:10px; border:1px solid var(--border-color); font-weight:600;">📱 Bluetooth</button>
                        <button id="btn-printer-usb" class="btn-touch ${printerType === 'usb' ? 'active' : ''}" style="flex:1; padding:10px; background:${printerType==='usb'?'#f59e0b':'var(--bg-secondary)'}; color:${printerType==='usb'?'white':'var(--text-primary)'}; border-radius:10px; border:1px solid var(--border-color); font-weight:600;">🔌 USB</button>
                        <button id="btn-printer-serial" class="btn-touch ${printerType === 'serial' ? 'active' : ''}" style="flex:1; padding:10px; background:${printerType==='serial'?'#f59e0b':'var(--bg-secondary)'}; color:${printerType==='serial'?'white':'var(--text-primary)'}; border-radius:10px; border:1px solid var(--border-color); font-weight:600;">🔗 Serial</button>
                    </div>
                    <button id="btn-connect-printer" style="width:100%; background:linear-gradient(135deg, #f59e0b, #d97706); color:white; padding:11px; border-radius:10px; border:none; font-weight:700;">🔗 Hubungkan Printer</button>
                </div>
            </div>
        `;
    },

    init() {
        document.getElementById('btn-update-admin-pin')?.addEventListener('click', () => {
            const oldPin = document.getElementById('input-admin-old-pin').value.trim();
            const newPin = document.getElementById('input-admin-new-pin').value.trim();
            const adminAccount = JSON.parse(localStorage.getItem('edc_admin_account') || '{"username":"admin","pin":"1234"}');
            if (!oldPin || !newPin) { alert('Isi PIN Lama dan Baru!'); return; }
            if (oldPin !== adminAccount.pin) { alert('PIN Lama salah!'); return; }
            adminAccount.pin = newPin;
            localStorage.setItem('edc_admin_account', JSON.stringify(adminAccount));
            alert('PIN Admin berhasil diupdate!');
            document.getElementById('input-admin-old-pin').value = '';
            document.getElementById('input-admin-new-pin').value = '';
        });

        document.getElementById('btn-add-operator')?.addEventListener('click', () => {
            const name = document.getElementById('input-op-name').value.trim();
            const phone = document.getElementById('input-op-phone').value.trim();
            const pin = document.getElementById('input-op-pin').value.trim();
            if (!name || !pin) { alert('Nama dan PIN wajib diisi!'); return; }
            const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
            operators.push({ id: 'op_' + Date.now(), name, phone: phone || '-', noHp: phone || '-', pin, role: 'operator' });
            localStorage.setItem('edc_operators', JSON.stringify(operators));
            alert('Operator berhasil ditambahkan!');
            if (window.app) window.app.loadModule('setting');
        });

        document.querySelectorAll('.btn-delete-op').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                if (confirm('Hapus operator ini?')) {
                    let operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
                    operators = operators.filter(o => o.id !== id);
                    localStorage.setItem('edc_operators', JSON.stringify(operators));
                    if (window.app) window.app.loadModule('setting');
                }
            });
        });

        document.getElementById('btn-db-local')?.addEventListener('click', () => {
            DB.setMode('local');
            if (window.app) window.app.loadModule('setting');
        });

        document.getElementById('btn-db-cloud')?.addEventListener('click', () => {
            const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');
            if (!config.apiKey || !config.projectId) {
                const configForm = document.getElementById('firestore-config');
                if (configForm) configForm.style.display = 'block';
                alert('Silakan isi API Key dan Project ID terlebih dahulu.');
            } else {
                DB.setMode('cloud');
                if (window.app) window.app.loadModule('setting');
            }
        });

        document.getElementById('btn-test-db-config')?.addEventListener('click', async () => {
            const apiKey = document.getElementById('fb-apiKey').value.trim();
            const projectId = document.getElementById('fb-projectId').value.trim();
            if (!apiKey || !projectId) { alert('Isi API Key dan Project ID terlebih dahulu!'); return; }
            const btnTest = document.getElementById('btn-test-db-config');
            btnTest.textContent = 'Menghubungkan...'; btnTest.disabled = true;
            try {
                const { initializeApp, deleteApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
                const { getFirestore, collection, getDocs, limit, query } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const tempApp = initializeApp({ apiKey, projectId, authDomain: `${projectId}.firebaseapp.com` }, 'testAppInstance_' + Date.now());
                const tempFs = getFirestore(tempApp);
                const q = query(collection(tempFs, 'products'), limit(1));
                await getDocs(q);
                alert('Koneksi Firebase Berhasil!'); await deleteApp(tempApp);
            } catch (err) { console.error('[Firebase Test Error]:', err); alert(`Gagal Terhubung ke Firebase!\n\nError:\n${err.message}`); }
            finally { btnTest.textContent = 'Tes Koneksi'; btnTest.disabled = false; }
        });

        document.getElementById('btn-save-db-config')?.addEventListener('click', () => {
            const apiKey = document.getElementById('fb-apiKey').value.trim();
            const projectId = document.getElementById('fb-projectId').value.trim();
            if (!apiKey || !projectId) { alert('API Key dan Project ID Firebase wajib diisi!'); return; }
            const config = { apiKey, projectId };
            DB.setMode('cloud', config);
            alert('Pengaturan Cloud Firestore Berhasil Disimpan!');
            if (window.app) window.app.loadModule('setting');
        });

        document.getElementById('btn-scanner-camera')?.addEventListener('click', () => {
            Scanner.setMode('camera');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-scanner-device')?.addEventListener('click', () => {
            Scanner.setMode('device');
            if (window.app) window.app.loadModule('setting');
        });

        this.initScannerDeviceHandlers();

        document.getElementById('btn-printer-bt')?.addEventListener('click', () => {
            Printer.setType('bluetooth');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-printer-usb')?.addEventListener('click', () => {
            Printer.setType('usb');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-printer-serial')?.addEventListener('click', () => {
            Printer.setType('serial');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-connect-printer')?.addEventListener('click', () => { Printer.connect(); });
    },

    initScannerDeviceHandlers() {
        const renderLog = () => {
            const logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
            const logEl = document.getElementById('scanner-test-log');
            if (!logEl) return;
            if (logs.length === 0) {
                logEl.innerHTML = '<div style="color:#6b7280;">Belum ada data scan. Tekan Test Scan lalu scan barcode...</div>';
                return;
            }
            logEl.innerHTML = logs.map(l => `
                <div style="padding:3px 0; border-bottom:1px dashed #4338ca; display:flex; justify-content:space-between;">
                    <span style="color:#fbbf24;">[${l.time}]</span>
                    <span style="color:#86efac; font-weight:bold;">${l.code}</span>
                    <span style="color:#93c5fd;">${l.type || 'HID'}</span>
                </div>
            `).join('');
        };
        renderLog();

        const updateStatus = (text, ok) => {
            const statusText = document.getElementById('scanner-status-text');
            const dot = document.getElementById('scanner-status-dot');
            const container = document.getElementById('scanner-connection-status');
            if (statusText) statusText.textContent = text;
            if (dot) dot.style.background = ok ? '#16a34a' : '#d97706';
            if (container) {
                container.style.background = ok ? '#dcfce7' : '#fef3c7';
                container.style.borderColor = ok ? '#86efac' : '#fde68a';
            }
            localStorage.setItem('edc_scanner_last_test', text);
        };

        document.getElementById('input-scanner-device-type')?.addEventListener('change', (e) => {
            localStorage.setItem('edc_scanner_device_type', e.target.value);
            Scanner.setDeviceType(e.target.value);
            updateStatus(`Config diubah ke ${e.target.value}`, false);
        });

        document.getElementById('input-scanner-terminator')?.addEventListener('change', (e) => {
            localStorage.setItem('edc_scanner_terminator', e.target.value);
        });

        document.getElementById('input-scanner-minlen')?.addEventListener('change', (e) => {
            localStorage.setItem('edc_scanner_min_len', e.target.value);
        });

        document.getElementById('input-scanner-timeout')?.addEventListener('input', (e) => {
            localStorage.setItem('edc_scanner_buffer_timeout', e.target.value);
            const tv = document.getElementById('timeout-value');
            if (tv) tv.textContent = e.target.value + 'ms';
        });

        document.getElementById('btn-connect-bt')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-connect-bt');
            const orig = btn.textContent;
            btn.textContent = '⏳ Mencari...'; btn.disabled = true;
            try {
                const result = await Scanner.connectBluetooth();
                if (result.success) {
                    localStorage.setItem('edc_scanner_bt_name', result.name || 'BLE Scanner');
                    localStorage.setItem('edc_scanner_device_type', 'bluetooth_ble');
                    updateStatus(`Terhubung BLE: ${result.name}`, true);
                    alert(`Berhasil terhubung ke ${result.name}`);
                    if (window.app) window.app.loadModule('setting');
                } else {
                    updateStatus(`Gagal BLE: ${result.error}`, false);
                    alert('Gagal konek Bluetooth: ' + result.error);
                }
            } catch (err) {
                updateStatus(`Error BLE: ${err.message}`, false);
                alert('Error Bluetooth: ' + err.message + '\nPastikan pakai Chrome/Edge dan HTTPS.');
            } finally {
                btn.textContent = orig; btn.disabled = false;
            }
        });

        document.getElementById('btn-connect-serial')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-connect-serial');
            const orig = btn.textContent;
            btn.textContent = '⏳ Mencari...'; btn.disabled = true;
            try {
                const result = await Scanner.connectSerial();
                if (result.success) {
                    updateStatus(`Terhubung Serial: ${result.name}`, true);
                    alert(`Serial terhubung: ${result.name}`);
                } else {
                    updateStatus(`Gagal Serial: ${result.error}`, false);
                    alert('Gagal Serial: ' + result.error);
                }
            } catch (err) {
                alert('Error Serial: ' + err.message);
            } finally {
                btn.textContent = orig; btn.disabled = false;
            }
        });

        document.getElementById('btn-connect-hid')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-connect-hid');
            const orig = btn.textContent;
            btn.textContent = '⏳ Mencari...'; btn.disabled = true;
            try {
                const result = await Scanner.connectHID();
                if (result.success) {
                    updateStatus(`Terhubung HID: ${result.name}`, true);
                    alert(`HID terhubung: ${result.name}`);
                } else {
                    updateStatus(`Gagal HID: ${result.error}`, false);
                    alert('Gagal HID: ' + result.error);
                }
            } catch (err) {
                alert('Error HID: ' + err.message);
            } finally {
                btn.textContent = orig; btn.disabled = false;
            }
        });

        let testModeActive = false;
        let testHandler = null;

        document.getElementById('btn-test-scanner')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-test-scanner');
            if (testModeActive) {
                testModeActive = false;
                btn.textContent = '🧪 Test Scan';
                btn.style.background = '#7c3aed';
                if (testHandler) window.removeEventListener('keydown', testHandler);
                updateStatus('Test dihentikan', false);
                return;
            }

            testModeActive = true;
            btn.textContent = '⏹️ Stop Test (Scan Sekarang)';
            btn.style.background = '#ef4444';
            updateStatus('Mode TEST AKTIF - Silakan scan barcode...', true);

            let buffer = "";
            let timer = null;
            const minLen = parseInt(localStorage.getItem('edc_scanner_min_len') || '3');
            const timeout = parseInt(localStorage.getItem('edc_scanner_buffer_timeout') || '300');

            testHandler = (e) => {
                if (e.target.tagName === 'INPUT' && e.target.id !== 'input-manual-barcode') return;
                if (e.key === 'Enter') {
                    if (buffer.length >= minLen) {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString('id-ID');
                        const logEntry = { time: timeStr, code: buffer, type: 'HID-TEST' };
                        
                        let logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
                        logs.unshift(logEntry);
                        if (logs.length > 10) logs = logs.slice(0, 10);
                        localStorage.setItem('edc_scanner_test_log', JSON.stringify(logs));
                        renderLog();

                        updateStatus(`Scan OK: ${buffer} (${timeStr})`, true);
                        if (navigator.vibrate) navigator.vibrate(100);
                    }
                    buffer = "";
                } else if (e.key.length === 1) {
                    buffer += e.key;
                    clearTimeout(timer);
                    timer = setTimeout(() => buffer = "", timeout);
                }
            };

            window.addEventListener('keydown', testHandler);

            Scanner.setTestCallback((code, type) => {
                const now = new Date();
                const timeStr = now.toLocaleTimeString('id-ID');
                let logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
                logs.unshift({ time: timeStr, code, type });
                if (logs.length > 10) logs = logs.slice(0, 10);
                localStorage.setItem('edc_scanner_test_log', JSON.stringify(logs));
                renderLog();
                updateStatus(`Scan OK [${type}]: ${code}`, true);
                if (navigator.vibrate) navigator.vibrate([100,50,100]);
            });
        });

        document.getElementById('btn-disconnect-scanner')?.addEventListener('click', async () => {
            if (confirm('Putuskan koneksi scanner?')) {
                await Scanner.disconnectAll();
                localStorage.removeItem('edc_scanner_bt_name');
                localStorage.removeItem('edc_scanner_last_test');
                updateStatus('Disconnected - Belum Dites', false);
                alert('Scanner disconnected');
                if (window.app) window.app.loadModule('setting');
            }
        });

        document.getElementById('btn-clear-scanner-log')?.addEventListener('click', () => {
            localStorage.removeItem('edc_scanner_test_log');
            renderLog();
        });

        document.getElementById('btn-simulate-scan')?.addEventListener('click', () => {
            const input = document.getElementById('input-manual-barcode');
            const code = input.value.trim();
            if (!code) return;
            const minLen = parseInt(localStorage.getItem('edc_scanner_min_len') || '3');
            if (code.length < minLen) { alert(`Minimal ${minLen} karakter`); return; }
            
            const now = new Date();
            const timeStr = now.toLocaleTimeString('id-ID');
            let logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
            logs.unshift({ time: timeStr, code, type: 'MANUAL' });
            if (logs.length > 10) logs = logs.slice(0, 10);
            localStorage.setItem('edc_scanner_test_log', JSON.stringify(logs));
            renderLog();
            updateStatus(`Simulasi OK: ${code}`, true);
            
            Scanner.handleDecodedText(code);
            input.value = '';
        });

        const applyTheme = (theme) => {
            const body = document.body;
            const html = document.documentElement;
            body.classList.remove('theme-dark','theme-light');
            html.style.colorScheme = theme === 'light' ? 'light' : 'dark';
            
            if (theme === 'auto') {
                const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
                body.classList.add(prefersLight ? 'theme-light' : 'theme-dark');
                body.setAttribute('data-theme','auto');
                html.style.colorScheme = prefersLight ? 'light' : 'dark';
            } else {
                body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
                body.setAttribute('data-theme', theme);
            }
            const metaTheme = document.querySelector('meta[name="theme-color"]');
            if (metaTheme) {
                const isLightNow = body.classList.contains('theme-light');
                metaTheme.content = isLightNow ? '#ffffff' : '#0f172a';
            }
        };

        const applyAccent = (color) => {
            document.documentElement.style.setProperty('--accent-color', color, 'important');
            document.documentElement.style.setProperty('--accent-hover', color, 'important');
            document.body.style.setProperty('--accent-color', color, 'important');
            document.body.style.setProperty('--accent-hover', color, 'important');
            localStorage.setItem('edc_accent', color);
        };

        document.getElementById('btn-theme-dark')?.addEventListener('click', () => {
            localStorage.setItem('edc_theme','dark');
            applyTheme('dark');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-theme-light')?.addEventListener('click', () => {
            localStorage.setItem('edc_theme','light');
            applyTheme('light');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-theme-auto')?.addEventListener('click', () => {
            localStorage.setItem('edc_theme','auto');
            applyTheme('auto');
            if (window.app) window.app.loadModule('setting');
        });

        document.querySelectorAll('.btn-accent').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                applyAccent(color);
                document.querySelectorAll('.btn-accent').forEach(b => {
                    b.style.border = '3px solid transparent';
                    b.style.outline = '2px solid transparent';
                });
                btn.style.border = '3px solid white';
                btn.style.outline = `2px solid ${color}`;
            });
        });

        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if ((localStorage.getItem('edc_theme') || 'dark') === 'auto') {
                applyTheme('auto');
            }
        });

        document.getElementById('input-manual-barcode')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-simulate-scan').click();
            }
        });
    }
};

export default SettingModule;