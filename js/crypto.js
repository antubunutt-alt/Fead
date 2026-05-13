/**
 * SHADOW-NET CRYPTO MODULE
 * AES-256-GCM + PBKDF2 for client-side encryption
 */

const Crypto = {
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encrypt(data, password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            typeof data === 'string' ? encoder.encode(data) : data
        );

        const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        result.set(salt, 0);
        result.set(iv, salt.length);
        result.set(new Uint8Array(encrypted), salt.length + iv.length);

        return this.arrayBufferToBase64(result.buffer);
    },

    async decrypt(encryptedBase64, password) {
        const data = this.base64ToArrayBuffer(encryptedBase64);
        const salt = data.slice(0, 16);
        const iv = data.slice(16, 28);
        const encrypted = data.slice(28);

        const key = await this.deriveKey(password, salt);

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            throw new Error('Decryption failed: Invalid password or corrupted data');
        }
    },

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const hash = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 200000,
                hash: 'SHA-512'
            },
            keyMaterial,
            512
        );

        const result = new Uint8Array(salt.length + hash.byteLength);
        result.set(salt, 0);
        result.set(new Uint8Array(hash), salt.length);
        return this.arrayBufferToBase64(result.buffer);
    },

    async verifyPassword(password, storedHash) {
        const data = this.base64ToArrayBuffer(storedHash);
        const salt = data.slice(0, 16);
        const hash = data.slice(16);

        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const newHash = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 200000,
                hash: 'SHA-512'
            },
            keyMaterial,
            512
        );

        const newHashArray = new Uint8Array(newHash);
        const storedHashArray = new Uint8Array(hash);

        if (newHashArray.length !== storedHashArray.length) return false;

        let result = 0;
        for (let i = 0; i < newHashArray.length; i++) {
            result |= newHashArray[i] ^ storedHashArray[i];
        }
        return result === 0;
    },

    generatePeerId() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    },

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    async encryptFile(file, password) {
        const arrayBuffer = await file.arrayBuffer();
        return this.encrypt(arrayBuffer, password);
    },

    async decryptFile(encryptedBase64, password, mimeType = 'application/octet-stream') {
        const decrypted = await this.decrypt(encryptedBase64, password);
        const bytes = new Uint8Array(decrypted.length);
        for (let i = 0; i < decrypted.length; i++) {
            bytes[i] = decrypted.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    }
};
