const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const FileType = require('file-type');
const AdmZip = require('adm-zip');
const mongoose = require('mongoose');
const { sendTranslations } = require("./data/sendTranslations");

if (fs.existsSync('2nd_dev_config.env')) require('dotenv').config({ path: './2nd_dev_config.env' });

const { sms } = require("./msg");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    downloadContentFromMessage,
    getContentType,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dinu60970_db_user:RfGn7kG6A5jLe2px@cluster0.4yb6fvp.mongodb.net/';

process.env.NODE_ENV = 'production';
process.env.PM2_NAME = 'jamali-tech-md';

console.log('🚀 JAMALI TECH MD - Premium WhatsApp Bot initialized');

// Configs - JAMALI TECH BRANDING
const footer = `> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`
const logo = `https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg`;

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑', '🔥', '⚡'],
    BUTTON: 'true',
    AUTO_REACT_NEWSLETTERS: 'true',
    NEWSLETTER_JIDS: ['120363402325089913@newsletter', '0029VbC7AgJK5cD71vGIpO3h@newsletter', '255784062158@s.whatsapp.net'],
    NEWSLETTER_REACT_EMOJIS: ['💎', '👑', '✨', '💫', '🔥'],
    AUTO_SAVE_INTERVAL: 360000,
    AUTO_CLEANUP_INTERVAL: 1800000,
    AUTO_RECONNECT_INTERVAL: 300000,
    AUTO_RESTORE_INTERVAL: 360000,
    MONGODB_SYNC_INTERVAL: 600000,
    MAX_SESSION_AGE: 2592000000,
    DISCONNECTED_CLEANUP_TIME: 180000,
    MAX_FAILED_ATTEMPTS: 2,
    INITIAL_RESTORE_DELAY: 10000,
    IMMEDIATE_DELETE_DELAY: 600000,
    PREFIX: '.',
    MAX_RETRIES: 3,
    NEWSLETTER_JID: '120363402325089913@newsletter',
    ADMIN_LIST_PATH: './data/admin.json',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',
    OWNER_NUMBER: '255798172655',
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    BOT_VERSION: '2.0.0',
    BOT_FOOTER: '> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h',
    REPO_LINK: 'https://github.com/jamalitech/jamali-tech-md'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const lastBackupTime = new Map();
const otpStore = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();
const sessionConnectionStatus = new Map();

let autoSaveInterval, autoCleanupInterval, autoReconnectInterval, autoRestoreInterval, mongoSyncInterval;
let mongoConnected = false;

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

const Session = mongoose.model('Session', sessionSchema);
const UserConfig = mongoose.model('UserConfig', userConfigSchema);

async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000, socketTimeoutMS: 45000 });
        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');
        await Session.createIndexes();
        await UserConfig.createIndexes();
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        mongoConnected = false;
        setTimeout(() => initializeMongoDB(), 5000);
        return false;
    }
}

async function saveSessionToMongoDB(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        if (!isSessionActive(sanitizedNumber)) return false;
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { sessionData, status: 'active', updatedAt: new Date(), lastActive: new Date(), health: sessionHealth.get(sanitizedNumber) || 'active' },
            { upsert: true, new: true }
        );
        console.log(`✅ Session saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB save failed:`, error.message);
        pendingSaves.set(number, { data: sessionData, timestamp: Date.now() });
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const session = await Session.findOne({ number: number.replace(/[^0-9]/g, ''), status: { $ne: 'deleted' } });
        if (session) return session.sessionData;
        return null;
    } catch (error) {
        console.error(`❌ MongoDB load failed:`, error.message);
        return null;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: sanitizedNumber });
        await UserConfig.deleteOne({ number: sanitizedNumber });
        console.log(`🗑️ Session deleted from MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB delete failed:`, error.message);
        return false;
    }
}

async function getAllActiveSessionsFromMongoDB() {
    try {
        return await Session.find({ status: 'active', health: { $ne: 'invalid' } });
    } catch (error) {
        console.error('❌ Failed to get sessions:', error.message);
        return [];
    }
}

async function updateSessionStatusInMongoDB(number, status, health = null) {
    try {
        const updateData = { status, updatedAt: new Date() };
        if (health) updateData.health = health;
        if (status === 'active') updateData.lastActive = new Date();
        await Session.findOneAndUpdate({ number: number.replace(/[^0-9]/g, '') }, updateData, { upsert: false });
        return true;
    } catch (error) {
        console.error(`❌ MongoDB status update failed:`, error.message);
        return false;
    }
}

async function cleanupInactiveSessionsFromMongoDB() {
    try {
        const result = await Session.deleteMany({ $or: [{ status: 'disconnected' }, { status: 'invalid' }, { status: 'failed' }, { health: 'invalid' }, { health: 'disconnected' }] });
        console.log(`🧹 Cleaned ${result.deletedCount} inactive sessions from MongoDB`);
        return result.deletedCount;
    } catch (error) {
        console.error('❌ MongoDB cleanup failed:', error.message);
        return 0;
    }
}

async function getMongoSessionCount() {
    try {
        return await Session.countDocuments({ status: 'active' });
    } catch (error) {
        console.error('❌ Failed to count sessions:', error.message);
        return 0;
    }
}

async function saveUserConfigToMongoDB(number, configData) {
    try {
        await UserConfig.findOneAndUpdate({ number: number.replace(/[^0-9]/g, '') }, { config: configData, updatedAt: new Date() }, { upsert: true });
        return true;
    } catch (error) {
        console.error(`❌ MongoDB config save failed:`, error.message);
        return false;
    }
}

async function loadUserConfigFromMongoDB(number) {
    try {
        const userConfig = await UserConfig.findOne({ number: number.replace(/[^0-9]/g, '') });
        return userConfig ? userConfig.config : null;
    } catch (error) {
        console.error(`❌ MongoDB config load failed:`, error.message);
        return null;
    }
}

function initializeDirectories() {
    [config.SESSION_BASE_PATH, './temp'].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });
    if (!fs.existsSync('./setting')) fs.mkdirSync('./setting');
}
initializeDirectories();

async function downloadAndSaveMedia(message, mediaType) {
    const stream = await downloadContentFromMessage(message, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

function isOwner(sender) {
    return sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
}

function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    return sessionConnectionStatus.get(sanitizedNumber) === 'open' && sessionHealth.get(sanitizedNumber) === 'active' && activeSockets.get(sanitizedNumber)?.user && !disconnectionTime.has(sanitizedNumber);
}

async function saveSessionLocally(number, sessionData) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (!isSessionActive(sanitizedNumber)) return false;
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    fs.ensureDirSync(sessionPath);
    fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(sessionData, null, 2));
    return true;
}

