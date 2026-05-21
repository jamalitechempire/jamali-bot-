const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const { sendTranslations } = require("./data/sendTranslations");

// LOAD ENV FIRST
if (fs.existsSync('2nd_dev_config.env')) {
    require('dotenv').config({ path: './2nd_dev_config.env' });
} else if (fs.existsSync('.env')) {
    require('dotenv').config();
}

const { sms } = require("./msg");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

// ===== IMPORT SILA FUNCTIONS =====
const {
    config, footer, logo, caption, botName, mainSite,
    activeSockets, socketCreationTime, disconnectionTime, sessionHealth,
    reconnectionAttempts, pendingSaves, restoringNumbers, sessionConnectionStatus,
    isSessionActive, formatMessage,
    updateAboutStatus,
    loadUserConfig, updateUserConfig
} = require('./sila/silafunctions');

// ===== IMPORT ANTILINK =====
const { setupAntilink, getAntilinkStatus } = require('./sila/silalink');

// ===== MONGODB CONFIGURATION =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sila_md:sila0022@sila.67mxtd7.mongodb.net/';

console.log('🚀 SILA MD Bot Starting...');

// ===== DISABLE EXPRESS MEMORYSTORE WARNING =====
// Set express to production mode to remove MemoryStore warning
process.env.NODE_ENV = 'production';

// Auto-management intervals
let autoSaveInterval;
let mongoSyncInterval;

// MongoDB Connection state
let mongoConnected = false;
let mongoRetryCount = 0;
const MAX_MONGO_RETRIES = 5;

// Connection tracking
const RECONNECT_COOLDOWN = new Map();
const WELCOME_SENT = new Set();
const allSessions = new Map();

// ===== MONGODB SCHEMAS =====
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    sessionData: { type: Object, required: true },
    status: { type: String, default: 'active', index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    health: { type: String, default: 'active' }
});

const userConfigSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    config: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

let Session;
let UserConfig;

// ===== MONGODB CONNECTION =====
async function connectMongoDB() {
    try {
        // Check if already connected
        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB already connected');
            mongoConnected = true;
            return true;
        }
        
        console.log('🔄 Connecting to MongoDB...');
        console.log(`URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
        
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            minPoolSize: 2,
            retryWrites: true,
            w: 'majority',
        });
        
        mongoConnected = true;
        mongoRetryCount = 0;
        console.log('✅ MongoDB Atlas Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
        
        // Initialize models
        try {
            Session = mongoose.model('Session');
        } catch {
            Session = mongoose.model('Session', sessionSchema);
        }
        
        try {
            UserConfig = mongoose.model('UserConfig');
        } catch {
            UserConfig = mongoose.model('UserConfig', userConfigSchema);
        }
        
        // Create indexes
        await Session.createIndexes();
        await UserConfig.createIndexes();
        
        // Get session count
        const count = await Session.countDocuments();
        console.log(`📦 Stored Sessions: ${count}`);
        
        return true;
        
    } catch (error) {
        mongoConnected = false;
        mongoRetryCount++;
        console.error(`❌ MongoDB Error (attempt ${mongoRetryCount}/${MAX_MONGO_RETRIES}):`, error.message);
        
        if (mongoRetryCount < MAX_MONGO_RETRIES) {
            const retryDelay = mongoRetryCount * 5000;
            console.log(`🔄 Retrying in ${retryDelay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return await connectMongoDB();
        } else {
            console.log('⚠️ MongoDB unavailable - running without database');
            console.log('💡 Sessions will be saved locally only');
            return false;
        }
    }
}

// MongoDB event handlers
mongoose.connection.on('connected', () => {
    console.log('📊 MongoDB Connected Event');
    mongoConnected = true;
    mongoRetryCount = 0;
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Error Event:', err.message);
    mongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB Disconnected - Will retry...');
    mongoConnected = false;
    setTimeout(connectMongoDB, 5000);
});

// ===== MONGODB CRUD OPERATIONS =====
async function saveSessionToMongoDB(number, sessionData) {
    if (!mongoConnected || !Session) return false;
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                sessionData,
                status: 'active',
                updatedAt: new Date(),
                lastActive: new Date(),
                health: 'active'
            },
            { upsert: true, new: true }
        );
        console.log(`💾 Saved: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Save error ${number}:`, error.message);
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    if (!mongoConnected || !Session) return null;
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        if (session) {
            console.log(`📂 Loaded: ${sanitizedNumber}`);
            return session.sessionData;
        }
        return null;
    } catch (error) {
        console.error(`❌ Load error ${number}:`, error.message);
        return null;
    }
}

