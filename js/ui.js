/**
 * SHADOW-NET UI MODULE
 * Interface management, rendering, interactions
 */

const UI = {
    currentView: 'chat',

    init() {
        this.setupTabs();
        this.setupMobileMenu();
    },

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab + '-form').classList.add('active');
            });
        });
    },

    setupMobileMenu() {
        // Mobile sidebar toggle would go here
    },

    switchView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        document.getElementById('view-' + viewName).classList.add('active');
        event.target.closest('.nav-item').classList.add('active');

        this.currentView = viewName;

        // Refresh view data
        if (viewName === 'chat') this.updateChatList();
        if (viewName === 'rooms') this.renderRooms();
        if (viewName === 'vault') Vault.renderVault();
        if (viewName === 'peers') this.renderPeers();
    },

    showAuth() {
        document.getElementById('auth-screen').classList.add('active');
        document.getElementById('main-screen').classList.remove('active');
    },

    showMain() {
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
        document.getElementById('main-screen').style.display = 'flex';

        // Update sidebar user info
        const user = Auth.currentUser;
        document.getElementById('sidebar-username').textContent = user.username;
        document.getElementById('sidebar-status').textContent = user.status || '● Online';

        const avatar = document.getElementById('user-avatar');
        if (user.avatar) {
            avatar.innerHTML = `<img src="${user.avatar}" alt="">`;
        } else {
            avatar.textContent = user.username[0].toUpperCase();
        }

        this.updateChatList();
    },

    async updateChatList() {
        const peers = await DB.getAll('peers');
        const list = document.getElementById('chat-list');

        if (peers.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📡</div>
                    <p>No peers connected. Add a peer to start chatting.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        for (const peer of peers) {
            const messages = await DB.getMessages(peer.peerId, 1);
            const lastMsg = messages[0];
            const isOnline = P2P.dataChannels.has(peer.peerId) && 
                           P2P.dataChannels.get(peer.peerId).readyState === 'open';

            const div = document.createElement('div');
            div.className = 'chat-item';
            div.onclick = () => Chat.openChat(peer.peerId);

            const time = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('id-ID', {
                hour: '2-digit', minute: '2-digit'
            }) : '';

            div.innerHTML = `
                <div class="avatar" style="border-color: ${isOnline ? 'var(--accent)' : 'var(--text-muted)'}">
                    ${peer.name ? peer.name[0].toUpperCase() : '?'}
                </div>
                <div class="chat-preview">
                    <div class="chat-name">${peer.name || peer.peerId.slice(0, 8)}</div>
                    <div class="chat-last">${lastMsg ? lastMsg.text : 'No messages yet'}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${time}</div>
                </div>
            `;
            list.appendChild(div);
        }
    },

    async renderRooms() {
        const rooms = await DB.getAll('rooms');
        const list = document.getElementById('room-list');

        if (rooms.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🌐</div>
                    <p>No rooms yet. Create a room to broadcast messages.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = rooms.map(room => `
            <div class="room-item" onclick="Chat.openRoom('${room.id}')">
                <div class="avatar">#</div>
                <div class="chat-preview">
                    <div class="chat-name">${room.name}</div>
                    <div class="chat-last">${room.description || 'Public room'}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${room.members?.length || 0} peers</div>
                </div>
            </div>
        `).join('');
    },

    async renderPeers() {
        const peers = await DB.getAll('peers');
        const list = document.getElementById('peers-list');

        if (peers.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📡</div>
                    <p>No peers saved. Add peers manually or scan QR.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = peers.map(peer => {
            const isOnline = P2P.dataChannels.has(peer.peerId) && 
                           P2P.dataChannels.get(peer.peerId).readyState === 'open';
            return `
                <div class="peer-item">
                    <div class="avatar" style="border-color: ${isOnline ? 'var(--accent)' : 'var(--text-muted)'}">
                        ${peer.name ? peer.name[0].toUpperCase() : '?'}
                    </div>
                    <div class="chat-preview">
                        <div class="chat-name">${peer.name || 'Unknown'}</div>
                        <div class="chat-last">${peer.peerId}</div>
                    </div>
                    <div class="chat-meta">
                        <div class="chat-time">${isOnline ? '🟢 Online' : '⚫ Offline'}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    closeChat() {
        document.getElementById('chat-panel').classList.remove('active');
        Chat.currentPeer = null;
        Chat.currentRoom = null;
    },

    showAddPeer() {
        this.showModal('modal-add-peer');
    },

    showCreateRoom() {
        const name = prompt('Room name:');
        if (!name) return;

        const room = {
            id: 'room_' + Date.now(),
            name: name,
            description: prompt('Room description (optional):') || '',
            createdBy: Auth.currentUser.username,
            createdAt: Date.now(),
            members: [P2P.peerId]
        };

        DB.put('rooms', room);
        this.renderRooms();
        this.showToast('Room created: ' + name);
    },

    showProfile() {
        const user = Auth.currentUser;
        document.getElementById('modal-username').textContent = user.username;
        document.getElementById('modal-bio').textContent = user.bio || 'No bio set';

        const avatar = document.getElementById('modal-avatar');
        if (user.avatar) {
            avatar.innerHTML = `<img src="${user.avatar}" alt="">`;
        } else {
            avatar.textContent = user.username[0].toUpperCase();
        }

        // Stats
        DB.getAll('messages').then(msgs => {
            document.getElementById('modal-messages').textContent = msgs.length;
        });
        DB.getByIndex('vault', 'owner', user.username).then(files => {
            document.getElementById('modal-files').textContent = files.length;
        });
        DB.getAll('peers').then(peers => {
            document.getElementById('modal-peers').textContent = peers.length;
        });

        this.showModal('modal-profile');
    },

    showModal(modalId) {
        document.getElementById('modal-overlay').classList.add('active');
        document.getElementById(modalId).classList.add('active');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    },

    updateBadge() {
        // Count unread messages
        DB.getAll('messages').then(msgs => {
            const unread = msgs.filter(m => m.received && !m.read).length;
            const badge = document.getElementById('msg-badge');
            badge.textContent = unread;
            badge.style.display = unread > 0 ? 'block' : 'none';
        });
    },

    showToast(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-card);
            border: 1px solid var(--accent);
            color: var(--accent);
            padding: 12px 24px;
            border-radius: 8px;
            font-family: var(--font-mono);
            font-size: 12px;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 255, 136, 0.2);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
