/**
 * SHADOW-NET CHAT MODULE
 * Message handling, file transfer, room management
 */

const Chat = {
    currentPeer: null,
    currentRoom: null,
    currentUser: null,

    init() {
        this.currentUser = Auth.currentUser;

        // Setup message input
        const input = document.getElementById('message-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        // Setup file input for chat
        const fileInput = document.getElementById('chat-file-input');
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.sendFileMessage(file);
                fileInput.value = '';
            }
        });

        // Register P2P handlers
        P2P.onMessage((peerId, data) => this.handleIncomingMessage(peerId, data));
        P2P.onFile((peerId, data) => Vault.receiveFile(peerId, data));
    },

    async openChat(peerId) {
        this.currentPeer = peerId;
        this.currentRoom = null;

        const peer = await DB.get('peers', peerId) || { peerId, name: peerId.slice(0, 8) };

        document.getElementById('chat-name').textContent = peer.name || peerId.slice(0, 8);
        document.getElementById('chat-status').textContent = 
            P2P.dataChannels.has(peerId) && P2P.dataChannels.get(peerId).readyState === 'open' 
                ? '● Online' : '○ Offline';
        document.getElementById('chat-avatar').textContent = (peer.name || '?')[0].toUpperCase();

        document.getElementById('chat-panel').classList.add('active');

        await this.loadMessages(peerId);
    },

    async openRoom(roomId) {
        this.currentPeer = null;
        this.currentRoom = roomId;

        const room = await DB.get('rooms', roomId);
        if (!room) return;

        document.getElementById('chat-name').textContent = room.name;
        document.getElementById('chat-status').textContent = `${room.members?.length || 0} members`;
        document.getElementById('chat-avatar').textContent = '#';

        document.getElementById('chat-panel').classList.add('active');

        await this.loadRoomMessages(roomId);
    },

    async loadMessages(peerId) {
        const messages = await DB.getMessages(peerId);
        const container = document.getElementById('messages');
        container.innerHTML = '';

        for (const msg of messages) {
            this.renderMessage(msg, msg.sender === this.currentUser.username ? 'sent' : 'received');
        }

        this.scrollToBottom();
    },

    async loadRoomMessages(roomId) {
        const messages = await DB.getRoomMessages(roomId);
        const container = document.getElementById('messages');
        container.innerHTML = '';

        for (const msg of messages) {
            this.renderMessage(msg, msg.sender === this.currentUser.username ? 'sent' : 'received');
        }

        this.scrollToBottom();
    },

    async sendMessage() {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if (!text) return;

        const message = {
            type: 'chat',
            text: text,
            sender: this.currentUser.username,
            timestamp: Date.now()
        };

        if (this.currentPeer) {
            // Direct message
            const sent = await P2P.sendMessage(this.currentPeer, message);

            // Store locally regardless of delivery
            await DB.put('messages', {
                ...message,
                peerId: this.currentPeer,
                delivered: sent
            });

            this.renderMessage({ ...message, delivered: sent }, 'sent');
        } else if (this.currentRoom) {
            // Room broadcast
            await P2P.broadcastToRoom(this.currentRoom, message);

            await DB.put('messages', {
                ...message,
                roomId: this.currentRoom,
                delivered: true
            });

            this.renderMessage({ ...message, delivered: true }, 'sent');
        }

        input.value = '';
        input.style.height = 'auto';
        this.scrollToBottom();
        UI.updateChatList();
    },

    async sendFileMessage(file) {
        if (!this.currentPeer && !this.currentRoom) return;

        // First store in vault
        await Vault.storeFile(file, true);
        const files = await DB.getByIndex('vault', 'owner', this.currentUser.username);
        const latestFile = files[files.length - 1];

        const message = {
            type: 'file',
            text: `📎 ${file.name}`,
            fileId: latestFile.id,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            sender: this.currentUser.username,
            timestamp: Date.now()
        };

        if (this.currentPeer) {
            await P2P.sendMessage(this.currentPeer, message);
            await DB.put('messages', {
                ...message,
                peerId: this.currentPeer,
                delivered: true
            });
        } else if (this.currentRoom) {
            await P2P.broadcastToRoom(this.currentRoom, message);
            await DB.put('messages', {
                ...message,
                roomId: this.currentRoom,
                delivered: true
            });
        }

        this.renderMessage(message, 'sent');
        this.scrollToBottom();
    },

    async handleIncomingMessage(peerId, data) {
        if (data.type === 'chat') {
            // Store received message
            await DB.put('messages', {
                ...data,
                peerId: peerId,
                received: true
            });

            // If currently viewing this chat, render it
            if (this.currentPeer === peerId && document.getElementById('chat-panel').classList.contains('active')) {
                this.renderMessage({ ...data, received: true }, 'received');
                this.scrollToBottom();
            }

            // Update unread badge
            UI.updateBadge();
            UI.updateChatList();

        } else if (data.type === 'file') {
            await Vault.receiveFile(peerId, data);

            await DB.put('messages', {
                type: 'file',
                text: `📎 ${data.fileName}`,
                fileName: data.fileName,
                sender: data.sender,
                peerId: peerId,
                timestamp: data.timestamp,
                received: true
            });

            if (this.currentPeer === peerId) {
                this.renderMessage({
                    type: 'file',
                    text: `📎 ${data.fileName}`,
                    sender: data.sender,
                    timestamp: data.timestamp
                }, 'received');
                this.scrollToBottom();
            }

            UI.updateBadge();
        }
    },

    renderMessage(msg, type) {
        const container = document.getElementById('messages');
        const div = document.createElement('div');
        div.className = `message ${type}`;

        const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        let content = this.escapeHtml(msg.text);

        // Check if message contains file reference
        if (msg.type === 'file' && msg.fileName) {
            content = `<div class="msg-file" onclick="Chat.downloadChatFile('${msg.fileName}')">
                <span>📎</span>
                <span>${this.escapeHtml(msg.fileName)}</span>
            </div>`;
        }

        div.innerHTML = `
            ${content}
            <div class="msg-time">${time} ${msg.delivered === false ? '⚠️' : ''}</div>
        `;

        container.appendChild(div);
    },

    scrollToBottom() {
        const container = document.getElementById('messages');
        container.scrollTop = container.scrollHeight;
    },

    insertEmoji(emoji) {
        const input = document.getElementById('message-input');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
    },

    sendFile() {
        document.getElementById('chat-file-input').click();
    },

    async downloadChatFile(fileName) {
        // Find file in vault by name
        const files = await DB.getByIndex('vault', 'owner', this.currentUser.username);
        const file = files.find(f => f.name === fileName);
        if (file) {
            Vault.downloadFile(file.id);
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
