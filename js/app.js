/**
 * SHADOW-NET MAIN APPLICATION
 * Initialization and global handlers
 */

const App = {
    init() {
        // Initialize database first
        DB.init().then(() => {
            Auth.init();
        }).catch(err => {
            console.error('[App] Init failed:', err);
            alert('Failed to initialize ShadowNet. Check browser compatibility.');
        });

        // Setup global event listeners
        this.setupGlobalHandlers();

        // Setup service worker for offline support
        this.setupServiceWorker();
    },

    setupGlobalHandlers() {
        // Handle paste for signal exchange
        document.addEventListener('paste', async (e) => {
            const text = e.clipboardData.getData('text');
            if (text && text.length > 50 && document.getElementById('modal-add-peer').classList.contains('active')) {
                document.getElementById('peer-id-input').value = text;
            }
        });

        // Handle before unload
        window.addEventListener('beforeunload', () => {
            // Close connections gracefully
            P2P.connections.forEach(pc => pc.close());
        });

        // Handle visibility change (update status)
        document.addEventListener('visibilitychange', () => {
            if (Auth.currentUser) {
                const status = document.hidden ? 'Away' : 'Online';
                // Broadcast status to peers
                P2P.getConnectedPeers().forEach(peerId => {
                    P2P.sendMessage(peerId, {
                        type: 'status',
                        status: status
                    });
                });
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // ESC to close modals
            if (e.key === 'Escape') {
                UI.closeModal();
                if (document.getElementById('chat-panel').classList.contains('active')) {
                    UI.closeChat();
                }
            }

            // Ctrl/Cmd + K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('message-input')?.focus();
            }
        });
    },

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            const swCode = `
                const CACHE_NAME = 'shadownet-v1';
                const urlsToCache = [
                    '/',
                    '/index.html',
                    '/css/style.css',
                    '/js/crypto.js',
                    '/js/db.js',
                    '/js/p2p.js',
                    '/js/vault.js',
                    '/js/chat.js',
                    '/js/ui.js',
                    '/js/settings.js',
                    '/js/auth.js',
                    '/js/app.js'
                ];

                self.addEventListener('install', event => {
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then(cache => cache.addAll(urlsToCache))
                    );
                });

                self.addEventListener('fetch', event => {
                    event.respondWith(
                        caches.match(event.request)
                            .then(response => {
                                if (response) return response;
                                return fetch(event.request);
                            })
                    );
                });
            `;

            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);

            navigator.serviceWorker.register(swUrl).catch(err => {
                console.warn('[App] SW registration failed:', err);
            });
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