async function updateSessionStatusInMongoDB(number, status, health = null) {
    if (!mongoConnected || !Session) return false;
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const updateData = { status, updatedAt: new Date() };
        if (health) updateData.health = health;
        if (status === 'active') updateData.lastActive = new Date();
        
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            updateData,
            { upsert: false }
        );
        return true;
    } catch (error) {
        return false;
    }
}

async function deleteSessionFromMongoDB(number) {
    if (!mongoConnected || !Session) return false;
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: sanitizedNumber });
        if (UserConfig) await UserConfig.deleteOne({ number: sanitizedNumber });
        console.log(`🗑️ MongoDB Deleted: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        return false;
    }
}

// ===== COMMAND LOADER =====
const commands = new Map();

function loadCommands() {
    const commandsDir = path.join(__dirname, 'silatech');
    if (!fs.existsSync(commandsDir)) {
        console.warn('⚠️ Creating silatech/ folder...');
        fs.ensureDirSync(commandsDir);
        return;
    }

    commands.clear();
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    
    for (const file of files) {
        try {
            const cmdPath = path.join(commandsDir, file);
            delete require.cache[require.resolve(cmdPath)];
            const cmdModule = require(cmdPath);
            
            if (cmdModule?.pattern && typeof cmdModule.handler === 'function') {
                commands.set(cmdModule.pattern, cmdModule);
                
                if (cmdModule.alias?.length) {
                    cmdModule.alias.forEach(alias => commands.set(alias, cmdModule));
                }
                
                console.log(`✅ ${cmdModule.pattern}`);
            }
        } catch (e) {
            console.error(`❌ ${file}:`, e.message);
        }
    }
    console.log(`📦 ${commands.size} commands loaded`);
}

// ===== INITIALIZE DIRECTORIES =====
function initializeDirectories() {
    const dirs = [config.SESSION_BASE_PATH, './temp', './setting', './silatech'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created: ${dir}`);
        }
    });
}

initializeDirectories();
loadCommands();

// ===== SESSION HELPERS =====
async function saveSessionLocally(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(sessionData, null, 2));
        return true;
    } catch (error) {
        return false;
    }
}

// ===== EVENT HANDLERS =====
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || config.AUTO_REACT_NEWSLETTERS !== 'true') return;
        
        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid || message.key.remoteJid?.includes(jid)
        );
        if (!isNewsletter) return;
        
        try {
            const emoji = config.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)
            ];
            const msgId = message.newsletterServerId;
            if (msgId) await socket.newsletterReactMessage(message.key.remoteJid, msgId.toString(), emoji);
        } catch (error) {}
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
        
        try {
            if (config.AUTO_VIEW_STATUS === 'true') {
                await socket.readMessages([message.key]);
            }
            if (config.AUTO_LIKE_STATUS === 'true') {
                const emoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                await socket.sendMessage(
                    message.key.remoteJid,
                    { react: { text: emoji, key: message.key } },
                    { statusJidList: [message.key.participant] }
                );
            }
        } catch (error) {}
    });
}

async function setupStatusSavers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        try {
            if (message.message?.extendedTextMessage?.contextInfo) {
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;
                
                if (sendTranslations.includes(replyText) && 
                    quotedInfo?.participant?.endsWith('@s.whatsapp.net') && 
                    quotedInfo?.remoteJid === "status@broadcast") {
                    
                    const senderJid = message.key?.remoteJid;
                    if (!senderJid?.includes('@')) return;
                    
                    const quotedMsg = quotedInfo.quotedMessage;
                    if (!quotedMsg) return;
                    
                    const mediaType = Object.keys(quotedMsg)[0];
                    if (!mediaType || !quotedMsg[mediaType]) return;
                    
                    let caption = quotedMsg[mediaType]?.caption || quotedMsg?.conversation || "";
                    const stream = await downloadContentFromMessage(quotedMsg[mediaType], mediaType.replace("Message", ""));
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    
                    if (mediaType === "imageMessage") {
                        await socket.sendMessage(senderJid, { image: buffer, caption });
                    } else if (mediaType === "videoMessage") {
                        await socket.sendMessage(senderJid, { video: buffer, caption });
                    } else if (mediaType === "audioMessage") {
                        await socket.sendMessage(senderJid, { audio: buffer, mimetype: 'audio/mp4' });
                    }
                }
            }
        } catch (error) {}
    });
}

