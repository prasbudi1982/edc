import Scanner from './scanner.js';
import Printer from './printer.js';
import DB from './db.js';

const SettingModule = {
    render() {
        const scannerMode = localStorage.getItem('edc_scanner_mode') || 'camera';
        const printerType = localStorage.getItem('edc_printer_type') || 'bluetooth';
        const dbMode = localStorage.getItem('edc_db_mode') || 'local';
        const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');

        // Scanner Device Config Baru
        const scannerDeviceType = localStorage.getItem('edc_scanner_device_type') || 'hid_keyboard'; // hid_keyboard | bluetooth_ble | serial | usb_hid
        const scannerTerminator = localStorage.getItem('edc_scanner_terminator') || 'enter';
        const scannerMinLen = localStorage.getItem('edc_scanner_min_len') || '3';
        const scannerBufferTimeout = localStorage.getItem('edc_scanner_buffer_timeout') || '300';
        const scannerBtName = localStorage.getItem('edc_scanner_bt_name') || '';
        const scannerLastTest = localStorage.getItem('edc_scanner_last_test') || '';

        // Load Admin & Operator List
        const adminAccount = JSON.parse(localStorage.getItem('edc_admin_account') || '{"username":"admin","pin":"1234"}');
        const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');

        return `
            <div class="setting-section" style="padding-bottom: 30px;">
                <h3>Pengaturan Sistem</h3>

                <!-- PENGELOLAAN HAK AKSES & AKUN (ADMIN & OPERATOR) -->
                <div class="setting-card" style="border-left: 4px solid #2563eb;">
                    <h4>Pengelolaan Akun & Hak Akses</h4>
                    
                    <div style="background: #eff6ff; padding: 10px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #bfdbfe;">
                        <h5 style="margin-bottom: 6px; color: #1e3a8a;">Pengaturan Akun Admin Utama</h5>
                        <small style="display:block; color:#475569; margin-bottom:6px;">Username: <b>${adminAccount.username}</b></small>
                        <input type="password" id="input-admin-old-pin" class="form-control" placeholder="PIN Lama Admin" style="margin-bottom:6px; width:100%; padding:6px;">
                        <input type="password" id="input-admin-new-pin" class="form-control" placeholder="PIN Baru Admin" style="margin-bottom:6px; width:100%; padding:6px;">
                        <button class="btn-touch" id="btn-update-admin-pin" style="width:100%; background: #0284c7; color:white; padding:8px;">Update PIN Admin</button>
                    </div>
                    <div style="margin-top: 12px;">
                        <h5 style="margin-bottom: 6px;">Tambah Operator / Kasir Baru</h5>
                        <input type="text" id="input-op-name" class="form-control" placeholder="Nama Kasir / Operator" style="margin-bottom:6px; width:100%; padding:6px;">
                        <input type="password" id="input-op-pin" class="form-control" placeholder="PIN / Password Operator" style="margin-bottom:6px; width:100%; padding:6px;">
                        <button class="btn-touch" id="btn-add-operator" style="width:100%; background: #10b981; color:white; padding:8px;">+ Simpan Operator</button>
                    </div>
                    <div style="margin-top: 12px;">
                        <h5 style="margin-bottom: 6px;">Daftar Operator Terdaftar</h5>
                        <ul style="list-style:none; padding:0; font-size:0.85rem;" id="list-operators">
                            ${operators.length === 0 ? '<li style="color:#94a3b8;">Belum ada operator tambahan.</li>' : ''}
                            ${operators.map(op => `
                                <li style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #e2e8f0;">
                                    <span>👤 <b>${op.name}</b> (Role: ${op.role.toUpperCase()})</span>
                                    <button class="btn-delete-op" data-id="${op.id}" style="color:#ef4444; background:none; border:none; cursor:pointer; font-weight:bold;">Hapus</button>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>

                <!-- SETTING DATABASE -->
                <div class="setting-card">
                    <h4>Mode Database</h4>
                    <div class="btn-group" style="display:flex; gap:8px; margin-bottom:10px;">
                        <button id="btn-db-local" class="btn-touch ${dbMode === 'local' ? 'active' : ''}" style="flex:1; padding:8px; background:${dbMode==='local'?'#10b981':'#e2e8f0'}; color:${dbMode==='local'?'white':'#334155'};">📱 Local (IndexedDB)</button>
                        <button id="btn-db-cloud" class="btn-touch ${dbMode === 'cloud' ? 'active' : ''}" style="flex:1; padding:8px; background:${dbMode==='cloud'?'#10b981':'#e2e8f0'}; color:${dbMode==='cloud'?'white':'#334155'};">☁️ Cloud (Firestore)</button>
                    </div>
                    <div id="firestore-config" style="display:${dbMode==='cloud' || config.apiKey ? 'block':'none'}; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                        <h5 style="margin-bottom:6px;">Konfigurasi Firebase</h5>
                        <input type="text" id="fb-apiKey" class="form-control" placeholder="API Key" value="${config.apiKey || ''}" style="margin-bottom:6px; width:100%; padding:6px;">
                        <input type="text" id="fb-projectId" class="form-control" placeholder="Project ID" value="${config.projectId || ''}" style="margin-bottom:6px; width:100%; padding:6px;">
                        <div style="display:flex; gap:6px;">
                            <button id="btn-test-db-config" class="btn-touch" style="flex:1; background:#0ea5e9; color:white; padding:6px;">Tes Koneksi</button>
                            <button id="btn-save-db-config" class="btn-touch" style="flex:1; background:#2563eb; color:white; padding:6px;">Simpan Config</button>
                        </div>
                    </div>
                </div>

                <!-- SETTING SCANNER - BARU LENGKAP -->
                <div class="setting-card" style="border-left: 4px solid #7c3aed;">
                    <h4>📷 Mode Scanner</h4>
                    <div class="btn-group" style="display:flex; gap:8px; margin-bottom:12px;">
                        <button id="btn-scanner-camera" class="btn-touch ${scannerMode === 'camera' ? 'active' : ''}" style="flex:1; padding:8px; background:${scannerMode==='camera'?'#7c3aed':'#e2e8f0'}; color:${scannerMode==='camera'?'white':'#334155'};">📷 Kamera HP</button>
                        <button id="btn-scanner-device" class="btn-touch ${scannerMode === 'device' ? 'active' : ''}" style="flex:1; padding:8px; background:${scannerMode==='device'?'#7c3aed':'#e2e8f0'}; color:${scannerMode==='device'?'white':'#334155'};">🔌 Device Scanner</button>
                    </div>

                    <!-- PANEL KONFIGURASI DEVICE SCANNER -->
                    <div id="scanner-device-panel" style="display:${scannerMode==='device' ? 'block' : 'none'}; background:#faf5ff; padding:12px; border-radius:8px; border:1px solid #ddd6fe;">
                        
                        <h5 style="margin-bottom:8px; color:#5b21b6;">⚙️ Konfigurasi Device Scanner</h5>
                        
                        <!-- STATUS KONEKSI -->
                        <div id="scanner-connection-status" style="padding:8px; border-radius:6px; margin-bottom:10px; background:${scannerLastTest ? '#dcfce7' : '#fef3c7'}; border:1px solid ${scannerLastTest ? '#86efac' : '#fde68a'};">
                            <div style="font-size:0.8rem; display:flex; justify-content:space-between;">
                                <span>📡 Status: <b id="scanner-status-text">${scannerLastTest ? 'Terhubung - ' + scannerLastTest : 'Belum Dites'}</b></span>
                                <span id="scanner-status-dot" style="width:10px; height:10px; border-radius:50%; background:${scannerLastTest ? '#16a34a' : '#d97706'}; display:inline-block;"></span>
                            </div>
                            ${scannerBtName ? `<small style="font-size:0.75rem; color:#6b7280;">Device: ${scannerBtName} (${scannerDeviceType})</small>` : ''}
                        </div>

                        <!-- JENIS KONEKSI -->
                        <label style="font-size:0.8rem; font-weight:bold; color:#4c1d95;">Jenis Koneksi Device</label>
                        <select id="input-scanner-device-type" class="form-control" style="width:100%; padding:6px; margin-bottom:10px; margin-top:4px;">
                            <option value="hid_keyboard" ${scannerDeviceType==='hid_keyboard' ? 'selected' : ''}>⌨️ HID Keyboard Wedge (Kabel USB / Bluetooth Keyboard Mode) - Default</option>
                            <option value="bluetooth_ble" ${scannerDeviceType==='bluetooth_ble' ? 'selected' : ''}>🔵 Bluetooth BLE (Web Bluetooth API)</option>
                            <option value="serial" ${scannerDeviceType==='serial' ? 'selected' : ''}>🔌 USB Serial / COM Port (Web Serial API)</option>
                            <option value="usb_hid" ${scannerDeviceType==='usb_hid' ? 'selected' : ''}>🎮 USB HID Raw (Web HID API)</option>
                        </select>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:0.75rem; font-weight:bold;">Terminator Key</label>
                                <select id="input-scanner-terminator" class="form-control" style="width:100%; padding:6px;">
                                    <option value="enter" ${scannerTerminator==='enter' ? 'selected' : ''}>Enter (\\r\\n)</option>
                                    <option value="tab" ${scannerTerminator==='tab' ? 'selected' : ''}>Tab (\\t)</option>
                                    <option value="none" ${scannerTerminator==='none' ? 'selected' : ''}>None (Tanpa Akhiran)</option>
                                    <option value="enter_tab" ${scannerTerminator==='enter_tab' ? 'selected' : ''}>Enter + Tab</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.75rem; font-weight:bold;">Min. Panjang Barcode</label>
                                <input type="number" id="input-scanner-minlen" class="form-control" value="${scannerMinLen}" min="1" max="20" style="width:100%; padding:6px;">
                            </div>
                        </div>

                        <div style="margin-bottom:12px;">
                            <label style="font-size:0.75rem; font-weight:bold;">Buffer Timeout (ms) - Jeda reset buffer keyboard</label>
                            <input type="range" id="input-scanner-timeout" min="100" max="1000" step="50" value="${scannerBufferTimeout}" style="width:100%;">
                            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#6b7280;">
                                <span>100ms (Cepat)</span><span id="timeout-value">${scannerBufferTimeout}ms</span><span>1000ms (Lambat)</span>
                            </div>
                        </div>

                        <!-- BUTTON TEST KONEKSI -->
                        <div style="background:white; padding:10px; border-radius:6px; border:1px solid #e9d5ff; margin-bottom:10px;">
                            <h6 style="margin-bottom:8px; font-size:0.85rem;">🧪 Test Koneksi & Pairing</h6>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
                                <button id="btn-connect-bt" class="btn-touch" style="background:#3b82f6; color:white; padding:8px; font-size:0.8rem;">🔵 Pair Bluetooth</button>
                                <button id="btn-connect-serial" class="btn-touch" style="background:#6366f1; color:white; padding:8px; font-size:0.8rem;">🔌 Connect Serial</button>
                                <button id="btn-connect-hid" class="btn-touch" style="background:#8b5cf6; color:white; padding:8px; font-size:0.8rem;">🎮 Connect HID</button>
                                <button id="btn-test-scanner" class="btn-touch active" style="background:#7c3aed; color:white; padding:8px; font-size:0.8rem;">🧪 Test Scan</button>
                            </div>
                            <button id="btn-disconnect-scanner" class="btn-touch" style="width:100%; background:#f1f5f9; color:#475569; padding:6px; font-size:0.8rem; border:1px solid #cbd5e1;">❌ Disconnect / Reset</button>
                        </div>

                        <!-- LOG HASIL SCAN TEST -->
                        <div style="background:#1e1b4b; color:#a5b4fc; padding:10px; border-radius:6px; font-family:monospace; font-size:0.75rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span>📋 Log Test Scan (10 terakhir)</span>
                                <button id="btn-clear-scanner-log" style="background:none; border:none; color:#fbbf24; cursor:pointer; font-size:0.7rem;">Clear</button>
                            </div>
                            <div id="scanner-test-log" style="max-height:120px; overflow-y:auto; background:#312e81; padding:6px; border-radius:4px; min-height:60px;">
                                <div style="color:#6b7280;">Belum ada data scan. Tekan 'Test Scan' lalu scan barcode...</div>
                            </div>
                            <div style="margin-top:8px; display:flex; gap:6px;">
                                <input type="text" id="input-manual-barcode" class="form-control" placeholder="Atau ketik manual barcode untuk simulasi" style="flex:1; padding:4px; font-size:0.75rem; background:#1e1b4b; color:white; border:1px solid #4338ca;">
                                <button id="btn-simulate-scan" style="padding:4px 8px; background:#4f46e5; color:white; border:none; border-radius:4px; cursor:pointer;">Kirim</button>
                            </div>
                        </div>

                        <div style="margin-top:10px; font-size:0.7rem; color:#6b7280; background:#f5f3ff; padding:6px; border-radius:4px;">
                            <b>💡 Panduan:</b><br/>
                            • <b>HID Keyboard:</b> Colok USB / Pair Bluetooth di setting HP, scanner akan ketik otomatis. Tidak perlu Pair di sini.<br/>
                            • <b>Bluetooth BLE:</b> Klik Pair Bluetooth, pilih scanner (contoh: NETUM, Tera, Inateck).<br/>
                            • <b>Serial:</b> Untuk scanner kabel USB-Serial / TTL. Butuh Chrome/Edge.<br/>
                            • <b>USB HID:</b> Untuk scanner yang tidak keyboard wedge. Butuh Chrome/Edge.
                        </div>
                    </div>
                </div>

                <!-- SETTING PRINTER -->
                <div class="setting-card">
                    <h4>Mode Printer</h4>
                    <div class="btn-group" style="display:flex; gap:8px; margin-bottom:10px;">
                        <button id="btn-printer-bt" class="btn-touch ${printerType === 'bluetooth' ? 'active' : ''}" style="flex:1; padding:8px; background:${printerType==='bluetooth'?'#f59e0b':'#e2e8f0'}; color:${printerType==='bluetooth'?'white':'#334155'};">🔵 Bluetooth</button>
                        <button id="btn-printer-usb" class="btn-touch ${printerType === 'serial' ? 'active' : ''}" style="flex:1; padding:8px; background:${printerType==='serial'?'#f59e0b':'#e2e8f0'}; color:${printerType==='serial'?'white':'#334155'};">🔌 Serial/USB</button>
                    </div>
                    <button id="btn-connect-printer" class="btn-touch" style="width:100%; background:#f59e0b; color:white; padding:8px;">🔗 Hubungkan Printer</button>
                </div>

                <!-- SETTING TOKO -->
                <div class="setting-card">
                    <h4>Informasi Toko</h4>
                    <input type="text" id="input-store-name" class="form-control" placeholder="Nama Toko" value="${localStorage.getItem('edc_store_name') || ''}" style="margin-bottom:6px; width:100%; padding:6px;">
                    <button id="btn-save-store" class="btn-touch" style="width:100%; background:#10b981; color:white; padding:8px;">💾 Simpan Nama Toko</button>
                </div>
            </div>
        `;
    },

    init() {
        // --- HANDLERS AKUN ---
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
            const pin = document.getElementById('input-op-pin').value.trim();
            if (!name || !pin) { alert('Nama dan PIN wajib diisi!'); return; }
            const operators = JSON.parse(localStorage.getItem('edc_operators') || '[]');
            operators.push({ id: 'op_' + Date.now(), name, pin, role: 'operator' });
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

        // --- HANDLERS DATABASE ---
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
            } catch (err) { console.error('[Firebase Test Error]:', err); alert(`Gagal Terhubung ke Firebase!\\n\\nError:\\n${err.message}`); }
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

        // --- HANDLERS SCANNER MODE SWITCH ---
        document.getElementById('btn-scanner-camera')?.addEventListener('click', () => {
            Scanner.setMode('camera');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-scanner-device')?.addEventListener('click', () => {
            Scanner.setMode('device');
            if (window.app) window.app.loadModule('setting');
        });

        // --- HANDLERS SCANNER DEVICE CONFIG BARU ---
        this.initScannerDeviceHandlers();

        document.getElementById('btn-printer-bt')?.addEventListener('click', () => {
            Printer.setType('bluetooth');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-printer-usb')?.addEventListener('click', () => {
            Printer.setType('serial');
            if (window.app) window.app.loadModule('setting');
        });
        document.getElementById('btn-connect-printer')?.addEventListener('click', () => { Printer.connect(); });

        document.getElementById('btn-save-store')?.addEventListener('click', () => {
            const val = document.getElementById('input-store-name').value;
            localStorage.setItem('edc_store_name', val);
            const headerEl = document.getElementById('header-store-name');
            if (headerEl) headerEl.textContent = `${val} (${JSON.parse(localStorage.getItem('edc_active_user') || '{}').name || 'Admin'})`;
            alert('Nama Toko Diperbarui!');
        });
    },

    initScannerDeviceHandlers() {
        // Load log history
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

        // Config changes auto-save
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

        // === CONNECT BLUETOOTH BLE ===
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
                alert('Error Bluetooth: ' + err.message + '\\nPastikan pakai Chrome/Edge dan HTTPS.');
            } finally {
                btn.textContent = orig; btn.disabled = false;
            }
        });

        // === CONNECT SERIAL ===
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

        // === CONNECT HID ===
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

        // === TEST SCANNER MODE ===
        let testModeActive = false;
        let testHandler = null;

        document.getElementById('btn-test-scanner')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-test-scanner');
            if (testModeActive) {
                // Stop test
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

            // Handler khusus test
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
                        
                        // Simpan ke log
                        let logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
                        logs.unshift(logEntry);
                        if (logs.length > 10) logs = logs.slice(0, 10);
                        localStorage.setItem('edc_scanner_test_log', JSON.stringify(logs));
                        renderLog();

                        // Update status
                        updateStatus(`Scan OK: ${buffer} (${timeStr})`, true);
                        
                        // Feedback beep
                        if (navigator.vibrate) navigator.vibrate(100);
                        
                        // Coba cari produk
                        if (window.app && window.app.modules && window.app.modules.pos) {
                            // trigger feedback
                        }
                    }
                    buffer = "";
                } else if (e.key.length === 1) {
                    buffer += e.key;
                    clearTimeout(timer);
                    timer = setTimeout(() => buffer = "", timeout);
                }
            };

            window.addEventListener('keydown', testHandler);

            // Auto listener via Scanner callback juga
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
            
            // Simulasi masuk ke sistem
            const now = new Date();
            const timeStr = now.toLocaleTimeString('id-ID');
            let logs = JSON.parse(localStorage.getItem('edc_scanner_test_log') || '[]');
            logs.unshift({ time: timeStr, code, type: 'MANUAL' });
            if (logs.length > 10) logs = logs.slice(0, 10);
            localStorage.setItem('edc_scanner_test_log', JSON.stringify(logs));
            renderLog();
            updateStatus(`Simulasi OK: ${code}`, true);
            
            // Trigger ke Scanner handler
            Scanner.handleDecodedText(code);
            input.value = '';
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