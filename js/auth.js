/**
 * SHADOW-NET AUTH MODULE
 * Registration, login, session management
 */

const Auth = {
    currentUser: null,
    sessionKey: null,

    async init() {
        await DB.init();

        // Check for existing session
        const session = localStorage.getItem('shadownet_session');
        if (session) {
            try {
                const data = JSON.parse(session);
                const user = await DB.get('users', data.username);
                if (user && data.token === await this.generateToken(user)) {
                    this.currentUser = user;
                    this.sessionKey = data.token;
                    UI.showMain();
                    P2P.init();
                    Chat.init();
                    Vault.init();
                    Settings.init();
                    return;
                }
            } catch (e) {
                console.error('[Auth] Session restore failed:', e);
            }
        }

        UI.showAuth();
    },

    async register() {
        const username = document.getElementById('reg-username').value.trim().toLowerCase();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;

        if (!username || !password) {
            UI.showToast('All fields required');
            return;
        }

        if (password !== confirm) {
            UI.showToast('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            UI.showToast('Password min 8 characters');
            return;
        }

        if (!/^[a-z0-9_]+$/.test(username)) {
            UI.showToast('Username: a-z, 0-9, underscore only');
            return;
        }

        // Check if user exists
        const existing = await DB.get('users', username);
        if (existing) {
            UI.showToast('Username already taken');
            return;
        }

        try {
            const passwordHash = await Crypto.hashPassword(password);
            const peerId = Crypto.generatePeerId();

            const user = {
                username: username,
                passwordHash: passwordHash,
                peerId: peerId,
                createdAt: Date.now(),
                bio: '',
                status: '',
                avatar: null
            };

            await DB.put('users', user);

            // Auto login
            await this.loginUser(user, password);
            UI.showToast('Account created. Welcome to ShadowNet.');

        } catch (err) {
            console.error('[Auth] Registration error:', err);
            UI.showToast('Registration failed');
        }
    },

    async login() {
        const username = document.getElementById('login-username').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            UI.showToast('Enter username and password');
            return;
        }

        const user = await DB.get('users', username);
        if (!user) {
            UI.showToast('User not found');
            return;
        }

        const valid = await Crypto.verifyPassword(password, user.passwordHash);
        if (!valid) {
            UI.showToast('Invalid password');
            return;
        }

        await this.loginUser(user, password);
    },

    async loginUser(user, password) {
        this.currentUser = user;
        this.currentUser.password = password; // Store for encryption ops

        const token = await this.generateToken(user);
        this.sessionKey = token;

        localStorage.setItem('shadownet_session', JSON.stringify({
            username: user.username,
            token: token,
            peerId: user.peerId
        }));

        UI.showMain();
        P2P.init();
        Chat.init();
        Vault.init();
        Settings.init();
    },

    async generateToken(user) {
        const data = user.username + user.peerId + user.createdAt;
        const encoder = new TextEncoder();
        const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
        return Crypto.arrayBufferToBase64(hash);
    },

    logout() {
        this.currentUser = null;
        this.sessionKey = null;
        localStorage.removeItem('shadownet_session');

        // Close all P2P connections
        P2P.connections.forEach(pc => pc.close());
        P2P.connections.clear();
        P2P.dataChannels.clear();

        UI.showAuth();
        UI.showToast('Disconnected');
    }
};