// ===== COMMAND HANDLER =====
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg?.message) return;
            
            const from = msg.key.remoteJid;
            if (!from || from === 'status@broadcast') return;
            if (config.NEWSLETTER_JIDS.includes(from)) return;
            
            const m = sms(socket, msg);
            const sender = from;
            const prefix = config.PREFIX || '.';
            
            let text = '';
            if (msg.message?.conversation) text = msg.message.conversation;
            else if (msg.message?.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            else if (msg.message?.imageMessage?.caption) text = msg.message.imageMessage.caption;
            else if (msg.message?.videoMessage?.caption) text = msg.message.videoMessage.caption;
            
            if (!text.startsWith(prefix)) return;
            
            const parts = text.slice(prefix.length).trim().split(/\s+/);
            if (!parts[0]) return;
            
            const command = parts[0].toLowerCase();
            const args = parts.slice(1);
            
            const cmdModule = commands.get(command);
            
            if (cmdModule?.handler) {
                await cmdModule.handler(socket, m, sender, args, prefix, number);
                console.log(`✅ .${command}`);
            }
        } catch (error) {
            console.error('Command error:', error.message);
        }
    });
}

// ===== MAIN PAIRING FUNCTION =====
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    // Cooldown check
    const cooldown = RECONNECT_COOLDOWN.get(sanitizedNumber);
    if (cooldown && Date.now() - cooldown < 30000) {
        if (res && !res.headersSent) res.send({ status: 'cooldown' });
        return null;
    }
    
    // Already connected check
    if (activeSockets.has(sanitizedNumber) && isSessionActive(sanitizedNumber)) {
        if (res && !res.headersSent) res.send({ status: 'connected' });
        return activeSockets.get(sanitizedNumber);
    }
    
    RECONNECT_COOLDOWN.set(sanitizedNumber, Date.now());
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    console.log(`🔄 ${sanitizedNumber}`);

    try {
        fs.ensureDirSync(sessionPath);
        
        // Try MongoDB restore
        if (mongoConnected) {
            const data = await loadSessionFromMongoDB(sanitizedNumber);
            if (data) {
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(data, null, 2));
                console.log(`✅ Restored: ${sanitizedNumber}`);
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: 'fatal' });

        const socket = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            printQRInTerminal: false,
            logger,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');
        
        allSessions.set(sanitizedNumber, {
            number: sanitizedNumber,
            status: 'connecting',
            connectedAt: new Date().toISOString(),
            health: 'connecting'
        });

        setupCommandHandlers(socket, sanitizedNumber);
        setupStatusHandlers(socket);
        setupStatusSavers(socket);
        setupNewsletterHandlers(socket);
        setupAntilink(socket);

        if (!socket.authState.creds.registered) {
            try {
                await delay(2000);
                const code = await socket.requestPairingCode(sanitizedNumber, "SILAMINI");
                console.log(`📱 Code: ${code}`);
                if (res && !res.headersSent) res.send({ code });
            } catch (error) {
                if (res && !res.headersSent) res.status(500).send({ error: 'Failed' });
                RECONNECT_COOLDOWN.delete(sanitizedNumber);
                return null;
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            if (mongoConnected) {
                try {
                    const credsPath = path.join(sessionPath, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        await saveSessionToMongoDB(sanitizedNumber, data);
                    }
                } catch (error) {}
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            sessionConnectionStatus.set(sanitizedNumber, connection);
            
            if (connection === 'open') {
                console.log(`✅ Open: ${sanitizedNumber}`);
                
                activeSockets.set(sanitizedNumber, socket);
                sessionHealth.set(sanitizedNumber, 'active');
                sessionConnectionStatus.set(sanitizedNumber, 'open');
                disconnectionTime.delete(sanitizedNumber);
                reconnectionAttempts.delete(sanitizedNumber);
                
                allSessions.set(sanitizedNumber, {
                    number: sanitizedNumber,
                    status: 'active',
                    connectedAt: allSessions.get(sanitizedNumber)?.connectedAt || new Date().toISOString(),
                    lastActive: new Date().toISOString(),
                    health: 'active'
                });
                
                // Auto-follow newsletters
                for (const jid of config.NEWSLETTER_JIDS) {
                    try { await socket.newsletterFollow(jid); } catch (e) {}
                }
                
                try { await updateAboutStatus(socket); } catch (e) {}
                
                // Welcome message (once)
                if (!WELCOME_SENT.has(sanitizedNumber)) {
                    WELCOME_SENT.add(sanitizedNumber);
                    try {
                        const userJid = jidNormalizedUser(socket.user.id);
                        await socket.sendMessage(userJid, {
                            text: `🌸 *SILA MD CONNECTED* 🌸\n◈━◈━◈━◈━◈━◈━◈━◈━◈━\n◈🌸 *Number*: ${sanitizedNumber}\n◈🌸 *Status*: Active ✅\n◈🌸 *Storage*: ${mongoConnected ? 'MongoDB ✅' : 'Local 💾'}\n◈🌸 *Antilink*: ${config.ANTILINK_ENABLED === 'true' ? 'ON 🛡️' : 'OFF'}\n\n◈🌸 *.menu* - Commands\n◈🌸 *.alive* - Status\n◈🌸 *.ping* - Speed\n◈━◈━◈━◈━◈━◈━◈━◈━◈━\n${footer}`
                        });
                        setTimeout(() => WELCOME_SENT.delete(sanitizedNumber), 3600000);
                    } catch (e) {}
                }
                
                if (mongoConnected) {
                    setTimeout(async () => {
                        try {
                            const credsPath = path.join(sessionPath, 'creds.json');
                            if (fs.existsSync(credsPath)) {
                                const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                                await saveSessionToMongoDB(sanitizedNumber, data);
                            }
                        } catch (e) {}
                    }, 5000);
                }
                
                RECONNECT_COOLDOWN.delete(sanitizedNumber);
                
            } else if (connection === 'close') {
                console.log(`🔌 Disconnected: ${sanitizedNumber}`);
                sessionHealth.set(sanitizedNumber, 'disconnected');
                
                allSessions.set(sanitizedNumber, {
                    ...allSessions.get(sanitizedNumber),
                    status: 'disconnected',
                    lastDisconnect: new Date().toISOString(),
                    health: 'disconnected'
                });
                
                if (mongoConnected) {
                    await updateSessionStatusInMongoDB(sanitizedNumber, 'disconnected', 'disconnected');
                }
                
                // Limited reconnect
                if (lastDisconnect?.error?.output?.statusCode !== 401) {
                    const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                    if (attempts < 3) {
                        reconnectionAttempts.set(sanitizedNumber, attempts + 1);
                        console.log(`🔄 Retry ${attempts + 1}/3`);
                        setTimeout(async () => {
                            RECONNECT_COOLDOWN.delete(sanitizedNumber);
                            await EmpirePair(number, { headersSent: true });
                        }, 10000 * (attempts + 1));
                    }
                }
            }
        });

        return socket;
        
    } catch (error) {
        console.error(`❌ ${sanitizedNumber}:`, error.message);
        sessionHealth.set(sanitizedNumber, 'failed');
        RECONNECT_COOLDOWN.delete(sanitizedNumber);
        
        allSessions.set(sanitizedNumber, {
            number: sanitizedNumber,
            status: 'error',
            error: error.message,
            health: 'error'
        });
        
        if (res && !res.headersSent) res.status(503).send({ error: error.message });
        return null;
    }
}

