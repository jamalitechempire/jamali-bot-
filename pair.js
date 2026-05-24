const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

const SESSION_BASE_PATH = './session';
const PAIRING_CODE = process.env.PAIRING_CODE_NAME || 'JAMALITZ';

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Store active connections
const activeSessions = new Map();

async function connectToWhatsApp(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    console.log(`🔄 Connecting to WhatsApp for: ${sanitizedNumber}`);
    
    try {
        // Check if already connected
        if (activeSessions.has(sanitizedNumber)) {
            const existingSocket = activeSessions.get(sanitizedNumber);
            if (existingSocket.user) {
                console.log(`✅ Already connected: ${sanitizedNumber}`);
                return { status: 'already_connected', socket: existingSocket };
            }
        }
        
        fs.ensureDirSync(sessionPath);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
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
        
        // Handle connection update
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            console.log(`📡 ${sanitizedNumber} Connection: ${connection}`);
            
            if (connection === 'open') {
                console.log(`✅ AUTO-CONNECTED: ${sanitizedNumber}`);
                activeSessions.set(sanitizedNumber, sock);
                
                // Send welcome message
                const welcomeMsg = `╔════════════════════════════════════════╗
║         JAMALI TECH MD CONNECTED        ║
╚════════════════════════════════════════╝

┌────────────────────────────────────────┐
│  ✅ Bot auto-connected successfully!
│  
│  📌 Try these commands:
│  • .menu - Show all commands
│  • .alive - Check bot status
│  • .ping - Check speed
│  
│  👑 Owner: JAMALI TECH EMPIRE
│  📞 Support: wa.me/255784062158
└────────────────────────────────────────┘

> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`;
                
                try {
                    await sock.sendMessage(`${sanitizedNumber}@s.whatsapp.net`, { text: welcomeMsg });
                } catch (err) {
                    console.log('Welcome message error:', err.message);
                }
                
                if (res && !res.headersSent) {
                    res.json({ status: 'connected', message: 'Bot connected successfully' });
                }
                
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ Connection closed for ${sanitizedNumber}, code: ${statusCode}`);
                activeSessions.delete(sanitizedNumber);
                
                // Auto-reconnect after 5 seconds
                if (statusCode !== 401) {
                    setTimeout(() => {
                        console.log(`🔄 Auto-reconnecting ${sanitizedNumber}...`);
                        connectToWhatsApp(number, null);
                    }, 5000);
                }
            }
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            console.log(`💾 Credentials saved for ${sanitizedNumber}`);
        });
        
        // Check if already registered (has session)
        if (sock.authState.creds.registered) {
            console.log(`✅ Session found for ${sanitizedNumber}, auto-connecting...`);
            // No need to generate pairing code, just wait for connection
            if (res && !res.headersSent) {
                res.json({ status: 'connecting', message: 'Using existing session, connecting...' });
            }
            return { status: 'connecting', socket: sock };
        }
        
        // Generate pairing code for new device
        try {
            await delay(2000);
            const code = await sock.requestPairingCode(sanitizedNumber, PAIRING_CODE);
            console.log(`🔑 Pairing code for ${sanitizedNumber}: ${code}`);
            
            if (res && !res.headersSent) {
                res.json({ code: code, status: 'success', pairingName: PAIRING_CODE });
            }
            return { code, socket: sock };
            
        } catch (pairError) {
            console.error(`❌ Pairing error:`, pairError.message);
            if (res && !res.headersSent) {
                res.status(500).json({ error: pairError.message });
            }
            throw pairError;
        }
        
    } catch (error) {
        console.error(`❌ Connection error:`, error);
        if (res && !res.headersSent) {
            res.status(500).json({ error: error.message });
        }
        throw error;
    }
}

// For API endpoint
async function generatePairCode(req, res) {
    const { number } = req.query;
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    try {
        await connectToWhatsApp(number, res);
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}

// Auto-connect on server start (for saved sessions)
async function autoConnectSavedSessions() {
    console.log('🔄 Checking for saved sessions...');
    
    try {
        const sessions = fs.readdirSync(SESSION_BASE_PATH);
        for (const session of sessions) {
            if (session.startsWith('session_')) {
                const number = session.replace('session_', '');
                console.log(`🔄 Auto-connecting saved session: ${number}`);
                await connectToWhatsApp(number, null);
                await delay(3000); // Wait between connections
            }
        }
    } catch (error) {
        console.log('No saved sessions found');
    }
}

module.exports = { generatePairCode, autoConnectSavedSessions, connectToWhatsApp };
