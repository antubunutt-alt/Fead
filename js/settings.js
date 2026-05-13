/**
 * SHADOW-NET SETTINGS MODULE
 * Profile, password, data management
 */

const Settings = {
    currentUser: null,

    init() {
        this.currentUser = Auth.currentUser;
        this.loadProfile();
    },

    loadProfile() {
        const user = this.currentUser;
        document.getElementById('setting-bio').value = user.bio || '';
        document.getElementById('setting-status').value = user.status || '';
    },

    async saveProfile() {
        const bio = document.getElementById('setting-bio').value.trim();
        const status = document.getElementById('setting-status').value.trim();
        const avatarInput = document.getElementById('setting-avatar');

        const updates = {
            bio: bio,
            status: status,
            updatedAt: Date.now()
        };

        // Handle avatar upload
        if (avatarInput.files && avatarInput.files[0]) {
            const file = avatarInput.files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                updates.avatar = e.target.result;
                await this.applyUpdates(updates);
            };
            reader.readAsDataURL(file);
        } else {
            await this.applyUpdates(updates);
        }
    },

    async applyUpdates(updates) {
        const user = await DB.get('users', this.currentUser.username);
        Object.assign(user, updates);
        await DB.put('users', user);

        // Update current user reference
        Auth.currentUser = user;
        this.currentUser = user;

        // Update UI
        document.getElementById('sidebar-username').textContent = user.username;
        document.getElementById('sidebar-status').textContent = status || '● Online';

        if (user.avatar) {
            document.getElementById('user-avatar').innerHTML = `<img src="${user.avatar}" alt="">`;
        }

        // Broadcast profile update to peers
        const connectedPeers = P2P.getConnectedPeers();
        for (const peerId of connectedPeers) {
            await P2P.sendMessage(peerId, {
                type: 'profile',
                profile: {
                    username: user.username,
                    bio: user.bio,
                    avatar: user.avatar,
                    status: user.status
                }
            });
        }

        UI.showToast('Profile updated');
    },

    async changePassword() {
        const currentPass = document.getElementById('curr-password').value;
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        if (!currentPass || !newPass || !confirmPass) {
            UI.showToast('All fields required');
            return;
        }

        if (newPass !== confirmPass) {
            UI.showToast('New passwords do not match');
            return;
        }

        if (newPass.length < 8) {
            UI.showToast('Password min 8 characters');
            return;
        }

        // Verify current password
        const user = await DB.get('users', this.currentUser.username);
        const valid = await Crypto.verifyPassword(currentPass, user.passwordHash);

        if (!valid) {
            UI.showToast('Current password incorrect');
            return;
        }

        // Hash new password
        const newHash = await Crypto.hashPassword(newPass);

        // Re-encrypt vault files with new password
        const files = await DB.getByIndex('vault', 'owner', user.username);
        for (const file of files) {
            try {
                // Decrypt with old password
                const decrypted = await Crypto.decrypt(file.encrypted, currentPass);
                // Re-encrypt with new password
                file.encrypted = await Crypto.encrypt(decrypted, newPass);
                await DB.put('vault', file);
            } catch (e) {
                console.error('[Settings] Failed to re-encrypt file:', file.name);
            }
        }

        // Update user password
        user.passwordHash = newHash;
        await DB.put('users', user);

        // Update session
        Auth.currentUser.password = newPass;
        this.currentUser.password = newPass;

        // Clear inputs
        document.getElementById('curr-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        UI.showToast('Password changed successfully');
    },

    async exportData() {
        try {
            const data = await DB.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `shadownet_backup_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            UI.showToast('Data exported');
        } catch (err) {
            console.error('[Settings] Export error:', err);
            UI.showToast('Export failed');
        }
    },

    async clearAll() {
        if (!confirm('WARNING: This will delete ALL local data including messages, files, and account. This cannot be undone.

Type "DELETE" to confirm:')) return;

        const confirmText = prompt('Type "DELETE" to confirm complete data wipe:');
        if (confirmText !== 'DELETE') {
            UI.showToast('Deletion cancelled');
            return;
        }

        try {
            // Clear all stores
            await DB.clearStore('users');
            await DB.clearStore('messages');
            await DB.clearStore('vault');
            await DB.clearStore('peers');
            await DB.clearStore('rooms');

            // Clear localStorage
            localStorage.clear();

            UI.showToast('All data nuked. Reloading...');
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error('[Settings] Clear error:', err);
            UI.showToast('Failed to clear data');
        }
    }
};