// ===== AUTO MANAGEMENT =====
function initializeAutoManagement() {
    autoSaveInterval = setInterval(async () => {
        for (const [number] of activeSockets) {
            if (isSessionActive(number) && mongoConnected) {
                try {
                    const credsPath = path.join(config.SESSION_BASE_PATH, `session_${number}`, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        await saveSessionToMongoDB(number, data);
                    }
                } catch (e) {}
            }
        }
    }, 360000);

    mongoSyncInterval = setInterval(async () => {
        if (!mongoConnected) {
            console.log('🔄 Reconnecting MongoDB...');
            await connectMongoDB();
        }
    }, 600000);
}

// ===== API ROUTES =====

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number required' });
    
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    if (activeSockets.has(sanitizedNumber) && isSessionActive(sanitizedNumber)) {
        return res.send({ status: 'connected', number: sanitizedNumber });
    }
    
    await EmpirePair(number, res);
});

router.get('/all-sessions', async (req, res) => {
    const sessions = [];
    
    for (const [number, data] of allSessions) {
        sessions.push({
            number,
            status: data.status,
            connectedAt: data.connectedAt,
            lastActive: data.lastActive,
            health: isSessionActive(number) ? 'active' : data.health,
            isActive: isSessionActive(number)
        });
    }
    
    if (mongoConnected && Session) {
        try {
            const mongoSessions = await Session.find({});
            for (const s of mongoSessions) {
                if (!sessions.find(x => x.number === s.number)) {
                    sessions.push({
                        number: s.number,
                        status: s.status,
                        lastActive: s.lastActive,
                        health: s.health,
                        isActive: false,
                        source: 'mongodb'
                    });
                }
            }
        } catch (e) {}
    }
    
    res.send({
        total: sessions.length,
        active: sessions.filter(s => s.isActive).length,
        sessions
    });
});

