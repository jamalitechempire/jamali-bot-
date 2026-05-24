const { default: makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');

const SESSION_BASE_PATH = './session';
const PAIRING_CODE = process.env.PAIRING_CODE_NAME || 'JAMALITZ';

// Ensure session directory exists
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
        fs.ensureDirSync(sessionPath);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const sock = makeWASocket({
            auth: { creds: state.creds, keys: state.keys },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS("Desktop"),
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000
        });
        
        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(sanitizedNumber, PAIRING_CODE);
            console.log(`✅ Pairing code for ${sanitizedNumber}: ${code}`);
            
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    console.log(`✅ Device connected: ${sanitizedNumber}`);
                }
            });
            
            return res.json({ 
                code: code, 
                status: 'success',
                message: 'Pairing code generated successfully'
            });
        } else {
            return res.json({ 
                status: 'already_connected', 
                message: 'Device already connected' 
            });
        }
    } catch (error) {
        console.error(`❌ Pairing failed:`, error);
        return res.status(500).json({ 
            error: error.message, 
            status: 'error',
            message: 'Failed to generate pairing code'
        });
    }
}

module.exports = generatePairCode;