async function restoreSession(number) {
    const sessionData = await loadSessionFromMongoDB(number);
    if (sessionData) await saveSessionLocally(number, sessionData);
    return sessionData;
}

async function deleteSessionImmediately(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
    await deleteSessionFromMongoDB(sanitizedNumber);
    pendingSaves.delete(sanitizedNumber);
    sessionConnectionStatus.delete(sanitizedNumber);
    disconnectionTime.delete(sanitizedNumber);
    sessionHealth.delete(sanitizedNumber);
    reconnectionAttempts.delete(sanitizedNumber);
    socketCreationTime.delete(sanitizedNumber);
    lastBackupTime.delete(sanitizedNumber);
    restoringNumbers.delete(sanitizedNumber);
    activeSockets.delete(sanitizedNumber);
    await updateSessionStatus(sanitizedNumber, 'deleted', new Date().toISOString());
    console.log(`✅ Deleted session: ${sanitizedNumber}`);
}

function initializeAutoManagement() {
    initializeMongoDB().then(() => setTimeout(async () => await autoRestoreAllSessions(), config.INITIAL_RESTORE_DELAY));
    autoSaveInterval = setInterval(async () => await autoSaveAllActiveSessions(), config.AUTO_SAVE_INTERVAL);
    mongoSyncInterval = setInterval(async () => await syncPendingSavesToMongoDB(), config.MONGODB_SYNC_INTERVAL);
    autoCleanupInterval = setInterval(async () => await autoCleanupInactiveSessions(), config.AUTO_CLEANUP_INTERVAL);
    autoReconnectInterval = setInterval(async () => await autoReconnectFailedSessions(), config.AUTO_RECONNECT_INTERVAL);
    autoRestoreInterval = setInterval(async () => await autoRestoreAllSessions(), config.AUTO_RESTORE_INTERVAL);
}

async function syncPendingSavesToMongoDB() {
    if (pendingSaves.size === 0) return;
    for (const [number, sessionInfo] of pendingSaves) {
        if (!isSessionActive(number)) { pendingSaves.delete(number); continue; }
        if (await saveSessionToMongoDB(number, sessionInfo.data)) pendingSaves.delete(number);
        await delay(500);
    }
}

async function autoSaveAllActiveSessions() {
    for (const [number] of activeSockets) {
        if (isSessionActive(number)) await autoSaveSession(number);
        else await deleteSessionImmediately(number);
    }
}

async function autoSaveSession(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (!isSessionActive(sanitizedNumber)) return false;
    const credsPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`, 'creds.json');
    if (fs.existsSync(credsPath)) {
        const credData = JSON.parse(await fs.readFile(credsPath, 'utf8'));
        await saveSessionToMongoDB(sanitizedNumber, credData);
        await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
        await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
        return true;
    }
    return false;
}

async function autoCleanupInactiveSessions() {
    const sessionStatus = await loadSessionStatus();
    for (const [number] of activeSockets) {
        const isActive = isSessionActive(number);
        const disconnectedTimeValue = disconnectionTime.get(number);
        if (!isActive || (disconnectedTimeValue && Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) {
            await deleteSessionImmediately(number);
        }
    }
    await cleanupInactiveSessionsFromMongoDB();
}

async function autoReconnectFailedSessions() {
    const sessionStatus = await loadSessionStatus();
    for (const [number, status] of Object.entries(sessionStatus)) {
        if (status.status === 'failed' && !activeSockets.has(number) && !restoringNumbers.has(number)) {
            const attempts = reconnectionAttempts.get(number) || 0;
            if (attempts < config.MAX_FAILED_ATTEMPTS) {
                reconnectionAttempts.set(number, attempts + 1);
                restoringNumbers.add(number);
                await EmpirePair(number, { headersSent: false, send: () => {}, status: () => {} });
                await delay(5000);
            } else {
                await deleteSessionImmediately(number);
            }
        }
    }
}

async function autoRestoreAllSessions() {
    if (!mongoConnected) return { restored: [], failed: [] };
    const mongoSessions = await getAllActiveSessionsFromMongoDB();
    const restored = [], failed = [];
    for (const session of mongoSessions) {
        if (activeSockets.has(session.number) || restoringNumbers.has(session.number)) continue;
        try {
            restoringNumbers.add(session.number);
            await saveSessionLocally(session.number, session.sessionData);
            await EmpirePair(session.number, { headersSent: false, send: () => {}, status: () => {} });
            restored.push(session.number);
            await delay(3000);
        } catch (error) {
            failed.push(session.number);
            restoringNumbers.delete(session.number);
            await updateSessionStatusInMongoDB(session.number, 'failed', 'disconnected');
        }
    }
    return { restored, failed };
}

async function updateSessionStatus(number, status, timestamp, extra = {}) {
    const sessionStatus = await loadSessionStatus();
    sessionStatus[number] = { status, timestamp, ...extra };
    await saveSessionStatus(sessionStatus);
}

async function loadSessionStatus() {
    try {
        return fs.existsSync(config.SESSION_STATUS_PATH) ? JSON.parse(fs.readFileSync(config.SESSION_STATUS_PATH, 'utf8')) : {};
    } catch { return {}; }
}

async function saveSessionStatus(sessionStatus) {
    fs.writeFileSync(config.SESSION_STATUS_PATH, JSON.stringify(sessionStatus, null, 2));
}

async function loadUserConfig(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const localPath = `./setting/${sanitizedNumber}.json`;
    if (fs.existsSync(localPath)) {
        const localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        applyConfigSettings(localConfig);
        return localConfig;
    }
    const loadedConfig = await loadUserConfigFromMongoDB(sanitizedNumber);
    if (loadedConfig) {
        fs.writeFileSync(localPath, JSON.stringify(loadedConfig, null, 2));
        applyConfigSettings(loadedConfig);
        return loadedConfig;
    }
    fs.writeFileSync(localPath, JSON.stringify(config, null, 2));
    await saveUserConfigToMongoDB(sanitizedNumber, config);
    return { ...config };
}

function applyConfigSettings(loadedConfig) {
    if (loadedConfig.NEWSLETTER_JIDS) config.NEWSLETTER_JIDS = loadedConfig.NEWSLETTER_JIDS;
    if (loadedConfig.NEWSLETTER_REACT_EMOJIS) config.NEWSLETTER_REACT_EMOJIS = loadedConfig.NEWSLETTER_REACT_EMOJIS;
    if (loadedConfig.AUTO_REACT_NEWSLETTERS !== undefined) config.AUTO_REACT_NEWSLETTERS = loadedConfig.AUTO_REACT_NEWSLETTERS;
}

async function updateUserConfig(number, newConfig) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (!isSessionActive(sanitizedNumber)) return;
    await saveUserConfigToMongoDB(sanitizedNumber, newConfig);
}

function loadAdmins() {
    try { return fs.existsSync(config.ADMIN_LIST_PATH) ? JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8')) : []; }
    catch { return []; }
}

function formatMessage(title, content, footerMsg) { return `${title}\n\n${content}\n\n${footerMsg}`; }
function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();
    for (const admin of admins) {
        try { await socket.sendMessage(`${admin}@s.whatsapp.net`, { image: { url: logo }, caption: formatMessage('JAMALI TECH MD - CONNECTED', `✨ Premium Bot Service ✨\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: JAMALI TECH EMPIRE`, footer) }); }
        catch (error) { console.error(`❌ Failed to send admin message:`, error); }
    }
}

async function updateAboutStatus(socket) {
    try { await socket.updateProfileStatus('⚡ JAMALI TECH MD - Premium WhatsApp Bot ⚡'); }
    catch (error) { console.error('❌ Failed to update About status:', error); }
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const myquoted = {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
    message: { contactMessage: { displayName: "JAMALI TECH MD", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:JAMALI TECH MD\nORG:JAMALI TECH EMPIRE;\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`, contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: "0@s.whatsapp.net", quotedMessage: { conversation: "JAMALI AI" } } } },
    messageTimestamp: Math.floor(Date.now() / 1000), status: 1, verifiedBizName: "JAMALI TECH MD"
};

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;
        const isNewsletter = config.NEWSLETTER_JIDS.some(jid => message.key.remoteJid === jid || message.key.remoteJid?.includes(jid));
        if (!isNewsletter || config.AUTO_REACT_NEWSLETTERS !== 'true') return;
        try {
            const randomEmoji = config.NEWSLETTER_REACT_EMOJIS[Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)];
            if (!message.newsletterServerId) return;
            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(message.key.remoteJid, message.newsletterServerId.toString(), randomEmoji);
                    break;
                } catch (error) { retries--; if (retries === 0) console.error(`❌ Failed to react:`, error.message); await delay(2000); }
            }
        } catch (error) { console.error('❌ Newsletter reaction error:', error); }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
        try {
            if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try { await socket.readMessages([message.key]); break; }
                    catch { retries--; if (retries === 0) throw error; await delay(1000); }
                }
            }
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try { await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] }); break; }
                    catch { retries--; if (retries === 0) throw error; await delay(1000); }
                }
            }
        } catch (error) { console.error('Status handler error:', error); }
    });
}