router.get('/active', (req, res) => {
    const active = [];
    for (const [number] of activeSockets) {
        if (isSessionActive(number)) {
            active.push({
                number,
                uptime: socketCreationTime.get(number) ? 
                    Math.floor((Date.now() - socketCreationTime.get(number)) / 1000) : 0,
                health: sessionHealth.get(number)
            });
        }
    }
    res.send({ count: active.length, sessions: active, antilink: getAntilinkStatus() });
});

router.get('/inactive', (req, res) => {
    const inactive = [];
    for (const [number, data] of allSessions) {
        if (!isSessionActive(number)) {
            inactive.push({
                number,
                status: data.status,
                lastActive: data.lastActive,
                health: data.health
            });
        }
    }
    res.send({ count: inactive.length, sessions: inactive });
});

router.delete('/session/:number', async (req, res) => {
    try {
        const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
        
        if (activeSockets.has(sanitizedNumber)) {
            try { activeSockets.get(sanitizedNumber).ws.close(); } catch (e) {}
        }
        
        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
        
        await deleteSessionFromMongoDB(sanitizedNumber);
        
        activeSockets.delete(sanitizedNumber);
        allSessions.delete(sanitizedNumber);
        sessionHealth.delete(sanitizedNumber);
        sessionConnectionStatus.delete(sanitizedNumber);
        WELCOME_SENT.delete(sanitizedNumber);
        
        const configPath = path.join('./setting', `${sanitizedNumber}.json`);
        if (fs.existsSync(configPath)) fs.removeSync(configPath);
        
        console.log(`🗑️ Deleted: ${sanitizedNumber}`);
        res.send({ status: 'deleted', number: sanitizedNumber });
        
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

router.delete('/inactive-sessions', async (req, res) => {
    try {
        const deleted = [];
        for (const [number] of allSessions) {
            if (!isSessionActive(number)) {
                const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${number}`);
                if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
                
                await deleteSessionFromMongoDB(number);
                allSessions.delete(number);
                sessionHealth.delete(number);
                
                const configPath = path.join('./setting', `${number}.json`);
                if (fs.existsSync(configPath)) fs.removeSync(configPath);
                
                deleted.push(number);
            }
        }
        console.log(`🗑️ Bulk deleted: ${deleted.length}`);
        res.send({ status: 'completed', deleted: deleted.length, numbers: deleted });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

router.get('/status', (req, res) => {
    res.send({
        online: true,
        activeSessions: activeSockets.size,
        totalSessions: allSessions.size,
        uptime: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s`,
        mongodb: mongoConnected ? 'connected ✅' : 'disconnected ❌',
        antilink: getAntilinkStatus(),
        commands: commands.size
    });
});

router.get('/ping', (req, res) => {
    res.send({ 
        status: 'active',
        mongodb: mongoConnected ? 'connected' : 'disconnected',
        sessions: activeSockets.size 
    });
});

router.get('/antilink-status', (req, res) => {
    res.send({ antilink: getAntilinkStatus() });
});

// ===== STARTUP =====
(async () => {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await connectMongoDB();
    initializeAutoManagement();
    
    console.log('\n✅ SILA MD Bot Ready');
    console.log(`📊 MongoDB: ${mongoConnected ? 'CONNECTED ✅' : 'FAILED ❌'}`);
    console.log(`🛡️ Antilink: ${config.ANTILINK_ENABLED === 'true' ? 'ON' : 'OFF'}`);
    console.log(`📦 Commands: ${commands.size}`);
    console.log(`💡 Sessions: Manual delete only\n`);
})();

// Cleanup
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (mongoSyncInterval) clearInterval(mongoSyncInterval);
    
    for (const [number, socket] of activeSockets) {
        if (mongoConnected) {
            try {
                const credsPath = path.join(config.SESSION_BASE_PATH, `session_${number}`, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    await saveSessionToMongoDB(number, data);
                }
            } catch (e) {}
        }
        try { socket.ws.close(); } catch (e) {}
    }
    
    await mongoose.connection.close();
    console.log('✅ Done');
    process.exit(0);
});

module.exports = router;