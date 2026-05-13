/**
 * SHADOW-NET VAULT MODULE
 * Local encrypted file storage using IndexedDB
 */

const Vault = {
    currentUser: null,

    init() {
        this.currentUser = Auth.currentUser;
        this.setupUploadListener();
    },

    setupUploadListener() {
        const input = document.getElementById('vault-upload');
        input.addEventListener('change', async (e) => {
            for (const file of e.target.files) {
                await this.storeFile(file);
            }
            input.value = '';
        });
    },

    async storeFile(file, shared = false) {
        if (!this.currentUser) return;

        try {
            UI.showToast(`Encrypting ${file.name}...`);

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            // Encrypt file content with user's password
            const encrypted = await Crypto.encrypt(
                Crypto.arrayBufferToBase64(arrayBuffer),
                this.currentUser.password
            );

            const fileData = {
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                encrypted: encrypted,
                owner: this.currentUser.username,
                shared: shared,
                uploadedAt: Date.now()
            };

            await DB.put('vault', fileData);
            UI.showToast(`File secured: ${file.name}`);
            this.renderVault();
        } catch (err) {
            console.error('[Vault] Store error:', err);
            UI.showToast('Failed to encrypt file');
        }
    },

    async renderVault() {
        if (!this.currentUser) return;

        const files = await DB.getByIndex('vault', 'owner', this.currentUser.username);
        const grid = document.getElementById('vault-grid');
        const stats = await DB.getVaultStats(this.currentUser.username);

        document.getElementById('vault-count').textContent = stats.count;
        document.getElementById('vault-size').textContent = stats.size + ' MB';

        if (files.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="icon">🔒</div>
                    <p>Your vault is empty. Upload files to encrypt them locally.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = files.map(file => {
            const icon = this.getFileIcon(file.type);
            const size = this.formatSize(file.size);
            return `
                <div class="vault-item" onclick="Vault.downloadFile(${file.id})">
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button onclick="Vault.shareFile(${file.id})" title="Share">📤</button>
                        <button onclick="Vault.deleteFile(${file.id})" title="Delete">🗑️</button>
                    </div>
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-size">${size}</div>
                </div>
            `;
        }).join('');
    },

    async downloadFile(fileId) {
        try {
            const file = await DB.get('vault', fileId);
            if (!file) return;

            UI.showToast('Decrypting file...');

            const decrypted = await Crypto.decrypt(file.encrypted, this.currentUser.password);
            const bytes = Crypto.base64ToArrayBuffer(decrypted);

            const blob = new Blob([bytes], { type: file.type });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            UI.showToast('File downloaded');
        } catch (err) {
            console.error('[Vault] Download error:', err);
            UI.showToast('Decryption failed');
        }
    },

    async shareFile(fileId) {
        const file = await DB.get('vault', fileId);
        if (!file) return;

        // Update shared status
        file.shared = !file.shared;
        await DB.put('vault', file);

        UI.showToast(file.shared ? 'File marked as shared' : 'File is now private');
        this.renderVault();
    },

    async deleteFile(fileId) {
        if (!confirm('Delete this file permanently?')) return;

        await DB.delete('vault', fileId);
        UI.showToast('File deleted');
        this.renderVault();
    },

    async getSharedFile(fileId) {
        const file = await DB.get('vault', fileId);
        if (!file || !file.shared) return null;
        return file;
    },

    async sendFileToPeer(peerId, fileId) {
        const file = await DB.get('vault', fileId);
        if (!file) return;

        const message = {
            type: 'file',
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            encrypted: file.encrypted,
            timestamp: Date.now()
        };

        const sent = await P2P.sendMessage(peerId, message);
        if (sent) {
            UI.showToast(`File sent: ${file.name}`);
        }
    },

    async receiveFile(peerId, data) {
        // Store received file in vault with peer as source
        const fileData = {
            name: data.fileName,
            type: data.fileType,
            size: data.fileSize,
            encrypted: data.encrypted,
            owner: this.currentUser.username,
            source: peerId,
            shared: false,
            receivedAt: Date.now()
        };

        await DB.put('vault', fileData);
        UI.showToast(`Received file: ${data.fileName}`);

        if (document.getElementById('view-vault').classList.contains('active')) {
            this.renderVault();
        }
    },

    uploadFile() {
        document.getElementById('vault-upload').click();
    },

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
        if (mimeType.includes('doc')) return '📝';
        if (mimeType.includes('xls')) return '📊';
        if (mimeType.includes('code') || mimeType.includes('javascript')) return '💻';
        return '📎';
    },

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
