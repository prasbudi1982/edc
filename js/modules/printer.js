class PrinterModule {
    constructor() {
        this.type = localStorage.getItem('edc_printer_type') || 'bluetooth'; // 'bluetooth' | 'serial'
        this.device = null;
        this.characteristic = null;
    }

    async connect() {
        try {
            if (this.type === 'bluetooth') {
                this.device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Common thermal printer service
                });
                const server = await this.device.gatt.connect();
                // Dapatkan primary service & characteristic sederhana
                const services = await server.getPrimaryServices();
                if (services.length > 0) {
                    const characteristics = await services[0].getCharacteristics();
                    this.characteristic = characteristics[0];
                }
                alert(`Terhubung ke Printer Bluetooth: ${this.device.name}`);
            } else {
                alert("Koneksi USB Serial siap dites saat cetak.");
            }
        } catch (err) {
            console.error("Printer connection error:", err);
            alert("Gagal koneksi printer: " + err.message);
        }
    }

    async printReceipt(cart, total) {
        let text = `=== NOTA PEMBAYARAN ===\n`;
        text += `Toko: ${localStorage.getItem('edc_store_name') || 'POS EDC'}\n`;
        text += `--------------------------------\n`;
        cart.forEach(item => {
            text += `${item.name} x${item.qty} = Rp${item.price * item.qty}\n`;
        });
        text += `--------------------------------\n`;
        text += `TOTAL : Rp ${total.toLocaleString()}\n`;
        text += `Terima Kasih!\n\n\n`;

        if (this.characteristic) {
            const encoder = new TextEncoder();
            await this.characteristic.writeValue(encoder.encode(text));
            console.log("Struk berhasil dicetak ke printer:", this.device?.name || "printer");
        } else {
            // POPUP SIMULASI DIHILANGKAN - diganti peringatan koneksi
            console.warn("Printer belum terhubung, cetak dibatalkan");
            alert("⚠️ Printer belum terhubung!\n\nSilakan hubungkan printer terlebih dahulu:\n1. Buka Menu > Setting > Printer\n2. Pilih jenis Bluetooth / Serial\n3. Klik Connect Printer\n\nTransaksi tetap tersimpan, struk tidak tercetak.");
            throw new Error("PRINTER_NOT_CONNECTED");
        }
    }

    setType(type) {
        this.type = type;
        localStorage.setItem('edc_printer_type', type);
    }
}

const Printer = new PrinterModule();
export default Printer;