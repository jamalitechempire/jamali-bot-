// ==================== JAMALI MD - COMPLETE SERVER WITH ADMIN PANEL ====================
const express = require('express');
const session = require('express-session');
const bodyParser = require("body-parser");
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
__path = process.cwd();

// ==================== CONFIGURATION (badilika kama unataka) ====================
const CONFIG = {
    CHANNEL_JID: '120363315296821499@newsletter', // Badilisha na channel yako
    GROUP_LINK: '', // Weka group link ikiwa unataka auto-join
    OWNER_NUMBER: '255784062158',
    BOT_NAME: 'JAMALI TECH MD'
};

// ==================== MIDDLEWARE ====================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__path, 'frontend')));
app.use(session({
    secret: 'jamali-tech-empire-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== CREATE DATA DIRECTORY ====================
const dataDir = path.join(__path, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ==================== ADMIN CREDENTIALS ====================
const ADMINS = [
    { username: 'admin', password: 'jamali123' },
    { username: 'jamali', password: 'tech2025' },
    { username: 'empire', password: 'jamalitech' }
];

// ==================== SESSION STORAGE (in-memory + files) ====================
const activeSockets = new Map();        // number -> socket connection
const socketCreationTime = new Map();   // number -> timestamp
const pendingPairings = new Map();      // number -> array of response objects

// ==================== HELPER FUNCTIONS ====================
function getConnectionStatus(number) {
    const isConnected = activeSockets.has(number);
    const connectionTime = socketCreationTime.get(number);
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

// ==================== AUTO-FOLLOW CHANNEL & AUTO-JOIN GROUP ====================
async function autoFollowNewsletters(conn) {
    try {
        // Follow channel using JID
        if (CONFIG.CHANNEL_JID) {
            console.log(`📰 Kufuata channel: ${CONFIG.CHANNEL_JID}`);
            try {
                await conn.newsletterFollow(CONFIG.CHANNEL_JID);
                console.log(`✅ Imefuata channel: ${CONFIG.CHANNEL_JID}`);
            } catch (err) {
                if (!err.message?.toLowerCase().includes('already')) 
                    console.error(`❌ Kushindwa kufuata channel: ${err.message}`);
            }
        }
        // Join group using link
        if (CONFIG.GROUP_LINK) {
            const inviteCode = CONFIG.GROUP_LINK.split('/').pop()?.split('?')[0];
            if (inviteCode) {
                try {
                    await conn.groupAcceptInvite(inviteCode);
                    console.log(`✅ Imejiunga na group`);
                } catch (err) {
                    console.error(`❌ Kushindwa kujiunga group: ${err.message}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Auto-follow error:', error.message);
    }
}

// ==================== START BOT WITH PAIRING CODE ====================
async function startBot(number, res = null) {
    const cleanNum = number.replace(/[^0-9]/g, '');
    if (cleanNum.length < 9) {
        if (res) return res.status(400).json({ error: 'Namba isiyo sahihi (angalau tarakimu 9)' });
        return;
    }

    if (activeSockets.has(cleanNum)) {
        if (res && !res.headersSent) return res.json({ status: 'already_connected', message: 'Bot tayari imeunganishwa' });
        return;
    }

    if (res) {
        if (!pendingPairings.has(cleanNum)) pendingPairings.set(cleanNum, []);
        pendingPairings.get(cleanNum).push(res);
    }

    const sessionDir = path.join(__path, 'session', cleanNum);
    const credsPath = path.join(sessionDir, 'creds.json');
    const hasExistingSession = await fs.pathExists(credsPath);

    await fs.ensureDir(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const conn = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: false,
        usePairingCode: !hasExistingSession,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Safari')
    });

    activeSockets.set(cleanNum, conn);
    socketCreationTime.set(cleanNum, Date.now());

    conn.ev.on('creds.update', async () => {
        await saveCreds();
        console.log(`🔐 Credentials saved for ${cleanNum}`);
    });

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(`✅ Bot imeunganishwa: ${cleanNum}`);
            // Auto-follow after connection
            setTimeout(() => autoFollowNewsletters(conn), 3000);
            
            const pending = pendingPairings.get(cleanNum);
            if (pending) {
                pending.forEach(p => {
                    if (p && !p.headersSent) p.json({ status: 'connected', message: 'Bot imeunganishwa successfully' });
                });
                pendingPairings.delete(cleanNum);
            }
        }
        if (connection === 'close') {
            activeSockets.delete(cleanNum);
            socketCreationTime.delete(cleanNum);
            console.log(`⚠️ Connection closed for ${cleanNum}`);
            if (lastDisconnect?.error?.output?.statusCode === 401) {
                await fs.remove(sessionDir);
                console.log(`🔐 Session logged out for ${cleanNum}`);
            }
        }
    });

    if (!hasExistingSession) {
        setTimeout(async () => {
            try {
                const code = await conn.requestPairingCode(cleanNum);
                console.log(`🔑 Pairing code for ${cleanNum}: ${code}`);
                const pending = pendingPairings.get(cleanNum);
                if (pending) {
                    pending.forEach(p => {
                        if (p && !p.headersSent) p.json({ code });
                    });
                    pendingPairings.delete(cleanNum);
                }
            } catch (err) {
                console.error(`❌ Pairing code error: ${err.message}`);
                const pending = pendingPairings.get(cleanNum);
                if (pending) {
                    pending.forEach(p => {
                        if (p && !p.headersSent) p.status(500).json({ error: err.message });
                    });
                    pendingPairings.delete(cleanNum);
                }
            }
        }, 2000);
    } else {
        const pending = pendingPairings.get(cleanNum);
        if (pending) {
            pending.forEach(p => {
                if (p && !p.headersSent) p.json({ status: 'reconnected', message: 'Using existing session' });
            });
            pendingPairings.delete(cleanNum);
        }
    }
}

// ==================== API ROUTES ====================

// Admin login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = ADMINS.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.loggedIn = true;
        req.session.user = username;
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/check-session', (req, res) => {
    res.json({ loggedIn: !!(req.session && req.session.loggedIn), user: req.session.user || null });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out' });
});

// PAIRING API - hii ndiyo muhimu!
app.get('/api/pair', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number parameter is required' });
    console.log(`📱 Pairing request for: ${number}`);
    await startBot(number, res);
});

// Socket status API
app.get('/api/socket-status', (req, res) => {
    res.json({ 
        connected: activeSockets.size > 0,
        activeBots: Array.from(activeSockets.keys()),
        timestamp: new Date().toISOString()
    });
});

// Get all active bots (admin only)
app.get('/api/active-bots', (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'Unauthorized' });
    const bots = [];
    for (let [num, sock] of activeSockets.entries()) {
        bots.push({
            number: num,
            connected: true,
            uptime: Math.floor((Date.now() - socketCreationTime.get(num)) / 1000)
        });
    }
    res.json({ bots });
});

// Disconnect a bot (admin only)
app.post('/api/disconnect', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'Unauthorized' });
    const { number } = req.body;
    const sock = activeSockets.get(number);
    if (sock) {
        await sock.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
        res.json({ success: true, message: `Bot ${number} disconnected` });
    } else {
        res.status(404).json({ error: 'Bot not found' });
    }
});

// ==================== FRONTEND ROUTES ====================
function authMiddleware(req, res, next) {
    if (req.session && req.session.loggedIn === true) next();
    else res.redirect('/login');
}

app.get('/', (req, res) => res.sendFile(path.join(__path, 'frontend', 'index.html')));
app.get('/pair', (req, res) => res.sendFile(path.join(__path, 'frontend', 'pair.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__path, 'frontend', 'login.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__path, 'frontend', 'settings.html')));
app.get('/admin', authMiddleware, (req, res) => res.sendFile(path.join(__path, 'frontend', 'admin.html')));

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'active', 
        bot: 'JAMALI TECH MD',
        version: '3.0.0',
        uptime: process.uptime(),
        whatsappConnected: activeSockets.size > 0,
        activeBots: activeSockets.size
    });
});

// ==================== START SERVER ====================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║      🔐 JAMALI TECH MD SERVER v3.0 🔐                       ║
║                                                              ║
║      🚀 Server: http://localhost:${PORT}                     ║
║      🔗 Pairing: http://localhost:${PORT}/pair              ║
║      📡 Pair API: /api/pair?number=255XXXXXX                ║
║      👑 Owner: ${CONFIG.OWNER_NUMBER}                       ║
║                                                              ║
║      ✅ Auto-follow channel & auto-join group active        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    for (const sock of activeSockets.values()) await sock.ws.close();
    server.close(() => process.exit(0));
});

module.exports = { app };