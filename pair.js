const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, jidNormalizedUser } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const express = require('express');

const SESSION_BASE_PATH = './session';
const PAIRING_CODE = process.env.PAIRING_CODE_NAME || 'JAMALITZ';

// Ensure session directory exists
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Store active connections
const activeSessions = new Map();
const sessionCreationTime = new Map();
const sessionHealth = new Map();

// Bot logo and footer
const botLogo = 'https://files.catbox.moe/xney4v.jpg';
const footer = `> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`;

// Welcome message
const getWelcomeMessage = (number) => {
    return `╔════════════════════════════════════════╗
║         JAMALI TECH MD CONNECTED        ║
╚════════════════════════════════════════╝

┌────────────────────────────────────────┐
│  ✅ Bot auto-connected successfully!
│  📞 Number: ${number}
│  👑 Owner: JAMALI TECH EMPIRE
│  💎 Version: 2.0.0
│  
│  📌 Try these commands:
│  • .menu - Show all commands
│  • .alive - Check bot status
│  • .ping - Check speed
│  • .owner - Contact owner
│  • .channel - View channel
└────────────────────────────────────────┘

${footer}`;
};

// Function to connect to WhatsApp
async function connectToWhatsApp(number, res = null) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    console.log(`🔄 Connecting to WhatsApp for: ${sanitizedNumber}`);
    
    try {
        // Check if already connected and active
        if (activeSessions.has(sanitizedNumber)) {
            const existingSocket = activeSessions.get(sanitizedNumber);
            if (existingSocket.user && sessionHealth.get(sanitizedNumber) === 'active') {
                console.log(`✅ Already connected: ${sanitizedNumber}`);
                if (res && !res.headersSent) {
                    return res.json({ status: 'already_connected', message: 'Already connected' });
                }
                return { status: 'already_connected', socket: existingSocket };
            }
        }
        
        // Ensure session directory exists
        fs.ensureDirSync(sessionPath);
        
        // Load auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        // Create WhatsApp socket
        const sock = makeWASocket({
            auth: { creds: state.creds, keys: state.keys },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["JAMALI TECH MD", "Chrome", "120.0.0"],
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            patchHistoryBeforeLastMessage: true
        });
        
        // Store creation time
        sessionCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        
        // Handle connection update
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            console.log(`📡 ${sanitizedNumber} Connection: ${connection}`);
            
            if (connection === 'open') {
                console.log(`✅ AUTO-CONNECTED SUCCESSFULLY: ${sanitizedNumber}`);
                activeSessions.set(sanitizedNumber, sock);
                sessionHealth.set(sanitizedNumber, 'active');
                
                // Send welcome message
                try {
                    const welcomeMsg = getWelcomeMessage(sanitizedNumber);
                    await sock.sendMessage(`${sanitizedNumber}@s.whatsapp.net`, { text: welcomeMsg });
                    console.log(`📨 Welcome message sent to ${sanitizedNumber}`);
                } catch (err) {
                    console.log(`⚠️ Could not send welcome message: ${err.message}`);
                }
                
                // Send image welcome
                try {
                    await sock.sendMessage(`${sanitizedNumber}@s.whatsapp.net`, { 
                        image: { url: botLogo }, 
                        caption: `✨ JAMALI TECH MD is now active!\n\nUse .menu to see all commands.\n\n${footer}`
                    });
                } catch (err) {
                    console.log(`⚠️ Could not send image: ${err.message}`);
                }
                
                if (res && !res.headersSent) {
                    res.json({ status: 'connected', message: 'Bot connected successfully' });
                }
                
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ Connection closed for ${sanitizedNumber}, code: ${statusCode}`);
                activeSessions.delete(sanitizedNumber);
                sessionHealth.set(sanitizedNumber, 'disconnected');
                
                // Auto-reconnect after 10 seconds (except for 401 - invalid session)
                if (statusCode !== 401) {
                    setTimeout(() => {
                        console.log(`🔄 Auto-reconnecting ${sanitizedNumber}...`);
                        connectToWhatsApp(number, null);
                    }, 10000);
                } else {
                    console.log(`❌ Session invalid for ${sanitizedNumber}, need new pairing`);
                    // Delete old session
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                    }
                }
            }
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            console.log(`💾 Credentials saved for ${sanitizedNumber}`);
            
            // Also save to MongoDB if available
            if (global.saveSessionToMongoDB) {
                try {
                    const credData = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
                    await global.saveSessionToMongoDB(sanitizedNumber, credData);
                } catch (err) {
                    console.log(`⚠️ MongoDB save error: ${err.message}`);
                }
            }
        });
        
        // Check if already registered (has existing session)
        if (sock.authState.creds.registered) {
            console.log(`✅ Existing session found for ${sanitizedNumber}, auto-connecting...`);
            if (res && !res.headersSent) {
                res.json({ status: 'connecting', message: 'Using existing session, connecting...' });
            }
            return { status: 'connecting', socket: sock };
        }
        
        // Generate new pairing code for new device
        try {
            await delay(2000);
            const code = await sock.requestPairingCode(sanitizedNumber, PAIRING_CODE);
            console.log(`🔑 PAIRING CODE FOR ${sanitizedNumber}: ${code}`);
            
            if (res && !res.headersSent) {
                res.json({ code: code, status: 'success', pairingName: PAIRING_CODE });
            }
            return { code, socket: sock };
            
        } catch (pairError) {
            console.error(`❌ Pairing error for ${sanitizedNumber}:`, pairError.message);
            if (res && !res.headersSent) {
                res.status(500).json({ error: pairError.message });
            }
            throw pairError;
        }
        
    } catch (error) {
        console.error(`❌ Connection error for ${sanitizedNumber}:`, error);
        if (res && !res.headersSent) {
            res.status(500).json({ error: error.message });
        }
        throw error;
    }
}

// Auto-connect all saved sessions on server start
async function autoConnectSavedSessions() {
    console.log('🔄 Checking for saved sessions to auto-connect...');
    
    try {
        const sessions = fs.readdirSync(SESSION_BASE_PATH);
        let connectedCount = 0;
        
        for (const session of sessions) {
            if (session.startsWith('session_')) {
                const number = session.replace('session_', '');
                // Check if creds.json exists
                const credsPath = path.join(SESSION_BASE_PATH, session, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    console.log(`🔄 Found saved session for: ${number}`);
                    try {
                        await connectToWhatsApp(number, null);
                        connectedCount++;
                        await delay(3000); // Wait between connections to avoid rate limiting
                    } catch (err) {
                        console.log(`⚠️ Could not auto-connect ${number}: ${err.message}`);
                    }
                }
            }
        }
        
        console.log(`✅ Auto-connected ${connectedCount} saved sessions`);
    } catch (error) {
        console.log('📁 No saved sessions found or unable to read session directory');
    }
}

// API endpoint for pairing
async function generatePairCode(req, res) {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`📱 Pairing request for: ${sanitizedNumber}`);
    
    try {
        await connectToWhatsApp(sanitizedNumber, res);
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
        }
    }
}

// Get active sessions
function getActiveSessions() {
    const sessions = [];
    for (const [number, socket] of activeSessions) {
        if (socket.user && sessionHealth.get(number) === 'active') {
            sessions.push({
                number: number,
                status: 'active',
                health: sessionHealth.get(number),
                uptime: Date.now() - (sessionCreationTime.get(number) || Date.now())
            });
        }
    }
    return sessions;
}

// Delete session
async function deleteSession(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    if (activeSessions.has(sanitizedNumber)) {
        const socket = activeSessions.get(sanitizedNumber);
        try {
            socket.ws.close();
        } catch (err) {}
        activeSessions.delete(sanitizedNumber);
    }
    
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
    }
    
    sessionHealth.delete(sanitizedNumber);
    sessionCreationTime.delete(sanitizedNumber);
    
    console.log(`🗑️ Session deleted for: ${sanitizedNumber}`);
    return true;
}

// Export functions
module.exports = { 
    generatePairCode, 
    autoConnectSavedSessions, 
    connectToWhatsApp,
    getActiveSessions,
    deleteSession,
    activeSessions,
    sessionHealth
};