async function setupStatusSavers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        try {
            if (message.message?.extendedTextMessage?.contextInfo) {
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;
                if (sendTranslations.includes(replyText) && quotedInfo?.participant?.endsWith('@s.whatsapp.net') && quotedInfo?.remoteJid === "status@broadcast") {
                    const senderJid = message.key?.remoteJid;
                    if (!senderJid) return;
                    const quotedMsg = quotedInfo.quotedMessage;
                    if (!quotedMsg) return;
                    const mediaType = Object.keys(quotedMsg)[0];
                    if (!mediaType) return;
                    const stream = await downloadContentFromMessage(quotedMsg[mediaType], mediaType.replace("Message", ""));
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    const savetex = '*✨ JAMALI TECH MD - STATUS SAVER ✨*';
                    if (mediaType === "imageMessage") await socket.sendMessage(senderJid, { image: buffer, caption: `${savetex}\n\n${quotedMsg[mediaType]?.caption || ""}` });
                    else if (mediaType === "videoMessage") await socket.sendMessage(senderJid, { video: buffer, caption: `${savetex}\n\n${quotedMsg[mediaType]?.caption || ""}` });
                    else if (mediaType === "audioMessage") await socket.sendMessage(senderJid, { audio: buffer, mimetype: 'audio/mp4' });
                }
            }
        } catch (error) { console.error('Status save handler error:', error); }
    });
}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = await loadUserConfig(number);
        const msg = messages[0];
        const m = sms(socket, msg);
        const from = msg.key.remoteJid;
        const prefix = userConfig.PREFIX || '.';
        const isNewsletter = config.NEWSLETTER_JIDS.includes(msg.key?.remoteJid);
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || isNewsletter) return;
        let command = null, args = [], sender = msg.key.remoteJid;
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(prefix)) {
                const parts = text.slice(prefix.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        } else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(prefix)) {
                const parts = buttonId.slice(prefix.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        if (!command) return;
        try {
            switch (command) {
                // ==================== MAIN MENU ====================
                case 'menu':
                case 'allmenu': {
                    const start = Date.now();
                    const uptime = process.uptime();
                    const usage = process.memoryUsage();
                    const totalMem = os.totalmem();
                    const freeMem = os.freemem();
                    const usedMem = totalMem - freeMem;
                    const memPercent = (usedMem / totalMem * 100).toFixed(1);
                    const ramBar = `[${'█'.repeat(Math.floor(memPercent / 10))}${'░'.repeat(10 - Math.floor(memPercent / 10))}]`;
                    
                    const menuText = `┏▣ ◈ *JAMALI TECH MD* ◈
┃ *ᴏᴡɴᴇʀ* : JAMALI TECH EMPIRE
┃ *ᴘʀᴇғɪx* : [ ${prefix} ]
┃ *ʜᴏsᴛ* : ${process.env.PLATFORM || 'Heroku'}
┃ *ᴘʟᴜɢɪɴs* : 350+
┃ *ᴍᴏᴅᴇ* : Public
┃ *ᴠᴇʀsɪᴏɴ* : ${config.BOT_VERSION}
┃ *sᴘᴇᴇᴅ* : ${Date.now() - start} ms
┃ *ᴜsᴀɢᴇ* : ${(usedMem / 1024 / 1024).toFixed(0)} MB of ${(totalMem / 1024 / 1024).toFixed(0)} MB
┃ *ʀᴀᴍ:* ${ramBar} ${memPercent}%
┗▣ 

┏▣ ◈ *AI MENU* ◈
│➽ ${prefix}analyze
│➽ ${prefix}blackbox
│➽ ${prefix}code
│➽ ${prefix}dalle
│➽ ${prefix}deepseek
│➽ ${prefix}doppleai
│➽ ${prefix}gemini
│➽ ${prefix}generate
│➽ ${prefix}gpt
│➽ ${prefix}programming
│➽ ${prefix}recipe
│➽ ${prefix}story
│➽ ${prefix}summarize
│➽ ${prefix}teach
│➽ ${prefix}translate2
┗▣ 

┏▣ ◈ *AUDIO MENU* ◈
│➽ ${prefix}bass
│➽ ${prefix}blown
│➽ ${prefix}deep
│➽ ${prefix}earrape
│➽ ${prefix}reverse
│➽ ${prefix}robot
│➽ ${prefix}tomp3
│➽ ${prefix}toptt
│➽ ${prefix}volaudio
┗▣ 

┏▣ ◈ *DOWNLOAD MENU* ◈
│➽ ${prefix}apk
│➽ ${prefix}download
│➽ ${prefix}facebook
│➽ ${prefix}gdrive
│➽ ${prefix}gitclone
│➽ ${prefix}image
│➽ ${prefix}instagram
│➽ ${prefix}itunes
│➽ ${prefix}mediafire
│➽ ${prefix}pin
│➽ ${prefix}savestatus
│➽ ${prefix}song
│➽ ${prefix}song2
│➽ ${prefix}telesticker
│➽ ${prefix}tiktok
│➽ ${prefix}tiktokaudio
│➽ ${prefix}twitter
│➽ ${prefix}video
│➽ ${prefix}videodoc
│➽ ${prefix}xvideo
┗▣ 

┏▣ ◈ *EPHOTO360 MENU* ◈
│➽ ${prefix}1917style
│➽ ${prefix}advancedglow
│➽ ${prefix}blackpinklogo
│➽ ${prefix}blackpinkstyle
│➽ ${prefix}cartoonstyle
│➽ ${prefix}deletingtext
│➽ ${prefix}dragonball
│➽ ${prefix}effectclouds
│➽ ${prefix}flag3dtext
│➽ ${prefix}flagtext
│➽ ${prefix}freecreate
│➽ ${prefix}galaxystyle
│➽ ${prefix}galaxywallpaper
│➽ ${prefix}glitchtext
│➽ ${prefix}glowingtext
│➽ ${prefix}gradienttext
│➽ ${prefix}graffiti
│➽ ${prefix}incandescent
│➽ ${prefix}lighteffects
│➽ ${prefix}logomaker
│➽ ${prefix}luxurygold
│➽ ${prefix}makingneon
│➽ ${prefix}matrix
│➽ ${prefix}multicoloredneon
│➽ ${prefix}neonglitch
│➽ ${prefix}papercutstyle
│➽ ${prefix}pixelglitch
│➽ ${prefix}royaltext
│➽ ${prefix}sand
│➽ ${prefix}summerbeach
│➽ ${prefix}topography
│➽ ${prefix}typography
│➽ ${prefix}watercolortext
│➽ ${prefix}writetext
┗▣ 

┏▣ ◈ *FUN MENU* ◈
│➽ ${prefix}fact
│➽ ${prefix}jokes
│➽ ${prefix}memes
│➽ ${prefix}quotes
│➽ ${prefix}trivia
│➽ ${prefix}truthdetector
│➽ ${prefix}xxqc
┗▣ 

┏▣ ◈ *GAMES MENU* ◈
│➽ ${prefix}dare
│➽ ${prefix}truth
│➽ ${prefix}truthordare
┗▣ 

┏▣ ◈ *GROUP MENU* ◈
│➽ ${prefix}add
│➽ ${prefix}addcode
│➽ ${prefix}allow
│➽ ${prefix}announcements
│➽ ${prefix}antibadword
│➽ ${prefix}antibot
│➽ ${prefix}antidemote
│➽ ${prefix}antiforeign
│➽ ${prefix}antiforward
│➽ ${prefix}antigroupmention
│➽ ${prefix}antilink
│➽ ${prefix}antilinkgc
│➽ ${prefix}antimessage
│➽ ${prefix}antisticker
│➽ ${prefix}antitag
│➽ ${prefix}antitagadmin
│➽ ${prefix}approve
│➽ ${prefix}approveall
│➽ ${prefix}cancelkick
│➽ ${prefix}close
│➽ ${prefix}closetime
│➽ ${prefix}delallowed
│➽ ${prefix}delcode
│➽ ${prefix}delppgroup
│➽ ${prefix}demote
│➽ ${prefix}disapproveall
│➽ ${prefix}editsettings
│➽ ${prefix}getgrouppp
│➽ ${prefix}hidetag
│➽ ${prefix}invite
│➽ ${prefix}kick
│➽ ${prefix}kickall
│➽ ${prefix}kickinactive
│➽ ${prefix}link
│➽ ${prefix}listactive
│➽ ${prefix}listallowed
│➽ ${prefix}listcode
│➽ ${prefix}listinactive
│➽ ${prefix}listrequests
│➽ ${prefix}mediatag
│➽ ${prefix}open
│➽ ${prefix}opentime
│➽ ${prefix}poll
│➽ ${prefix}promote
│➽ ${prefix}reject
│➽ ${prefix}resetlink
│➽ ${prefix}setdesc
│➽ ${prefix}setgroupname
│➽ ${prefix}setppgroup
│➽ ${prefix}tag
│➽ ${prefix}tagadmin
│➽ ${prefix}tagall
│➽ ${prefix}totalmembers
│➽ ${prefix}userid
│➽ ${prefix}vcf
│➽ ${prefix}welcome
┗▣ 

┏▣ ◈ *GROUPSTATUS MENU* ◈
│➽ ${prefix}fetchgroups
│➽ ${prefix}tosgroup
┗▣ 

┏▣ ◈ *IMAGE MENU* ◈
│➽ ${prefix}remini
│➽ ${prefix}wallpaper
┗▣ 

┏▣ ◈ *OTHER MENU* ◈
│➽ ${prefix}botstatus
│➽ ${prefix}pair
│➽ ${prefix}ping
│➽ ${prefix}ping2
│➽ ${prefix}repo
│➽ ${prefix}runtime
│➽ ${prefix}time
┗▣ 

┏▣ ◈ *OWNER MENU* ◈
│➽ ${prefix}autosavestatus
│➽ ${prefix}aza
│➽ ${prefix}block
│➽ ${prefix}delete
│➽ ${prefix}deljunk
│➽ ${prefix}delstickercmd
│➽ ${prefix}disk
│➽ ${prefix}dlvo
│➽ ${prefix}forward
│➽ ${prefix}gcaddprivacy
│➽ ${prefix}groupid
│➽ ${prefix}hostip
│➽ ${prefix}join
│➽ ${prefix}lastseen
│➽ ${prefix}leave
│➽ ${prefix}listbadword
│➽ ${prefix}listblocked
│➽ ${prefix}listignorelist
│➽ ${prefix}listsudo
│➽ ${prefix}modestatus
│➽ ${prefix}online
│➽ ${prefix}owner
│➽ ${prefix}ppprivacy
│➽ ${prefix}react
│➽ ${prefix}readreceipts
│➽ ${prefix}resetaza
│➽ ${prefix}restart
│➽ ${prefix}setaza
│➽ ${prefix}setbio
│➽ ${prefix}setprofilepic
│➽ ${prefix}setstickercmd
│➽ ${prefix} tostatus
│➽ ${prefix}toviewonce
│➽ ${prefix}unblock
│➽ ${prefix}unblockall
│➽ ${prefix}update
│➽ ${prefix}vv2
│➽ ${prefix}warn
┗▣ 

┏▣ ◈ *RELIGION MENU* ◈
│➽ ${prefix}bible
│➽ ${prefix}quran
┗▣ 

┏▣ ◈ *SEARCH MENU* ◈
│➽ ${prefix}define
│➽ ${prefix}define2
│➽ ${prefix}imdb
│➽ ${prefix}lyrics
│➽ ${prefix}shazam
│➽ ${prefix}weather
│➽ ${prefix}yts
┗▣ 

┏▣ ◈ *SETTINGS MENU* ◈
│➽ ${prefix}addbadword
│➽ ${prefix}addcountrycode
│➽ ${prefix}addignorelist
│➽ ${prefix}addsudo
│➽ ${prefix}alwaysonline
│➽ ${prefix}antibug
│➽ ${prefix}anticall
│➽ ${prefix}antidelete
│➽ ${prefix}antideletestatus
│➽ ${prefix}antiedit
│➽ ${prefix}antiviewonce
│➽ ${prefix}autobio
│➽ ${prefix}autoblock
│➽ ${prefix}autoreact
│➽ ${prefix}autoreactstatus
│➽ ${prefix}autoread
│➽ ${prefix}autorecord
│➽ ${prefix}autorecordtyping
│➽ ${prefix}autotype
│➽ ${prefix}autoviewstatus
│➽ ${prefix}chatbot
│➽ ${prefix}delanticallmsg
│➽ ${prefix}delcountrycode
│➽ ${prefix}deletebadword
│➽ ${prefix}delgoodbye
│➽ ${prefix}delignorelist
│➽ ${prefix}delsudo
│➽ ${prefix}delwelcome
│➽ ${prefix}getsettings
│➽ ${prefix}listcountrycode
│➽ ${prefix}listwarn
│➽ ${prefix}mode
│➽ ${prefix}resetsetting
│➽ ${prefix}resetwarn
│➽ ${prefix}setanticallmsg
│➽ ${prefix}setbotname
│➽ ${prefix}setcontextlink
│➽ ${prefix}setfont
│➽ ${prefix}setgoodbye
│➽ ${prefix}setmenu
│➽ ${prefix}setmenuimage
│➽ ${prefix}setownername
│➽ ${prefix}setownernumber
│➽ ${prefix}setprefix
│➽ ${prefix}setstatusemoji
│➽ ${prefix}setstickerauthor
│➽ ${prefix}setstickerpackname
│➽ ${prefix}settimezone
│➽ ${prefix}setwarn
│➽ ${prefix}setwatermark
│➽ ${prefix}setwelcome
│➽ ${prefix}showanticallmsg
│➽ ${prefix}showgoodbye
│➽ ${prefix}showwelcome
│➽ ${prefix}statusdelay
│➽ ${prefix}statussettings
│➽ ${prefix}testanticallmsg
│➽ ${prefix}testgoodbye
│➽ ${prefix}testwelcome
┗▣ 

┏▣ ◈ *SPORTS MENU* ◈
│➽ ${prefix}bundesligamatches
│➽ ${prefix}bundesligascorers
│➽ ${prefix}bundesligastandings
│➽ ${prefix}bundesligaupcoming
│➽ ${prefix}clmatches
│➽ ${prefix}clscorers
│➽ ${prefix}clstandings
│➽ ${prefix}clupcoming
│➽ ${prefix}eflmatches
│➽ ${prefix}eflscorers
│➽ ${prefix}eflstandings
│➽ ${prefix}eflupcoming
│➽ ${prefix}elmatches
│➽ ${prefix}elscorers
│➽ ${prefix}elstandings
│➽ ${prefix}elupcoming
│➽ ${prefix}eplmatches
│➽ ${prefix}eplscorers
│➽ ${prefix}eplstandings
│➽ ${prefix}eplupcoming
│➽ ${prefix}laligamatches
│➽ ${prefix}laligascorers
│➽ ${prefix}laligastandings
│➽ ${prefix}laligaupcoming
│➽ ${prefix}ligue1matches
│➽ ${prefix}ligue1scorers
│➽ ${prefix}ligue1standings
│➽ ${prefix}ligue1upcoming
│➽ ${prefix}serieamatches
│➽ ${prefix}serieascorers
│➽ ${prefix}serieastandings
│➽ ${prefix}serieaupcoming
│➽ ${prefix}wcmatches
│➽ ${prefix}wcscorers
│➽ ${prefix}wcstandings
│➽ ${prefix}wcupcoming
│➽ ${prefix}wrestlingevents
│➽ ${prefix}wwenews
│➽ ${prefix}wweschedule
┗▣ 

┏▣ ◈ *SUPPORT MENU* ◈
│➽ ${prefix}feedback
│➽ ${prefix}helpers
┗▣ 

┏▣ ◈ *TOOLS MENU* ◈
│➽ ${prefix}browse
│➽ ${prefix}calculate
│➽ ${prefix}device
│➽ ${prefix}emojimix
│➽ ${prefix}fancy
│➽ ${prefix}filtervcf
│➽ ${prefix}fliptext
│➽ ${prefix}genpass
│➽ ${prefix}getabout
│➽ ${prefix}getpp
│➽ ${prefix}gsmarena
│➽ ${prefix}obfuscate
│➽ ${prefix}qrcode
│➽ ${prefix}runeval
│➽ ${prefix}say
│➽ ${prefix}ssweb
│➽ ${prefix}sswebpc
│➽ ${prefix}sswebtab
│➽ ${prefix}sticker
│➽ ${prefix}take
│➽ ${prefix}texttopdf
│➽ ${prefix}tinyurl
│➽ ${prefix}toimage
│➽ ${prefix}tourl
│➽ ${prefix}vcc
┗▣ 

┏▣ ◈ *TRANSLATE MENU* ◈
│➽ ${prefix}translate
┗▣ 

┏▣ ◈ *VIDEO MENU* ◈
│➽ ${prefix}toaudio
│➽ ${prefix}tovideo
│➽ ${prefix}volvideo
┗▣ 

┏▣ ◈ *VIEW CHANNEL* ◈
│➽ 🔗 *Join Our Official Channel*
│➽ 📢 ${config.CHANNEL_LINK}
│➽ 📞 *Admin Contact:* wa.me/${config.OWNER_NUMBER}
┗▣ 

${footer}`;
                    
                    await socket.sendMessage(sender, { image: { url: logo }, caption: menuText }, { quoted: myquoted });
                    break;
                }
                
                case 'repo':
                case 'repi': {
                    await socket.sendMessage(sender, { text: `┏▣ ◈ *REPOSITORY* ◈
┃ 🔗 *GitHub*: ${config.REPO_LINK}
┃ ⭐ Star us on GitHub!
┃ 🔄 Fork and contribute
┃ 🤖 *Bot*: JAMALI TECH MD
┗▣ 

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'alive': {
                    const start = Date.now();
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    const text = `┏▣ ◈ *JAMALI TECH MD* ◈
┃ *ᴏᴡɴᴇʀ* : JAMALI TECH EMPIRE
┃ *ᴜᴘᴛɪᴍᴇ* : ${hours}h ${minutes}m
┃ *ᴘʀᴇғɪx* : ${prefix}
┃ *sᴘᴇᴇᴅ* : ${Date.now() - start} ms
┃ *sᴛᴀᴛᴜs* : 🟢 ALIVE
┗▣ 

${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption: text }, { quoted: myquoted });
                    break;
                }
                
                case 'ping':
                case 'ping2': {
                    const start = Date.now();
                    const ping = Date.now() - start;
                    await socket.sendMessage(sender, { text: `┏▣ ◈ *PONG* ◈
┃ ⚡ *Speed* : ${ping} ms
┃ 🌐 *Status* : 🟢 Active
┃ 🤖 *Bot* : JAMALI TECH MD
┗▣ 

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'runtime': {
                    const uptime = process.uptime();
                    const days = Math.floor(uptime / 86400);
                    const hours = Math.floor((uptime % 86400) / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    await socket.sendMessage(sender, { text: `┏▣ ◈ *RUNTIME* ◈
┃ 📅 *Days* : ${days}
┃ ⏰ *Hours* : ${hours}
┃ 🕐 *Minutes* : ${minutes}
┃ ⚡ *Seconds* : ${seconds}
┃ 🤖 *Bot* : JAMALI TECH MD
┗▣ 

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'owner': {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:JAMALI TECH EMPIRE\nORG:JAMALI TECH MD\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`;
                    await socket.sendMessage(sender, { contacts: { displayName: "JAMALI TECH EMPIRE", contacts: [{ vcard }] } }, { quoted: myquoted });
                    await socket.sendMessage(sender, { text: `┏▣ ◈ *OWNER INFO* ◈
┃ 👤 *Name* : JAMALI TECH EMPIRE
┃ 📞 *WA* : wa.me/255798172655
┃ 🤖 *Bot* : JAMALI TECH MD
┗▣ 

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'jid': {
                    let replyJid = '';
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) replyJid = msg.message.extendedTextMessage.contextInfo.participant;
                    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    const caption = `┏▣ ◈ *JID INFORMATION* ◈
┃ 💬 *Chat JID* : ${sender}
${replyJid ? `┃ 🔄 *Replied* : ${replyJid}\n` : ''}${mentionedJid?.length ? `┃ 👥 *Mentioned* : ${mentionedJid.join(', ')}\n` : ''}${msg.key.remoteJid.endsWith('@g.us') ? `┃ 👥 *Group JID* : ${msg.key.remoteJid}\n` : ''}
┗▣ 

📝 *Note:*
• User JID: number@s.whatsapp.net
• Group JID: number@g.us
• Channel JID: number@newsletter

${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption }, { quoted: myquoted });
                    break;
                }
                
                case 'viewchannel':
                case 'channel': {
                    await socket.sendMessage(sender, { text: `┏▣ ◈ *JAMALI TECH CHANNEL* ◈
┃ 📢 *Join Our Official Channel*
┃ 🔗 *Link* : ${config.CHANNEL_LINK}
┃ 
┃ 📌 *Follow for daily updates!*
┃ 🤖 *Bot* : JAMALI TECH MD
┃ 👑 *Owner* : JAMALI TECH EMPIRE
┗▣ 

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                // ==================== ADD ALL OTHER COMMANDS HERE ====================
                // Song command
                case 'song':
                case 'song2': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide a song name*\n📌 Usage: .song <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `*❌ No results for: ${query}*` }, { quoted: myquoted });
                    const video = searchResults.videos[0];
                    await socket.sendMessage(sender, { text: `🎵 *Downloading:* ${video.title}\n⏱️ Please wait...` }, { quoted: myquoted });
                    try {
                        const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                        await socket.sendMessage(sender, { audio: { stream }, mimetype: 'audio/mpeg', fileName: `${video.title}.mp3` }, { quoted: myquoted });
                        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'video': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide a video name*\n📌 Usage: .video <video name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `*❌ No results for: ${query}*` }, { quoted: myquoted });
                    const video = searchResults.videos[0];
                    await socket.sendMessage(sender, { text: `🎬 *Downloading:* ${video.title}\n⏱️ Please wait...` }, { quoted: myquoted });
                    try {
                        const stream = ytdl(video.url, { filter: 'audioandvideo', quality: 'highest' });
                        await socket.sendMessage(sender, { video: { stream }, caption: `🎬 ${video.title}\n\n${footer}` }, { quoted: myquoted });
                        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'tiktok': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide TikTok URL*\n📌 Usage: .tiktok <url>' }, { quoted: myquoted });
                    const url = args[0];
                    await socket.sendMessage(sender, { react: { text: '📱', key: msg.key } });
                    await socket.sendMessage(sender, { text: `⏳ *Downloading TikTok video...*` }, { quoted: myquoted });
                    try {
                        const response = await axios.get(`https://api.davidcyriltech.my.id/download/tiktok?url=${encodeURIComponent(url)}`);
                        if (response.data?.result?.video) {
                            await socket.sendMessage(sender, { video: { url: response.data.result.video }, caption: `🎬 *TikTok Video*\n\n${footer}` }, { quoted: myquoted });
                            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                        } else {
                            await socket.sendMessage(sender, { text: `❌ Failed to download TikTok video` }, { quoted: myquoted });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'facebook':
                case 'fb': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide Facebook URL*\n📌 Usage: .fb <url>' }, { quoted: myquoted });
                    const url = args[0];
                    await socket.sendMessage(sender, { react: { text: '📘', key: msg.key } });
                    await socket.sendMessage(sender, { text: `⏳ *Downloading Facebook video...*` }, { quoted: myquoted });
                    try {
                        const response = await axios.get(`https://api.davidcyriltech.my.id/download/facebook?url=${encodeURIComponent(url)}`);
                        if (response.data?.result?.hd) {
                            await socket.sendMessage(sender, { video: { url: response.data.result.hd }, caption: `🎬 *Facebook Video*\n\n${footer}` }, { quoted: myquoted });
                            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                        } else if (response.data?.result?.sd) {
                            await socket.sendMessage(sender, { video: { url: response.data.result.sd }, caption: `🎬 *Facebook Video*\n\n${footer}` }, { quoted: myquoted });
                            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                        } else {
                            await socket.sendMessage(sender, { text: `❌ Failed to download Facebook video` }, { quoted: myquoted });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'save':
                case 'savestatus': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '*❌ Reply to a status message with .save*' }, { quoted: myquoted });
                    if (quotedMsg.imageMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
                        await socket.sendMessage(sender, { image: buffer, caption: `✨ *STATUS SAVED* ✨\n\n${footer}` });
                    } else if (quotedMsg.videoMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
                        await socket.sendMessage(sender, { video: buffer, caption: `✨ *STATUS SAVED* ✨\n\n${footer}` });
                    }
                    break;
                }
                
                case 'vv':
                case 'viewonce': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ *Reply to a ViewOnce message with .vv*' }, { quoted: myquoted });
                    let mediaData = null, mediaType = null;
                    if (quotedMsg.imageMessage?.viewOnce) { mediaData = quotedMsg.imageMessage; mediaType = 'image'; }
                    else if (quotedMsg.videoMessage?.viewOnce) { mediaData = quotedMsg.videoMessage; mediaType = 'video'; }
                    else if (quotedMsg.viewOnceMessage?.message?.imageMessage) { mediaData = quotedMsg.viewOnceMessage.message.imageMessage; mediaType = 'image'; }
                    else if (quotedMsg.viewOnceMessage?.message?.videoMessage) { mediaData = quotedMsg.viewOnceMessage.message.videoMessage; mediaType = 'video'; }
                    if (mediaData) {
                        const buffer = await downloadAndSaveMedia(mediaData, mediaType);
                        if (mediaType === 'image') await socket.sendMessage(sender, { image: buffer, caption: `✨ *VIEWONCE IMAGE RETRIEVED* ✨\n\n${footer}` });
                        else await socket.sendMessage(sender, { video: buffer, caption: `✨ *VIEWONCE VIDEO RETRIEVED* ✨\n\n${footer}` });
                    }
                    break;
                }
                
                case 'sticker': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '*❌ Reply to an image/video to convert to sticker*' }, { quoted: myquoted });
                    let mediaData = null;
                    if (quotedMsg.imageMessage) mediaData = quotedMsg.imageMessage;
                    else if (quotedMsg.videoMessage) mediaData = quotedMsg.videoMessage;
                    if (!mediaData) return await socket.sendMessage(sender, { text: '*❌ Reply to an image or video*' }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });
                    const buffer = await downloadAndSaveMedia(mediaData, mediaData.imageMessage ? 'image' : 'video');
                    await socket.sendMessage(sender, { sticker: buffer }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    break;
                }
                
                case 'getpp':
                case 'getdp': {
                    let targetJid = sender, profileName = "Your";
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) { targetJid = msg.message.extendedTextMessage.contextInfo.participant; profileName = "Replied User"; }
                    else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) { targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0]; profileName = "Mentioned User"; }
                    const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);
                    if (!ppUrl) return await socket.sendMessage(sender, { text: `*❌ No profile picture for ${profileName}*` }, { quoted: myquoted });
                    await socket.sendMessage(sender, { image: { url: ppUrl }, caption: `✨ *PROFILE PICTURE* ✨\n\n👤 *${profileName}*\n📱 *JID:* ${targetJid}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'ai':
                case 'gpt': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide a message*\n📌 Usage: .ai <message>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
                    try {
                        const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(query)}`);
                        if (response.data?.result) {
                            await socket.sendMessage(sender, { text: `🤖 *JAMALI AI*\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
                        } else {
                            await socket.sendMessage(sender, { text: `❌ AI service unavailable` }, { quoted: myquoted });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'yts':
                case 'ytsearch': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide a search query*\n📌 Usage: .yts <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `*❌ No results for: ${query}*` }, { quoted: myquoted });
                    let resultText = `┏▣ ◈ *YOUTUBE SEARCH* ◈
┃ 📌 *Query* : ${query}
┃ 📊 *Found* : ${searchResults.videos.length} videos
┗▣ 

`;
                    searchResults.videos.slice(0, 5).forEach((video, i) => {
                        resultText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🎬 *${i+1}. ${video.title.substring(0, 45)}*
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ ⏱️ Duration: ${video.timestamp}
┃ 👀 Views: ${video.views?.toLocaleString()}
┃ 📅 Uploaded: ${video.ago}
┃ 📺 Channel: ${video.author.name}
┃ 🔗 Link: ${video.url}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

`;
                    });
                    resultText += footer;
                    await socket.sendMessage(sender, { text: resultText }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    break;
                }
                
                case 'weather': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide city name*\n📌 Usage: .weather <city>' }, { quoted: myquoted });
                    const city = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🌤️', key: msg.key } });
                    try {
                        const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
                        const data = response.data;
                        const current = data.current_condition[0];
                        const text = `┏▣ ◈ *WEATHER INFO* ◈
┃ 📍 *City* : ${city.toUpperCase()}
┃ 🌡️ *Temp* : ${current.temp_C}°C
┃ 💨 *Wind* : ${current.windspeedKmph} km/h
┃ 💧 *Humidity* : ${current.humidity}%
┃ ☁️ *Cloud* : ${current.cloudcover}%
┃ 🌅 *Sunrise* : ${current.astronomy[0].sunrise}
┃ 🌇 *Sunset* : ${current.astronomy[0].sunset}
┗▣ 

${footer}`;
                        await socket.sendMessage(sender, { text }, { quoted: myquoted });
                        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Could not find weather for ${city}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'translate': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide text to translate*\n📌 Usage: .translate <text>' }, { quoted: myquoted });
                    const text = args.join(' ');
                    try {
                        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
                        const translated = response.data[0][0][0];
                        await socket.sendMessage(sender, { text: `┏▣ ◈ *TRANSLATION* ◈
┃ 🔤 *Original* : ${text}
┃ 🌐 *Translated* : ${translated}
┗▣ 

${footer}` }, { quoted: myquoted });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Translation failed` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'qrcode': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide text to generate QR code*\n📌 Usage: .qrcode <text>' }, { quoted: myquoted });
                    const text = args.join(' ');
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
                    await socket.sendMessage(sender, { image: { url: qrUrl }, caption: `📱 *QR CODE*\n\n🔗 *Data:* ${text}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                default: {
                    // AI Chat for unknown commands
                    if (command && command.length > 2) {
                        try {
                            const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(command + ' ' + args.join(' '))}`);
                            if (response.data?.result) {
                                await socket.sendMessage(sender, { text: `🤖 *JAMALI AI*\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
                            }
                        } catch (error) {
                            // Silent fail
                        }
                    }
                    break;
                }
            }
        } catch (error) { console.error('Command error:', error); }
    });
}

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
        if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate('recording', msg.key.remoteJid).catch(() => {});
    });
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionConnectionStatus.set(sanitizedNumber, connection);
        if (connection === 'close') {
            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            if (lastDisconnect?.error?.output?.statusCode === 401) {
                sessionHealth.set(sanitizedNumber, 'invalid');
                await updateSessionStatusInMongoDB(sanitizedNumber, 'invalid', 'invalid');
                setTimeout(() => deleteSessionImmediately(sanitizedNumber), config.IMMEDIATE_DELETE_DELAY);
            } else {
                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);
                    await EmpirePair(number, { headersSent: false, send: () => {}, status: () => {} });
                } else {
                    setTimeout(() => deleteSessionImmediately(sanitizedNumber), config.IMMEDIATE_DELETE_DELAY);
                }
            }
        } else if (connection === 'open') {
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    console.log(`🔄 JAMALI TECH MD - Connecting: ${sanitizedNumber}`);
    try {
        fs.ensureDirSync(sessionPath);
        const restoredCreds = await restoreSession(sanitizedNumber);
        if (restoredCreds) fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const socket = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })) },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });
        socketCreationTime.set(sanitizedNumber, Date.now());
        setupStatusHandlers(socket);
        setupStatusSavers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES, code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber, "JAMALITZ");
                    console.log(`📱 JAMALI TECH MD - Pairing Code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    await delay(2000);
                }
            }
            if (!res.headersSent && code) res.send({ code });
        }
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            if (isSessionActive(sanitizedNumber)) {
                const credData = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
                await saveSessionToMongoDB(sanitizedNumber, credData);
            }
        });
        socket.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                await delay(3000);
                await updateAboutStatus(socket);
                for (const newsletterJid of config.NEWSLETTER_JIDS) await socket.newsletterFollow(newsletterJid).catch(() => {});
                const userConfig = await loadUserConfig(sanitizedNumber);
                if (!userConfig) await updateUserConfig(sanitizedNumber, config);
                activeSockets.set(sanitizedNumber, socket);
                sessionHealth.set(sanitizedNumber, 'active');
                sessionConnectionStatus.set(sanitizedNumber, 'open');
                disconnectionTime.delete(sanitizedNumber);
                restoringNumbers.delete(sanitizedNumber);
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { image: { url: logo }, caption: formatMessage('JAMALI TECH MD', `✨ Connected!\n📞 Number: ${sanitizedNumber}\n👑 Owner: JAMALI TECH EMPIRE\n💎 Version: ${config.BOT_VERSION}`, footer) });
                await sendAdminConnectMessage(socket, sanitizedNumber);
                await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
                let numbers = [];
                if (fs.existsSync(config.NUMBER_LIST_PATH)) numbers = JSON.parse(fs.readFileSync(config.NUMBER_LIST_PATH, 'utf8'));
                if (!numbers.includes(sanitizedNumber)) { numbers.push(sanitizedNumber); fs.writeFileSync(config.NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2)); }
            }
        });
        return socket;
    } catch (error) {
        console.error(`❌ Pairing error:`, error);
        if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable', details: error.message });
        throw error;
    }
}

// API ROUTES
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: isSessionActive(sanitizedNumber) ? 'already_connected' : 'reconnecting' });
    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    const activeNumbers = [];
    for (const [number] of activeSockets) if (isSessionActive(number)) activeNumbers.push(number);
    res.send({ count: activeNumbers.length, numbers: activeNumbers });
});

router.get('/status', (req, res) => {
    res.send({ online: true, activesessions: activeSockets.size, uptime: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s` });
});

router.get('/ping', (req, res) => {
    res.send({ status: 'active', activeSessions: Array.from(activeSockets.keys()).filter(n => isSessionActive(n)).length });
});

router.delete('/session/:number', async (req, res) => {
    const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) activeSockets.get(sanitizedNumber).ws.close();
    await deleteSessionImmediately(sanitizedNumber);
    res.send({ status: 'success', message: `Session ${sanitizedNumber} deleted` });
});

initializeAutoManagement();
module.exports = router;
