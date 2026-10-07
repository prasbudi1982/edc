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

    // UPDATE: tambah param info bayar untuk kembalian
    async printReceipt(cart, total, payInfo = {}) {
        const uangDibayar = Number(payInfo.uangDibayar || payInfo.bayar || 0);
        const kembalian = Number(payInfo.kembalian || payInfo.kembali || 0);
        const paymentMethod = payInfo.paymentMethod || 'CASH';

        let text = `=== NOTA PEMBAYARAN ===\n`;
        text += `Toko: ${localStorage.getItem('edc_store_name') || 'POS EDC'}\n`;
        text += `Metode: ${paymentMethod}\n`;
        text += `Tgl: ${new Date().toLocaleString('id-ID')}\n`;
        text += `--------------------------------\n`;
        cart.forEach(item => {
            const lt = item.price * item.qty;
            text += `${item.name} x${item.qty} = Rp${lt.toLocaleString('id-ID')}\n`;
        });
        text += `--------------------------------\n`;
        text += `TOTAL : Rp ${total.toLocaleString('id-ID')}\n`;
        // FITUR BARU KEMBALIAN
        if (paymentMethod === 'CASH' && uangDibayar > 0) {
            text += `BAYAR : Rp ${uangDibayar.toLocaleString('id-ID')}\n`;
            text += `KEMBALI: Rp ${kembalian.toLocaleString('id-ID')}\n`;
        }
        text += `--------------------------------\n`;
        text += `Terima Kasih!\n\n\n`;

        // Simpan untuk share WA juga
        window._lastTransaksiKembalian = { uangDibayar, kembalian, total, paymentMethod };

        if (this.characteristic) {
            const encoder = new TextEncoder();
            await this.characteristic.writeValue(encoder.encode(text));
            console.log("Struk berhasil dicetak ke printer:", this.device?.name || "printer");
        } else {
            console.warn("Printer belum terhubung, cetak dibatalkan");
            alert("⚠️ Printer belum terhubung!\n\nSilakan hubungkan printer terlebih dahulu:\n1. Buka Menu > Setting > Printer\n2. Pilih jenis Bluetooth / Serial\n3. Klik Connect Printer\n\nTransaksi tetap tersimpan, struk tidak tercetak." + (uangDibayar>0 ? `\n\nBayar: Rp ${uangDibayar.toLocaleString('id-ID')}\nKembali: Rp ${kembalian.toLocaleString('id-ID')}` : ""));
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
