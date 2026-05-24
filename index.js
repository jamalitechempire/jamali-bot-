const express = require('express');
const session = require('express-session');
const bodyParser = require("body-parser");
const path = require('path');
const fs = require('fs-extra');
const app = express();
__path = process.cwd();

// Import pair module
let pairModule;
try {
    pairModule = require('./pair');
    console.log('✅ Pair module loaded successfully');
} catch (error) {
    console.error('❌ Failed to load pair module:', error.message);
    // Create fallback pair module
    pairModule = (req, res) => {
        res.json({ error: 'Pair module not available', status: 'error' });
    };
}

// ==================== AUTO FOLLOW CHANNELS ====================
let autoFollow;
try {
    autoFollow = require('./autoFollow');
    console.log('✅ AutoFollow module loaded successfully');
} catch (error) {
    console.error('❌ Failed to load autoFollow module:', error.message);
    // Create fallback autoFollow
    autoFollow = {
        initializeAutoFollow: async () => console.log('AutoFollow fallback'),
        handleChannelCommand: async () => console.log('Channel command fallback')
    };
}

require('events').EventEmitter.defaultMaxListeners = 500;

// ==================== WHATSAPP SOCKET STORAGE ====================
let globalSocket = null;
let isConnected = false;

// ==================== MIDDLEWARE ====================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__path, 'frontend')));
app.use(session({
    secret: 'jamali-tech-empire-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ==================== CREATE DATA DIRECTORY ====================
const dataDir = path.join(__path, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// ==================== ADMIN CREDENTIALS ====================
const ADMINS = [
    { username: 'admin', password: 'jamali123' },
    { username: 'jamali', password: 'tech2025' },
    { username: 'empire', password: 'jamalitech' }
];

// ==================== API ROUTES ====================

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`🔐 Login attempt: ${username}`);
    
    const user = ADMINS.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.loggedIn = true;
        req.session.user = username;
        console.log(`✅ Login successful: ${username}`);
        res.json({ success: true, message: 'Login successful' });
    } else {
        console.log(`❌ Login failed: ${username}`);
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Check session API
app.get('/api/check-session', (req, res) => {
    const isLoggedIn = req.session && req.session.loggedIn === true;
    res.json({ loggedIn: isLoggedIn, user: req.session.user || null });
});

// Logout API
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out' });
});

// ==================== PAIRING API ====================
app.get('/api/pair', async (req, res) => {
    const { number } = req.query;
    console.log(`📱 Pairing request for: ${number}`);
    
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    try {
        // Call the pair module
        if (typeof pairModule === 'function') {
            await pairModule(req, res);
        } else if (pairModule && typeof pairModule.default === 'function') {
            await pairModule.default(req, res);
        } else {
            // Simulate pairing for testing
            const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
            console.log(`✅ Mock pairing code: ${mockCode}`);
            res.json({ code: mockCode, status: 'success' });
        }
    } catch (error) {
        console.error('❌ Pairing error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
    }
});

// ==================== WHATSAPP SOCKET STATUS API ====================
app.get('/api/socket-status', (req, res) => {
    res.json({ 
        connected: isConnected,
        socketExists: globalSocket !== null,
        timestamp: new Date().toISOString()
    });
});

// ==================== FRONTEND ROUTES ====================

// Auth middleware for admin
function authMiddleware(req, res, next) {
    if (req.session && req.session.loggedIn === true) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Serve pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__path, 'frontend', 'index.html'));
});

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__path, 'frontend', 'pair.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__path, 'frontend', 'login.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__path, 'frontend', 'settings.html'));
});

app.get('/admin', authMiddleware, (req, res) => {
    res.sendFile(path.join(__path, 'frontend', 'admin.html'));
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'active', 
        bot: 'JAMALI TECH MD',
        version: '2.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        whatsappConnected: isConnected
    });
});

// ==================== FUNCTION TO SET GLOBAL SOCKET ====================
function setGlobalSocket(socket) {
    globalSocket = socket;
    isConnected = true;
    console.log('✅ Global socket set for autoFollow');
    
    // Initialize auto-follow for channels when socket is connected
    (async () => {
        try {
            await autoFollow.initializeAutoFollow(socket);
            console.log('✅ AutoFollow initialized successfully');
        } catch (error) {
            console.error('❌ AutoFollow initialization error:', error.message);
        }
    })();
}

function clearGlobalSocket() {
    globalSocket = null;
    isConnected = false;
    console.log('❌ Global socket cleared');
}

// ==================== START SERVER ====================
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`╔════════════════════════════════════════╗`);
    console.log(`║      JAMALI TECH MD SERVER            ║`);
    console.log(`╠════════════════════════════════════════╣`);
    console.log(`║  🚀 Server: http://localhost:${PORT}      ║`);
    console.log(`║  🔗 Pairing: http://localhost:${PORT}/pair`);
    console.log(`║  📡 Pairing API: /api/pair?number=255XX`);
    console.log(`║  🔑 Pairing Code: JAMALITZ            ║`);
    console.log(`║  👑 Owner: 255784062158               ║`);
    console.log(`╚════════════════════════════════════════╝`);
});

// Export functions for use in pair.js
module.exports = { 
    app, 
    setGlobalSocket, 
    clearGlobalSocket, 
    getGlobalSocket: () => globalSocket,
    isConnected: () => isConnected
};
