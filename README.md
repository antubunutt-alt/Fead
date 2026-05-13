# SHADOW-NET // Secure P2P Communication Platform

## Overview
ShadowNet adalah platform komunikasi peer-to-peer (P2P) yang berjalan sepenuhnya di client-side. Tidak ada server pusat yang menyimpan data — semua pesan, file, dan profil dienkripsi dan disimpan secara lokal di perangkat masing-masing user.

## Features
- **🔐 End-to-End Encryption**: AES-256-GCM dengan PBKDF2 key derivation
- **💬 Direct Messaging**: Chat pribadi antar peer via WebRTC DataChannel
- **🌐 Public Rooms**: Broadcast room untuk komunikasi grup
- **🔒 Secure Vault**: Penyimpanan file terenkripsi lokal (IndexedDB)
- **👤 Profile System**: Bio, status, avatar per user
- **📡 P2P Network**: Tanpa server relay untuk pesan (STUN only)
- **📱 Mobile Ready**: Responsive UI, bisa diakses dari HP
- **🌐 GitHub Pages**: Deploy static, no backend required

## Architecture
```
User A (Browser) <--WebRTC--> User B (Browser)
     |                              |
IndexedDB                    IndexedDB
(Encrypted)                  (Encrypted)
```

## Deployment

### 1. GitHub Pages (Recommended)
1. Fork repo ini atau buat repo baru
2. Upload semua file ke root repo
3. Go to Settings > Pages
4. Source: Deploy from branch → main → / (root)
5. Akses via `https://username.github.io/repo-name`

### 2. Local Server (HP sebagai Host)
```bash
# Install Python
pip install http-server

# Jalankan server
python -m http.server 8080

# Akses dari HP lain di network yang sama
# http://[IP-HP-LO]:8080
```

### 3. Termux (Android)
```bash
pkg install nodejs
npm install -g http-server
http-server -p 8080
```

## Usage

### First Time Setup
1. Buka web app
2. Register akun baru (data tersimpan lokal)
3. Copy Peer ID kamu
4. Share Peer ID ke teman via QR atau clipboard
5. Paste Peer ID teman untuk connect

### Connecting Peers
Karena ini pure P2P tanpa signaling server, proses koneksi menggunakan **manual signaling**:
1. Click "Add Peer"
2. Masukkan Peer ID target
3. Copy offer code yang muncul
4. Kirim ke target (WhatsApp, Telegram, QR)
5. Target paste offer → copy answer
6. Paste answer kembali → connected

### File Sharing
1. Upload file ke Vault (auto encrypt)
2. File tersimpan di browser kamu
3. Share file via chat (P2P transfer)
4. Penerima bisa download & decrypt

## Security Notes
- Password tidak pernah dikirim ke server (tidak ada server)
- Enkripsi dilakukan di browser sebelum disimpan
- WebRTC connection menggunakan DTLS-SRTP
- File di vault dienkripsi dengan password user
- Tidak ada backup cloud — data hanya di device

## Tech Stack
- Vanilla JavaScript (ES6+)
- WebRTC API
- IndexedDB (Dexie-like wrapper)
- Web Crypto API
- CSS Grid/Flexbox
- Service Worker (offline support)

## Browser Support
- Chrome/Edge 80+
- Firefox 75+
- Safari 14+
- Android WebView 80+

## License
MIT - Use at your own risk. This is experimental software.
