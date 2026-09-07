const DB = {
    dbName: 'PosAppDB',
    dbVersion: 2,

    mode: localStorage.getItem('edc_db_mode') || 'local',
    firestore: null,

    async getFirestoreInstance() {
        if (this.firestore) return this.firestore;

        const config = JSON.parse(localStorage.getItem('edc_firebase_config') || '{}');
        if (!config.apiKey || !config.projectId) {
            return null;
        }

        try {
            const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
            const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

            let app;
            if (!getApps().length) {
                app = initializeApp({
                    apiKey: config.apiKey,
                    projectId: config.projectId,
                    authDomain: `${config.projectId}.firebaseapp.com`
                });
            } else {
                app = getApps()[0];
            }
            this.firestore = getFirestore(app);
            return this.firestore;
        } catch (err) {
            console.warn('[Firebase] Gagal memuat SDK Cloud:', err.message);
            return null;
        }
    },

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                
                if (!db.objectStoreNames.contains('products')) {
                    const prodStore = db.createObjectStore('products', { keyPath: 'id' });
                    prodStore.createIndex('barcode', 'barcode', { unique: false });
                    prodStore.createIndex('name', 'name', { unique: false });
                    prodStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                } else {
                    const prodStore = e.target.transaction.objectStore('products');
                    if (!prodStore.indexNames.contains('syncStatus')) {
                        prodStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains('promotions')) {
                    const promoStore = db.createObjectStore('promotions', { keyPath: 'id' });
                    promoStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                } else {
                    const promoStore = e.target.transaction.objectStore('promotions');
                    if (!promoStore.indexNames.contains('syncStatus')) {
                        promoStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                } else {
                    const txStore = e.target.transaction.objectStore('transactions');
                    if (!txStore.indexNames.contains('syncStatus')) {
                        txStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    }
                }
            };

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject('IndexedDB Error: ' + e.target.error);
        });
    },

    setMode(mode, config = null) {
        this.mode = mode;
        localStorage.setItem('edc_db_mode', mode);
        if (config) {
            localStorage.setItem('edc_firebase_config', JSON.stringify(config));
            this.firestore = null;
        }
        if (window.app && typeof window.app.updateDBIndicator === 'function') {
            window.app.updateDBIndicator();
        }
    },

    // --- OPERASI LOKAL (INDEXEDDB) ---

    async getProducts() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('products', 'readonly');
            const store = tx.objectStore('products');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async saveProduct(product) {
        const db = await this.open();
        const id = product.id !== undefined && product.id !== null && String(product.id).trim() !== '' 
            ? product.id 
            : `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        
        const payload = {
            ...product,
            id,
            costPrice: product.costPrice ?? product.buyPrice ?? 0,
            syncStatus: 'pending',
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction('products', 'readwrite');
            const store = tx.objectStore('products');
            const request = store.put(payload);

            request.onsuccess = () => {
                resolve(payload);
                this.syncPendingData();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteProduct(id) {
        const db = await this.open();
        
        await new Promise((resolve, reject) => {
            const tx = db.transaction('products', 'readwrite');
            const store = tx.objectStore('products');
            
            let request = store.delete(id);
            request.onsuccess = () => {
                if (typeof id === 'string' && !isNaN(id)) {
                    store.delete(Number(id));
                }
                resolve(true);
            };
            request.onerror = (e) => reject(e.target.error);
        });

        if (navigator.onLine) {
            try {
                const fs = await this.getFirestoreInstance();
                if (fs) {
                    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                    await deleteDoc(doc(fs, 'products', String(id)));
                }
            } catch (err) {
                console.error('Gagal hapus dokumen cloud:', err);
            }
        }
        return true;
    },

    async getPromotions() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('promotions', 'readonly');
            const store = tx.objectStore('promotions');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async savePromotion(promo) {
        const db = await this.open();
        const id = promo.id !== undefined && promo.id !== null && String(promo.id).trim() !== ''
            ? promo.id 
            : `promo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const payload = {
            ...promo,
            id,
            syncStatus: 'pending',
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction('promotions', 'readwrite');
            const store = tx.objectStore('promotions');
            const request = store.put(payload);

            request.onsuccess = () => {
                resolve(payload);
                this.syncPendingData();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async deletePromotion(id) {
        const db = await this.open();

        await new Promise((resolve, reject) => {
            const tx = db.transaction('promotions', 'readwrite');
            const store = tx.objectStore('promotions');
            const request = store.delete(id);
            request.onsuccess = () => {
                if (typeof id === 'string' && !isNaN(id)) {
                    store.delete(Number(id));
                }
                resolve(true);
            };
            request.onerror = (e) => reject(e.target.error);
        });

        if (navigator.onLine) {
            try {
                const fs = await this.getFirestoreInstance();
                if (fs) {
                    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                    await deleteDoc(doc(fs, 'promotions', String(id)));
                }
            } catch (err) {
                console.error('Gagal hapus promosi cloud:', err);
            }
        }
        return true;
    },

    async getTransactions() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('transactions', 'readonly');
            const store = tx.objectStore('transactions');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async saveTransaction(transaction) {
        const db = await this.open();
        const id = transaction.id !== undefined && transaction.id !== null && String(transaction.id).trim() !== ''
            ? transaction.id 
            : `trx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const payload = {
            ...transaction,
            id,
            createdAt: transaction.createdAt || new Date().toISOString(),
            syncStatus: 'pending',
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction('transactions', 'readwrite');
            const store = tx.objectStore('transactions');
            const request = store.put(payload);

            request.onsuccess = () => {
                resolve(payload);
                this.syncPendingData();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    // --- EDIT & DELETE TRANSAKSI ---

    async updateTransaction(id, updatePayload) {
        const db = await this.open();
        
        await new Promise((resolve, reject) => {
            const tx = db.transaction('transactions', 'readwrite');
            const store = tx.objectStore('transactions');
            const getReq = store.get(id);

            getReq.onsuccess = () => {
                const currentData = getReq.result || { id };
                const updatedData = {
                    ...currentData,
                    ...updatePayload,
                    syncStatus: 'pending',
                    updatedAt: new Date().toISOString()
                };
                store.put(updatedData);
                resolve(true);
            };
            getReq.onerror = (e) => reject(e.target.error);
        });

        this.syncPendingData();
        return true;
    },

    async deleteTransaction(id) {
        const db = await this.open();

        await new Promise((resolve, reject) => {
            const tx = db.transaction('transactions', 'readwrite');
            const store = tx.objectStore('transactions');
            const request = store.delete(id);
            request.onsuccess = () => {
                if (typeof id === 'string' && !isNaN(id)) {
                    store.delete(Number(id));
                }
                resolve(true);
            };
            request.onerror = (e) => reject(e.target.error);
        });

        if (navigator.onLine) {
            try {
                const fs = await this.getFirestoreInstance();
                if (fs) {
                    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                    await deleteDoc(doc(fs, 'transactions', String(id)));
                }
            } catch (err) {
                console.error('Gagal hapus transaksi cloud:', err);
            }
        }
        return true;
    },

    async updateDoc(collectionName, id, payload) {
        if (collectionName === 'transactions') return this.updateTransaction(id, payload);
        if (collectionName === 'products') return this.saveProduct({ id, ...payload });
        if (collectionName === 'promotions') return this.savePromotion({ id, ...payload });
    },

    async deleteDoc(collectionName, id) {
        if (collectionName === 'transactions') return this.deleteTransaction(id);
        if (collectionName === 'products') return this.deleteProduct(id);
        if (collectionName === 'promotions') return this.deletePromotion(id);
    },

    // --- AUTO-PUSH ENGINE ---

    async syncPendingData() {
        if (!navigator.onLine) return;
        
        const fs = await this.getFirestoreInstance();
        if (!fs) return;

        try {
            const { doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const stores = ['products', 'promotions', 'transactions'];

            for (const storeName of stores) {
                const db = await this.open();
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const index = store.index('syncStatus');
                
                const pendingItems = await new Promise((resolve, reject) => {
                    const req = index.getAll('pending');
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = (e) => reject(e.target.error);
                });

                if (pendingItems.length === 0) continue;

                const batch = writeBatch(fs);

                pendingItems.forEach(item => {
                    const docRef = doc(fs, storeName, String(item.id));
                    const cloudPayload = { ...item, syncStatus: 'synced' };
                    batch.set(docRef, cloudPayload, { merge: true });
                });

                await batch.commit();

                const updateTx = db.transaction(storeName, 'readwrite');
                const updateStore = updateTx.objectStore(storeName);
                pendingItems.forEach(item => {
                    updateStore.put({ ...item, syncStatus: 'synced' });
                });

                console.log(`[Auto-Push] ${pendingItems.length} data ${storeName} berhasil diunggah.`);
            }
        } catch (err) {
            console.error('[Auto-Push Error]:', err);
        }
    },

    // --- REALTIME PULL ENGINE ---

    async listenCloudChanges(onUpdateCallback) {
        if (!navigator.onLine) return;
        
        const fs = await this.getFirestoreInstance();
        if (!fs) return;

        try {
            const { collection, query, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const stores = ['products', 'promotions', 'transactions'];

            stores.forEach(storeName => {
                const q = query(collection(fs, storeName));
                onSnapshot(q, async (snapshot) => {
                    const db = await this.open();
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);

                    snapshot.docChanges().forEach(change => {
                        const data = change.doc.data();
                        if (change.type === 'added' || change.type === 'modified') {
                            store.put({ ...data, syncStatus: 'synced' });
                        } else if (change.type === 'removed') {
                            store.delete(data.id);
                        }
                    });

                    tx.oncomplete = () => {
                        if (typeof onUpdateCallback === 'function') {
                            onUpdateCallback(storeName);
                        }
                    };
                }, err => {
                    console.error(`[Listen Error] Firestore ${storeName}:`, err);
                });
            });
        } catch (err) {
            console.error('[Sync Listener Error]:', err);
        }
    }
};

export default DB;