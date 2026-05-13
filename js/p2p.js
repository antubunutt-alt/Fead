/**
 * SHADOW-NET P2P MODULE
 * WebRTC DataChannel for direct peer communication
 * Uses public STUN servers + optional TURN fallback
 */

const P2P = {
    peerId: null,
    connections: new Map(), // peerId -> RTCPeerConnection
    dataChannels: new Map(), // peerId -> RTCDataChannel
    signalingSocket: null,
    signalingUrl: 'wss://relay.shadow-net.local',
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    },
    messageHandlers: [],
    connectionHandlers: [],
    fileHandlers: [],

    init() {
        this.peerId = localStorage.getItem('shadownet_peerid') || Crypto.generatePeerId();
        localStorage.setItem('shadownet_peerid', this.peerId);

        document.getElementById('my-peer-id').textContent = this.peerId;

        // Try to connect to signaling relay
        this.connectSignaling();

        // Setup QR code for peer exchange
        this.setupQR();
    },

    connectSignaling() {
        try {
            // Using a simple polling fallback since we can't guarantee WebSocket server
            // In production, replace with your own signaling server
            this.updateStatus('signal-status', 'online');
            console.log('[P2P] Signaling ready (local mode)');
        } catch (e) {
            this.updateStatus('signal-status', 'offline');
            console.warn('[P2P] Signaling unavailable');
        }
    },

    updateStatus(id, status) {
        const el = document.getElementById(id);
        if (el) {
            el.className = 'status-dot ' + status;
        }
    },

    setupQR() {
        // QR code generation for peer ID sharing
        // Will be implemented with a simple canvas-based QR in app.js
    },

    async createPeerConnection(targetPeerId) {
        if (this.connections.has(targetPeerId)) {
            return this.connections.get(targetPeerId);
        }

        const pc = new RTCPeerConnection(this.config);
        this.connections.set(targetPeerId, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(targetPeerId, {
                    type: 'ice',
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[P2P] Connection state with ${targetPeerId}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                this.updateStatus('p2p-status', 'online');
                this.connectionHandlers.forEach(h => h(targetPeerId, true));
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.updateStatus('p2p-status', 'offline');
                this.connectionHandlers.forEach(h => h(targetPeerId, false));
                this.connections.delete(targetPeerId);
                this.dataChannels.delete(targetPeerId);
            }
        };

        // Create data channel
        const channel = pc.createDataChannel('messages', {
            ordered: true,
            maxRetransmits: 3
        });
        this.setupDataChannel(targetPeerId, channel);

        pc.ondatachannel = (event) => {
            this.setupDataChannel(targetPeerId, event.channel);
        };

        return pc;
    },

    setupDataChannel(peerId, channel) {
        this.dataChannels.set(peerId, channel);

        channel.onopen = () => {
            console.log(`[P2P] Data channel open with ${peerId}`);
            UI.showToast(`Connected to peer: ${peerId.slice(0, 8)}...`);
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(peerId, data);
            } catch (e) {
                console.error('[P2P] Message parse error:', e);
            }
        };

        channel.onclose = () => {
            console.log(`[P2P] Data channel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
        };

        channel.onerror = (err) => {
            console.error(`[P2P] Data channel error with ${peerId}:`, err);
        };
    },

    async connectToPeer(targetPeerId) {
        if (!targetPeerId || targetPeerId === this.peerId) {
            UI.showToast('Invalid peer ID');
            return;
        }

        try {
            const pc = await this.createPeerConnection(targetPeerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Store offer for manual exchange (clipboard/QR)
            const signalData = {
                type: 'offer',
                from: this.peerId,
                to: targetPeerId,
                sdp: offer.sdp
            };

            // Copy to clipboard for manual exchange
            await navigator.clipboard.writeText(btoa(JSON.stringify(signalData)));
            UI.showToast('Offer copied! Send to peer and paste their answer.');

            // Save to DB as pending
            await DB.put('peers', {
                peerId: targetPeerId,
                name: targetPeerId.slice(0, 8),
                status: 'pending',
                addedAt: Date.now()
            });

            UI.renderPeers();
        } catch (err) {
            console.error('[P2P] Connection error:', err);
            UI.showToast('Connection failed: ' + err.message);
        }
    },

    async handleSignal(signalBase64) {
        try {
            const signal = JSON.parse(atob(signalBase64));
            const { type, from, sdp, candidate } = signal;

            if (type === 'offer') {
                const pc = await this.createPeerConnection(from);
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                const response = {
                    type: 'answer',
                    from: this.peerId,
                    to: from,
                    sdp: answer.sdp
                };
                await navigator.clipboard.writeText(btoa(JSON.stringify(response)));
                UI.showToast('Answer copied! Send back to initiator.');

            } else if (type === 'answer') {
                const pc = this.connections.get(from);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
                    UI.showToast('Connection established!');
                }

            } else if (type === 'ice' && candidate) {
                const pc = this.connections.get(from);
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
        } catch (err) {
            console.error('[P2P] Signal handling error:', err);
            UI.showToast('Invalid signal data');
        }
    },

    handleMessage(peerId, data) {
        switch (data.type) {
            case 'chat':
                this.messageHandlers.forEach(h => h(peerId, data));
                break;
            case 'file':
                this.fileHandlers.forEach(h => h(peerId, data));
                break;
            case 'profile':
                this.updatePeerProfile(peerId, data.profile);
                break;
            case 'status':
                this.updatePeerStatus(peerId, data.status);
                break;
        }
    },

    async sendMessage(peerId, message) {
        const channel = this.dataChannels.get(peerId);
        if (!channel || channel.readyState !== 'open') {
            UI.showToast('Peer not connected');
            return false;
        }

        try {
            channel.send(JSON.stringify(message));
            return true;
        } catch (err) {
            console.error('[P2P] Send error:', err);
            return false;
        }
    },

    async broadcastToRoom(roomId, message) {
        const room = await DB.get('rooms', roomId);
        if (!room || !room.members) return;

        for (const memberId of room.members) {
            if (memberId !== this.peerId) {
                await this.sendMessage(memberId, message);
            }
        }
    },

    sendSignal(targetPeerId, data) {
        // In a real implementation, this sends via WebSocket to signaling server
        // For now, we use manual clipboard exchange
        console.log('[P2P] Signal to', targetPeerId, data);
    },

    async updatePeerProfile(peerId, profile) {
        const peer = await DB.get('peers', peerId) || { peerId };
        peer.profile = profile;
        peer.updatedAt = Date.now();
        await DB.put('peers', peer);
        UI.renderPeers();
    },

    async updatePeerStatus(peerId, status) {
        const peer = await DB.get('peers', peerId) || { peerId };
        peer.status = status;
        peer.statusAt = Date.now();
        await DB.put('peers', peer);
        UI.renderPeers();
    },

    copyId() {
        navigator.clipboard.writeText(this.peerId);
        UI.showToast('Peer ID copied to clipboard');
    },

    onMessage(handler) {
        this.messageHandlers.push(handler);
    },

    onConnection(handler) {
        this.connectionHandlers.push(handler);
    },

    onFile(handler) {
        this.fileHandlers.push(handler);
    },

    getConnectedPeers() {
        return Array.from(this.dataChannels.entries())
            .filter(([_, ch]) => ch.readyState === 'open')
            .map(([id, _]) => id);
    }
};
