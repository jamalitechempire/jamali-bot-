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

console.log('🚀 JAMALI TECH MD V1 - Premium WhatsApp Bot initialized');

// Configs - JAMALI TECH BRANDING
const footer = `> *♱♱♱♱♱ Powered by JAMALI TECH EMPIRE ♱♱♱♱♱*`
const logo = `https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg`;
const caption = `𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏`; 
const botName = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏'
const mainSite = 'jamali-tech.md'
const apibase = 'https://dew-api.vercel.app'
const apikey = `free`;

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑', '🔥', '⚡'],
    BUTTON: 'true',
    AUTO_REACT_NEWSLETTERS: 'true',
    NEWSLETTER_JIDS: ['120363402325089913@newsletter', '0029VbC7AgJK5cD71vGIpO3h@newsletter'],
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
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> *♱♱♱♱♱ Powered by JAMALI TECH EMPIRE ♱♱♱♱♱*'
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

function formatMessage(title, content, footerMsg) { return `*♱ ${title} ♱*\n\n${content}\n\n${footerMsg}`; }
function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();
    for (const admin of admins) {
        try { await socket.sendMessage(`${admin}@s.whatsapp.net`, { image: { url: logo }, caption: formatMessage('𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃', `✨ Premium Bot Service ✨\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: JAMALI TECH EMPIRE`, footer) }); }
        catch (error) { console.error(`❌ Failed to send admin message:`, error); }
    }
}

