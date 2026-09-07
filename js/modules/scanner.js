class ScannerModule {
    constructor() {
        this.mode = localStorage.getItem('edc_scanner_mode') || 'camera';
        this.deviceType = localStorage.getItem('edc_scanner_device_type') || 'hid_keyboard';
        this.html5Qrcode = null;
        this.isScanning = false;
        this.isFlashOn = false;
        this.onScanCallback = null;
        this.testCallback = null;
        
        this.isProcessing = false;
        this.lastScannedCode = null;
        this.lastScanTime = 0;
        this.scanCooldownTimer = null;
        this.lastCodeClearTimer = null;
        this.noCodeTimer = null;
        this.cooldownSameCode = 2500;
        this.cooldownDifferentCode = 1000;
        
        this.boundHardwareHandler = null;
        this.nativeStream = null;
        this.nativeVideo = null;
        this.nativeDetector = null;
        this.nativeLoopId = null;
        this.nativeTrack = null;
        this.bluetoothDevice = null;
        this.bluetoothServer = null;
        this.bluetoothCharacteristic = null;
        this.serialPort = null;
        this.serialReader = null;
        this.hidDevice = null;
        this.hidBuffer = "";
        this._hidTimer = null;

        this.bindPageNavigationEvents();
        if (this.mode === 'device') this.initHardwareListener();
    }

    setMode(mode) {
        this.mode = mode;
        localStorage.setItem('edc_scanner_mode', mode);
        if (mode === 'device') {
            this.stopCamera();
            this.initHardwareListener();
        } else {
            this.removeHardwareListener();
        }
    }

    setDeviceType(type) {
        this.deviceType = type;
        localStorage.setItem('edc_scanner_device_type', type);
        if (this.mode === 'device') {
            // hanya hid_keyboard yang butuh keydown listener
            if (type === 'hid_keyboard') {
                this.initHardwareListener();
            } else {
                this.removeHardwareListener();
            }
        }
    }

    setTestCallback(cb) { this.testCallback = cb; }

    bindPageNavigationEvents() {
        window.addEventListener('beforeunload', () => this.stopCamera());
        window.addEventListener('pagehide', () => this.stopCamera());
        document.addEventListener('visibilitychange', () => {});
    }

    // ===== CAMERA - TIDAK DIUBAH (SUDAH FIX) =====
    async startCamera(elementId, callback, onCapabilityReady = null) {
        this._lastElementId = elementId;
        this.onScanCallback = callback;
        this.isFlashOn = false;

        if (this.mode === 'device') {
            this.initHardwareListener();
            if (onCapabilityReady) onCapabilityReady(false);
            return true;
        }

        if (this.isScanning && this.nativeStream && this.nativeVideo) {
            const container = document.getElementById(elementId);
            if (container) {
                if (container.contains(this.nativeVideo)) {
                    if (onCapabilityReady) {
                        try { const caps = this.nativeTrack?.getCapabilities?.() || {}; onCapabilityReady(!!caps.torch); } catch { onCapabilityReady(false); }
                    }
                    return true;
                }
                container.innerHTML = '';
                this.nativeVideo.style.width = '100%';
                this.nativeVideo.style.height = '100%';
                this.nativeVideo.style.objectFit = 'cover';
                container.appendChild(this.nativeVideo);
                try { await this.nativeVideo.play(); } catch {}
                if (onCapabilityReady) {
                    try { const caps = this.nativeTrack?.getCapabilities?.() || {}; onCapabilityReady(!!caps.torch); } catch { onCapabilityReady(false); }
                }
                return true;
            }
        }

        await this.stopCamera();
        const container = document.getElementById(elementId);
        if (!container) return false;

        const hdConstraints = {
            width: { min: 1280, ideal: 1920, max: 2560 },
            height: { min: 720, ideal: 1080, max: 1440 },
            facingMode: "environment",
            focusMode: { ideal: "continuous" }
        };

        const nativeOk = await this.startNativeDetector(container, hdConstraints, onCapabilityReady);
        if (nativeOk) return true;
        return await this.startHtml5Qrcode(container, elementId, hdConstraints, onCapabilityReady);
    }

    async startNativeDetector(container, hdConstraints, onCapabilityReady) {
        if (!('BarcodeDetector' in window)) return false;
        try {
            const supported = await BarcodeDetector.getSupportedFormats();
            const needed = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code'];
            const formatsToUse = needed.filter(f => supported.includes(f));
            if (formatsToUse.length === 0) return false;

            container.innerHTML = '';
            const video = document.createElement('video');
            video.setAttribute('autoplay', ''); video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
            video.style.width = '100%'; video.style.height = '100%'; video.style.objectFit = 'cover'; video.style.backgroundColor = '#000';
            container.appendChild(video);
            this.nativeVideo = video;

            let deviceId = null;
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const vDevs = devices.filter(d => d.kind === 'videoinput');
                const back = vDevs.find(d => { const l = d.label.toLowerCase(); return (l.includes('back') || l.includes('rear') || l.includes('environment')) && !l.includes('ultra') && !l.includes('macro'); });
                if (back) deviceId = back.deviceId;
                else if (vDevs.length) deviceId = vDevs[vDevs.length - 1].deviceId;
            } catch {}

            this.nativeStream = await navigator.mediaDevices.getUserMedia({
                video: deviceId ? { deviceId: { exact: deviceId }, ...hdConstraints } : hdConstraints,
                audio: false
            });

            video.srcObject = this.nativeStream;
            await video.play();

            this.nativeTrack = this.nativeStream.getVideoTracks()[0];
            const caps = this.nativeTrack.getCapabilities?.() || {};
            if (onCapabilityReady) onCapabilityReady(!!caps.torch);

            try {
                const adv = [];
                if (caps.focusMode?.includes('continuous')) adv.push({ focusMode: 'continuous' });
                if (caps.exposureMode?.includes('continuous')) adv.push({ exposureMode: 'continuous' });
                if (adv.length) await this.nativeTrack.applyConstraints({ advanced: adv });
            } catch {}

            this.nativeDetector = new BarcodeDetector({ formats: formatsToUse });
            this.isScanning = true;
            video.onclick = () => this.applyAdvancedFocusOnce();

            let lastDetect = 0;
            let noCodeCount = 0;
            const loop = async () => {
                if (!this.isScanning || !this.nativeVideo) return;
                const now = performance.now();
                if (now - lastDetect >= 180) {
                    lastDetect = now;
                    if (!this.isProcessing) {
                        try {
                            const barcodes = await this.nativeDetector.detect(video);
                            if (barcodes.length > 0) {
                                noCodeCount = 0;
                                clearTimeout(this.noCodeTimer);
                                this.handleDecodedText(barcodes[0].rawValue);
                            } else {
                                noCodeCount++;
                                if (noCodeCount > 5 && this.lastScannedCode) {
                                    clearTimeout(this.noCodeTimer);
                                    this.noCodeTimer = setTimeout(() => { this.lastScannedCode = null; this.lastScanTime = 0; }, 600);
                                }
                            }
                        } catch {}
                    }
                }
                this.nativeLoopId = requestAnimationFrame(loop);
            };
            loop();
            return true;
        } catch (e) {
            await this.stopNative();
            return false;
        }
    }

    async startHtml5Qrcode(container, elementId, hdConstraints, onCapabilityReady) {
        try {
            const QrClass = window.Html5Qrcode;
            if (!QrClass) throw new Error('Html5Qrcode not loaded');
            this.html5Qrcode = new QrClass(elementId);
            const config = { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777, videoConstraints: hdConstraints };
            await this.html5Qrcode.start({ facingMode: "environment" }, config, (txt) => { if (!this.isProcessing) this.handleDecodedText(txt); }, () => {});
            this.isScanning = true;
            await this.applyAdvancedFocusOnce();
            this.bindTapToFocus(elementId);
            try { const caps = this.html5Qrcode.getRunningTrackCapabilities(); if (onCapabilityReady) onCapabilityReady(!!caps?.torch); } catch { if (onCapabilityReady) onCapabilityReady(false); }
            return true;
        } catch (err) { return false; }
    }

    handleDecodedText(decodedText) {
        const cleanCode = String(decodedText).trim();
        if (!cleanCode) return;
        const minLen = parseInt(localStorage.getItem('edc_scanner_min_len') || '3');
        if (cleanCode.length < minLen) return;
        const now = Date.now();
        if (this.isProcessing) return;

        if (this.lastScannedCode === cleanCode) {
            const elapsed = now - this.lastScanTime;
            if (elapsed < this.cooldownSameCode) {
                this.lastScanTime = now;
                clearTimeout(this.lastCodeClearTimer);
                this.lastCodeClearTimer = setTimeout(() => { this.lastScannedCode = null; }, this.cooldownSameCode);
                return;
            }
        }

        this.isProcessing = true;
        this.lastScannedCode = cleanCode;
        this.lastScanTime = now;
        clearTimeout(this.lastCodeClearTimer);
        clearTimeout(this.scanCooldownTimer);
        clearTimeout(this.noCodeTimer);

        if (this.testCallback) { try { this.testCallback(cleanCode, this.mode === 'camera' ? 'CAMERA' : this.deviceType.toUpperCase()); } catch {} }
        if (navigator.vibrate) navigator.vibrate(80);

        Promise.resolve().then(async () => {
            try { if (typeof this.onScanCallback === 'function') await this.onScanCallback(cleanCode); }
            catch (e) { console.error('[Scanner] callback error:', e); }
            finally {
                this.scanCooldownTimer = setTimeout(() => { this.isProcessing = false; }, this.cooldownDifferentCode);
                this.lastCodeClearTimer = setTimeout(() => {
                    if (Date.now() - this.lastScanTime >= this.cooldownSameCode - 100) this.lastScannedCode = null;
                }, this.cooldownSameCode);
            }
        });
    }

    releaseProcessing() { clearTimeout(this.scanCooldownTimer); this.scanCooldownTimer = setTimeout(() => { this.isProcessing = false; }, this.cooldownDifferentCode); }
    allowNextScan() { clearTimeout(this.scanCooldownTimer); this.isProcessing = false; }
    forceReset() { clearTimeout(this.scanCooldownTimer); clearTimeout(this.lastCodeClearTimer); clearTimeout(this.noCodeTimer); this.isProcessing = false; this.lastScannedCode = null; this.lastScanTime = 0; }

    async applyAdvancedFocusOnce() { try { if (this.nativeTrack?.getCapabilities) { const caps = this.nativeTrack.getCapabilities(); if (caps.focusMode?.includes('continuous')) await this.nativeTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); return; } const video = document.querySelector('video'); const track = video?.srcObject?.getVideoTracks?.()[0]; if (!track?.getCapabilities) return; const caps = track.getCapabilities(); if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {} }
    bindTapToFocus(id) { const el = document.getElementById(id); const video = el?.querySelector('video') || document.querySelector('video'); if (video) video.onclick = () => this.applyAdvancedFocusOnce(); }
    async toggleFlashlight() { try { if (this.nativeTrack) { const caps = this.nativeTrack.getCapabilities?.() || {}; if (!caps.torch) return false; this.isFlashOn = !this.isFlashOn; await this.nativeTrack.applyConstraints({ advanced: [{ torch: this.isFlashOn }] }); return this.isFlashOn; } if (!this.html5Qrcode || !this.isScanning) return false; this.isFlashOn = !this.isFlashOn; await this.html5Qrcode.applyVideoConstraints({ advanced: [{ torch: this.isFlashOn }] }); return this.isFlashOn; } catch { this.isFlashOn = false; return false; } }
    async stopNative() { if (this.nativeLoopId) cancelAnimationFrame(this.nativeLoopId); this.nativeLoopId = null; if (this.nativeStream) { this.nativeStream.getTracks().forEach(t => t.stop()); this.nativeStream = null; } this.nativeVideo = null; this.nativeDetector = null; this.nativeTrack = null; }
    async stopCamera() { clearTimeout(this.scanCooldownTimer); clearTimeout(this.lastCodeClearTimer); clearTimeout(this.noCodeTimer); this.isProcessing = false; this.lastScannedCode = null; this.lastScanTime = 0; if (this.mode !== 'device') this.removeHardwareListener(); await this.stopNative(); if (this.html5Qrcode) { try { if (this.isScanning) await this.html5Qrcode.stop(); this.html5Qrcode.clear(); } catch {} this.html5Qrcode = null; } this.isScanning = false; this.isFlashOn = false; }

    // ================= DEVICE MODE - FIX 1000% =================
    initHardwareListener() {
        this.removeHardwareListener();

        // Hanya HID Keyboard yang pakai keydown global. BLE/Serial/HID Raw pakai API sendiri.
        if (this.deviceType !== 'hid_keyboard') {
            console.log('[Scanner] Skip keydown listener, deviceType =', this.deviceType);
            return;
        }

        let buffer = "";
        let timer = null;

        const getTerminator = () => localStorage.getItem('edc_scanner_terminator') || 'enter';
        const getTimeout = () => parseInt(localStorage.getItem('edc_scanner_buffer_timeout') || '300');
        const getMinLen = () => parseInt(localStorage.getItem('edc_scanner_min_len') || '3');

        this.boundHardwareHandler = (e) => {
            if (this.mode !== 'device') return;
            if (this.deviceType !== 'hid_keyboard') return;

            // Jangan tangkap input manual barcode & search
            if (e.target.id === 'input-manual-barcode' || e.target.id === 'manual-search-input') return;

            // Jangan tangkap ketikan di form produk/operator kecuali Enter/Tab sebagai terminator
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                const id = e.target.id || '';
                const isFormField = id.startsWith('prod-') || id.startsWith('fb-') || id.startsWith('input-op-') || id.startsWith('input-admin-') || id.startsWith('bon-') || id === 'input-store-name' || id === 'input-scanner-minlen' || id === 'fb-apiKey' || id === 'fb-projectId';
                if (isFormField) {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                } else {
                    // input lain (login dll) jangan ditangkap sama sekali untuk ketikan biasa
                    if (e.key.length === 1 && e.key !== 'Enter' && e.key !== 'Tab') return;
                }
            }

            const terminator = getTerminator();
            const isEnter = e.key === 'Enter';
            const isTab = e.key === 'Tab';
            const isTerminatorKey = (terminator === 'enter' && isEnter) || (terminator === 'tab' && isTab) || (terminator === 'enter_tab' && (isEnter || isTab));

            if (terminator === 'none') {
                // Mode tanpa terminator: kumpulkan karakter, trigger otomatis setelah timeout
                if (e.key.length === 1) {
                    buffer += e.key;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (buffer.length >= getMinLen()) {
                            this.handleDecodedText(buffer);
                        }
                        buffer = "";
                    }, getTimeout());
                }
                return;
            }

            if (isTerminatorKey) {
                if (buffer.length >= getMinLen()) {
                    if (isEnter) e.preventDefault();
                    this.handleDecodedText(buffer);
                }
                buffer = "";
                return;
            }

            if (e.key.length === 1) {
                buffer += e.key;
                clearTimeout(timer);
                timer = setTimeout(() => { buffer = ""; }, getTimeout());
            }
        };

        window.addEventListener('keydown', this.boundHardwareHandler);
        console.log('[Scanner] HID Keyboard listener AKTIF');
    }

    removeHardwareListener() {
        if (this.boundHardwareHandler) {
            window.removeEventListener('keydown', this.boundHardwareHandler);
            this.boundHardwareHandler = null;
            console.log('[Scanner] HID Keyboard listener OFF');
        }
    }

    async connectBluetooth() {
        if (!navigator.bluetooth) return { success: false, error: 'Web Bluetooth tidak didukung. Gunakan Chrome/Edge di HTTPS.' };
        try {
            let device;
            try {
                device = await navigator.bluetooth.requestDevice({
                    filters: [
                        { namePrefix: 'NETUM' },
                        { namePrefix: 'Tera' },
                        { namePrefix: 'BCST' },
                        { namePrefix: 'Eyoyo' },
                        { namePrefix: 'Inateck' }
                    ],
                    optionalServices: ['battery_service', '0000fff0-0000-1000-8000-00805f9b34fb', '6e400001-b5a3-f393-e0a9-e50e24dcca9e', '0000ff00-0000-1000-8000-00805f9b34fb']
                });
            } catch {
                device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['battery_service', '0000fff0-0000-1000-8000-00805f9b34fb', '6e400001-b5a3-f393-e0a9-e50e24dcca9e', '0000ff00-0000-1000-8000-00805f9b34fb']
                });
            }

            this.bluetoothDevice = device;
            device.addEventListener('gattserverdisconnected', () => {
                console.log('[Scanner] BLE disconnected');
                localStorage.removeItem('edc_scanner_bt_name');
                this.bluetoothDevice = null;
                this.bluetoothServer = null;
                this.bluetoothCharacteristic = null;
            });

            const server = await device.gatt.connect();
            this.bluetoothServer = server;

            let foundChar = null;
            try {
                const services = await server.getPrimaryServices();
                for (const service of services) {
                    try {
                        const chars = await service.getCharacteristics();
                        for (const char of chars) {
                            if (char.properties.notify) {
                                await char.startNotifications().catch(()=>{});
                                char.addEventListener('characteristicvaluechanged', (event) => {
                                    const decoder = new TextDecoder('utf-8');
                                    let code = decoder.decode(event.target.value);
                                    code = code.trim().replace(/[\r\n\t]+$/g, '').trim();
                                    if (code.length >= 3) {
                                        this.handleDecodedText(code);
                                        if (this.testCallback) this.testCallback(code, 'BLE');
                                    }
                                });
                                foundChar = char;
                            }
                        }
                    } catch {}
                }
            } catch (err) {
                console.warn('[Scanner] BLE service scan warning', err);
            }

            this.bluetoothCharacteristic = foundChar;
            localStorage.setItem('edc_scanner_bt_name', device.name || 'BLE Scanner');
            localStorage.setItem('edc_scanner_device_type', 'bluetooth_ble');
            localStorage.setItem('edc_scanner_mode', 'device');
            this.deviceType = 'bluetooth_ble';
            this.mode = 'device';
            this.removeHardwareListener();

            return { success: true, name: device.name || 'BLE Scanner' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async connectSerial() {
        if (!navigator.serial) return { success: false, error: 'Web Serial tidak didukung. Gunakan Chrome/Edge 89+ di HTTPS.' };
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
            this.serialPort = port;

            const decoder = new TextDecoderStream();
            const readableStreamClosed = port.readable.pipeTo(decoder.writable);
            const reader = decoder.readable.getReader();
            this.serialReader = reader;

            let buffer = "";
            const readLoop = async () => {
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (value) {
                            buffer += value;
                            if (buffer.includes('\r') || buffer.includes('\n') || buffer.includes('\r') || buffer.includes('\n')) {
                                // Normalisasi split
                                const parts = buffer.split(/[\r\n]+/);
                                buffer = parts.pop() || "";
                                for (const part of parts) {
                                    const clean = part.trim();
                                    if (clean.length >= 3) {
                                        this.handleDecodedText(clean);
                                        if (this.testCallback) this.testCallback(clean, 'SERIAL');
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log('[Scanner] Serial loop ended', e);
                }
            };
            readLoop();

            localStorage.setItem('edc_scanner_device_type', 'serial');
            localStorage.setItem('edc_scanner_mode', 'device');
            this.deviceType = 'serial';
            this.mode = 'device';
            this.removeHardwareListener();

            return { success: true, name: 'Serial Port' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async connectHID() {
        if (!navigator.hid) return { success: false, error: 'Web HID tidak didukung. Gunakan Chrome/Edge di HTTPS.' };
        try {
            const devices = await navigator.hid.requestDevice({ filters: [] });
            if (devices.length === 0) return { success: false, error: 'Tidak ada device dipilih' };

            const device = devices[0];
            await device.open();
            this.hidDevice = device;

            device.addEventListener('inputreport', (event) => {
                const { data } = event;
                let text = "";
                for (let i = 0; i < data.byteLength; i++) {
                    const byte = data.getUint8(i);
                    if (byte >= 32 && byte <= 126) text += String.fromCharCode(byte);
                }
                text = text.trim();
                if (text.length >= 1) {
                    this.hidBuffer += text;
                    clearTimeout(this._hidTimer);
                    this._hidTimer = setTimeout(() => {
                        const minLen = parseInt(localStorage.getItem('edc_scanner_min_len') || '3');
                        if (this.hidBuffer.length >= minLen) {
                            this.handleDecodedText(this.hidBuffer);
                            if (this.testCallback) this.testCallback(this.hidBuffer, 'HID');
                        }
                        this.hidBuffer = "";
                    }, 100);
                }
            });

            localStorage.setItem('edc_scanner_device_type', 'usb_hid');
            localStorage.setItem('edc_scanner_mode', 'device');
            this.deviceType = 'usb_hid';
            this.mode = 'device';
            this.removeHardwareListener();

            return { success: true, name: device.productName || 'HID Device' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async disconnectAll() {
        try { if (this.bluetoothDevice?.gatt?.connected) this.bluetoothDevice.gatt.disconnect(); } catch {}
        this.bluetoothDevice = null;
        this.bluetoothServer = null;
        this.bluetoothCharacteristic = null;

        try { if (this.serialReader) await this.serialReader.cancel(); } catch {}
        try { if (this.serialPort) await this.serialPort.close(); } catch {}
        this.serialPort = null;
        this.serialReader = null;

        try { if (this.hidDevice) await this.hidDevice.close(); } catch {}
        this.hidDevice = null;
        this.hidBuffer = "";

        // Balik ke HID Keyboard sebagai default setelah disconnect
        this.deviceType = 'hid_keyboard';
        localStorage.setItem('edc_scanner_device_type', 'hid_keyboard');
        this.initHardwareListener();
        console.log('[Scanner] All disconnected, fallback to hid_keyboard');
    }
}

const Scanner = new ScannerModule();
export default Scanner;