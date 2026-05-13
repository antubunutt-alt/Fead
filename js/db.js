/**
 * SHADOW-NET DATABASE MODULE
 * IndexedDB for local encrypted storage
 */

const DB = {
    db: null,
    dbName: 'ShadowNetDB',
    version: 1,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Users store
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'username' });
                    userStore.createIndex('peerId', 'peerId', { unique: true });
                }

                // Messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    msgStore.createIndex('conversation', ['peerId', 'timestamp'], { unique: false });
                    msgStore.createIndex('room', ['roomId', 'timestamp'], { unique: false });
                }

                // Vault store
                if (!db.objectStoreNames.contains('vault')) {
                    const vaultStore = db.createObjectStore('vault', { keyPath: 'id', autoIncrement: true });
                    vaultStore.createIndex('owner', 'owner', { unique: false });
                    vaultStore.createIndex('shared', 'shared', { unique: false });
                }

                // Contacts/Peers store
                if (!db.objectStoreNames.contains('peers')) {
                    const peerStore = db.createObjectStore('peers', { keyPath: 'peerId' });
                    peerStore.createIndex('name', 'name', { unique: false });
                }

                // Rooms store
                if (!db.objectStoreNames.contains('rooms')) {
                    db.createObjectStore('rooms', { keyPath: 'id' });
                }
            };
        });
    },

    async put(store, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(store, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const request = st.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll(store) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const request = st.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(store, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getByIndex(store, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const idx = st.index(indexName);
            const request = idx.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async clearStore(store) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getMessages(peerId, limit = 100) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readonly');
            const st = tx.objectStore('messages');
            const idx = st.index('conversation');
            const range = IDBKeyRange.bound([peerId, 0], [peerId, Date.now()]);
            const request = idx.openCursor(range, 'prev');

            const messages = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && messages.length < limit) {
                    messages.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(messages.reverse());
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getRoomMessages(roomId, limit = 100) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readonly');
            const st = tx.objectStore('messages');
            const idx = st.index('room');
            const range = IDBKeyRange.bound([roomId, 0], [roomId, Date.now()]);
            const request = idx.openCursor(range, 'prev');

            const messages = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && messages.length < limit) {
                    messages.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(messages.reverse());
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async exportAll() {
        const data = {};
        const stores = ['users', 'messages', 'vault', 'peers', 'rooms'];
        for (const store of stores) {
            data[store] = await this.getAll(store);
        }
        return data;
    },

    async importAll(data) {
        const stores = ['users', 'messages', 'vault', 'peers', 'rooms'];
        for (const store of stores) {
            await this.clearStore(store);
            if (data[store]) {
                for (const item of data[store]) {
                    await this.put(store, item);
                }
            }
        }
    },

    async getVaultStats(username) {
        const files = await this.getByIndex('vault', 'owner', username);
        const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
        return {
            count: files.length,
            size: (totalSize / (1024 * 1024)).toFixed(2)
        };
    }
};
