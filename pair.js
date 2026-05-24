const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

const SESSION_BASE_PATH = './session';
const PAIRING_CODE = process.env.PAIRING_CODE_NAME || 'JAMALITZ';

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

async function generatePairCode(req, res) {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    console.log(`🔄 Generating pairing code for: ${sanitizedNumber}`);
    
    try {
        // Delete existing session if any to avoid conflicts
        if (fs.existsSync(sessionPath)) {
            console.log(`🗑️ Removing old session for ${sanitizedNumber}`);
            fs.removeSync(sessionPath);
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
            syncFullHistory: false
        });
        
        if (!sock.authState.creds.registered) {
            // Try multiple times to get pairing code
            let code = null;
            let attempts = 3;
            
            while (attempts > 0 && !code) {
                try {
                    await delay(2000);
                    code = await sock.requestPairingCode(sanitizedNumber, PAIRING_CODE);
                    console.log(`✅ Pairing code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (err) {
                    attempts--;
                    console.log(`⚠️ Attempt failed, retries left: ${attempts}`);
                    if (attempts === 0) throw err;
                    await delay(3000);
                }
            }
            
            // Send response immediately
            if (code) {
                res.json({ code: code, status: 'success', pairingName: PAIRING_CODE });
            } else {
                throw new Error('Failed to generate pairing code');
            }
            
            // Handle connection events
            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log(`💾 Credentials saved for ${sanitizedNumber}`);
            });
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                console.log(`📡 Connection update for ${sanitizedNumber}: ${connection}`);
                
                if (connection === 'open') {
                    console.log(`✅ DEVICE CONNECTED SUCCESSFULLY: ${sanitizedNumber}`);
                    
                    // Send welcome message to the connected device
                    const welcomeMessage = `╔════════════════════════════════════════╗
║         JAMALI TECH MD CONNECTED        ║
╚════════════════════════════════════════╝

┌────────────────────────────────────────┐
│  ✅ Bot connected successfully!
│  
│  📌 Try these commands:
│  • .menu - Show all commands
│  • .alive - Check bot status
│  • .ping - Check speed
│  • .owner - Contact owner
│  
│  👑 Owner: JAMALI TECH EMPIRE
│  📞 Support: wa.me/255784062158
└────────────────────────────────────────┘

> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`;
                    
                    try {
                        await sock.sendMessage(`${sanitizedNumber}@s.whatsapp.net`, { text: welcomeMessage });
                    } catch (err) {
                        console.log('Could not send welcome message');
                    }
                    
                } else if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) {
                        console.log(`❌ Session expired for ${sanitizedNumber}`);
                    } else {
                        console.log(`🔄 Connection closed for ${sanitizedNumber}, will retry`);
                    }
                }
            });
            
        } else {
            res.json({ status: 'already_connected', message: 'Device already connected' });
        }
        
    } catch (error) {
        console.error(`❌ Pairing failed:`, error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: error.message, 
                status: 'error',
                message: 'Failed to generate pairing code. Please try again.'
            });
        }
    }
}

module.exports = generatePairCode;