async function updateAboutStatus(socket) {
    try { await socket.updateProfileStatus('⚡ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - Premium WhatsApp Bot ⚡'); }
    catch (error) { console.error('❌ Failed to update About status:', error); }
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const myquoted = {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
    message: { contactMessage: { displayName: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏\nORG:JAMALI TECH EMPIRE;\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`, contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: "0@s.whatsapp.net", quotedMessage: { conversation: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐀𝐈" } } } },
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
                    const savetex = '*✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - STATUS SAVER ✨*';
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
                case 'menu': {
                    const uptime = Math.floor((Date.now() - (socketCreationTime.get(number) || Date.now())) / 1000);
                    const hours = Math.floor(uptime / 3600), minutes = Math.floor((uptime % 3600) / 60);
                    const text = `╔════════════════════════════════════════╗\n            ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨\n╚════════════════════════════════════════╝\n\n┌────────────────────────────────┐\n│ 💎 BOT INFO\n├────────────────────────────────┤\n│ 👑 Bot Name: 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏\n│ 🔧 Version: 1.0.0\n│ 👤 Owner: JAMALI TECH EMPIRE\n│ ⏱️ Uptime: ${hours}h ${minutes}m\n│ 📌 Prefix: ${prefix}\n└────────────────────────────────┘\n\n┌────────────────────────────────┐\n│ 🛠️ SYSTEM COMMANDS\n├────────────────────────────────┤\n│ • ${prefix}alive - Bot Status\n│ • ${prefix}ping - Bot Speed\n│ • ${prefix}jid - Get JID\n│ • ${prefix}owner - Contact Owner\n└────────────────────────────────┘\n\n┌────────────────────────────────┐\n│ 📥 DOWNLOAD COMMANDS\n├────────────────────────────────┤\n│ • ${prefix}song - Download Music\n│ • ${prefix}video - Download Video\n│ • ${prefix}tiktok - TikTok\n│ • ${prefix}facebook - FB Video\n│ • ${prefix}save - Save Status\n└────────────────────────────────┘\n\n${footer}`;
                    await socket.sendMessage(sender, { image: { url: 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg' }, caption: text, footer: footer, headerType: 4 }, { quoted: myquoted });
                    break;
                }
                case 'alive': {
                    const uptime = Math.floor((Date.now() - (socketCreationTime.get(number) || Date.now())) / 1000);
                    const hours = Math.floor(uptime / 3600), minutes = Math.floor((uptime % 3600) / 60);
                    const text = `╔══════════════════════════╗\n    ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨\n          𝐈𝐒 𝐀𝐋𝐈𝐕𝐄\n╚══════════════════════════╝\n\n┌────────────────────────┐\n│ 👑 Owner: JAMALI TECH EMPIRE\n│ ⏱️ Uptime: ${hours}h ${minutes}m\n│ 📌 Prefix: ${prefix}\n└────────────────────────┘\n\n${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption: text, footer: footer, headerType: 4 }, { quoted: myquoted });
                    break;
                }
                case 'owner': {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄\nORG:JAMALI TECH EMPIRE\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`;
                    await socket.sendMessage(sender, { contacts: { displayName: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄", contacts: [{ vcard }] } }, { quoted: myquoted });
                    break;
                }
                case 'ping': {
                    const start = Date.now();
                    const tempMsg = await socket.sendMessage(sender, { text: '```Pinging...```' });
                    const ping = Date.now() - start;
                    await socket.sendMessage(sender, { text: `*⚡ Speed: ${ping} ms*\n*Status: 🟢 Active*\n\n${footer}`, edit: tempMsg.key });
                    break;
                }
                case 'jid': {
                    let replyJid = '';
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) replyJid = msg.message.extendedTextMessage.contextInfo.participant;
                    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    const caption = `╔══════════════════════════╗\n       📍 JID INFORMATION\n╚══════════════════════════╝\n\n┌────────────────────────┐\n│ 💬 Chat JID: ${sender}\n${replyJid ? `│ 🔄 Replied User: ${replyJid}\n` : ''}${mentionedJid?.length ? `│ 👥 Mentioned: ${mentionedJid.join(', ')}\n` : ''}${msg.key.remoteJid.endsWith('@g.us') ? `│ 👥 Group JID: ${msg.key.remoteJid}\n` : ''}\n└────────────────────────┘\n\n${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption }, { quoted: myquoted });
                    break;
                }
                case 'save': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '*❌ Reply to a status message with .save*' }, { quoted: myquoted });
                    if (quotedMsg.imageMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
                        await socket.sendMessage(sender, { image: buffer, caption: `✨ STATUS SAVED ✨\n\n${footer}` });
                    } else if (quotedMsg.videoMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
                        await socket.sendMessage(sender, { video: buffer, caption: `✨ STATUS SAVED ✨\n\n${footer}` });
                    }
                    break;
                }
                case 'vv': case 'viewonce': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ Reply to a ViewOnce message with .vv' }, { quoted: myquoted });
                    let mediaData = null, mediaType = null;
                    if (quotedMsg.imageMessage?.viewOnce) { mediaData = quotedMsg.imageMessage; mediaType = 'image'; }
                    else if (quotedMsg.videoMessage?.viewOnce) { mediaData = quotedMsg.videoMessage; mediaType = 'video'; }
                    else if (quotedMsg.viewOnceMessage?.message?.imageMessage) { mediaData = quotedMsg.viewOnceMessage.message.imageMessage; mediaType = 'image'; }
                    else if (quotedMsg.viewOnceMessage?.message?.videoMessage) { mediaData = quotedMsg.viewOnceMessage.message.videoMessage; mediaType = 'video'; }
                    if (mediaData) {
                        const buffer = await downloadAndSaveMedia(mediaData, mediaType);
                        if (mediaType === 'image') await socket.sendMessage(sender, { image: buffer, caption: `✨ VIEWONCE IMAGE RETRIEVED ✨\n\n${footer}` });
                        else await socket.sendMessage(sender, { video: buffer, caption: `✨ VIEWONCE VIDEO RETRIEVED ✨\n\n${footer}` });
                    }
                    break;
                }
                case 'getdp': {
                    let targetJid = sender, profileName = "Your";
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) { targetJid = msg.message.extendedTextMessage.contextInfo.participant; profileName = "Replied User"; }
                    else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) { targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0]; profileName = "Mentioned User"; }
                    const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);
                    if (!ppUrl) return await socket.sendMessage(sender, { text: `*❌ No profile picture for ${profileName}*` }, { quoted: myquoted });
                    await socket.sendMessage(sender, { image: { url: ppUrl }, caption: `✨ PROFILE PICTURE ✨\n\n👤 ${profileName}\n📱 JID: ${targetJid}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                case 'wame': {
                    let targetNumber = sender.split('@')[0];
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
                    else if (args[0]) targetNumber = args[0].replace(/[^0-9]/g, '');
                    const customText = args.slice(1).join(' ');
                    const waLink = `https://wa.me/${targetNumber}${customText ? `?text=${encodeURIComponent(customText)}` : ''}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption: `✨ WHATSAPP LINK GENERATED ✨\n\n📱 Number: ${targetNumber}\n🔗 Link: ${waLink}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                case 'yts': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Provide a search query*\nUsage: .yts <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `*❌ No results for: ${query}*` }, { quoted: myquoted });
                    let resultText = `🔍 YOUTUBE SEARCH\n📌 Query: ${query}\n📊 Found: ${searchResults.videos.length} videos\n\n`;
                    searchResults.videos.slice(0, 5).forEach((video, i) => {
                        resultText += `🎬 ${i+1}. ${video.title.substring(0, 50)}\n⏱️ ${video.timestamp} | 👀 ${video.views?.toLocaleString()}\n🔗 ${video.url}\n\n`;
                    });
                    resultText += footer;
                    await socket.sendMessage(sender, { text: resultText }, { quoted: myquoted });
                    break;
                }
                default: break;
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
    console.log(`🔄 Connecting: ${sanitizedNumber}`);
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
                    // ✅ PAIR CODE IMEBADILISHWA HAPA KUWA JAMALITZ
                    code = await socket.requestPairingCode(sanitizedNumber, "JAMALITZ");
                    console.log(`📱 JAMALI TECH EMPIRE PAIR BOT - Pairing Code for ${sanitizedNumber}: ${code}`);
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
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { image: { url: logo }, caption: formatMessage('𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏', `✨ Connected!\n📞 Number: ${sanitizedNumber}\n👑 Owner: JAMALI TECH EMPIRE`, footer) });
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
