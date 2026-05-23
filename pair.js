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
process.env.PM2_NAME = 'jamali-tech-md-v2';

console.log('🚀 JAMALI TECH MD V2 - Premium WhatsApp Bot initialized');

// Configs - JAMALI TECH BRANDING
const footer = `> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`
const logo = `https://files.catbox.moe/xney4v.jpg`;
const caption = `𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐`; 
const botName = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐'
const mainSite = 'jamali-tech.md'
const apibase = 'https://dew-api.vercel.app'
const apikey = `free`;

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑', '🔥', '⚡', '💫', '🌟', '⭐'],
    BUTTON: 'true',
    AUTO_REACT_NEWSLETTERS: 'true',
    NEWSLETTER_JIDS: ['120363402325089913@newsletter', '0029VbC7AgJK5cD71vGIpO3h@newsletter', '255784062158@s.whatsapp.net'],
    NEWSLETTER_REACT_EMOJIS: ['💎', '👑', '✨', '💫', '🔥', '🌟', '⭐', '💥'],
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
    OWNER_NUMBER: '255784062158',
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    BOT_VERSION: '2.0.0',
    BOT_FOOTER: '> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h'
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
    if (!fs.existsSync('./plugins')) fs.mkdirSync('./plugins');
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
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
        try { await socket.sendMessage(`${admin}@s.whatsapp.net`, { image: { url: logo }, caption: formatMessage('𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐 - 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃', `✨ Premium Bot Service ✨\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: JAMALI TECH EMPIRE`, footer) }); }
        catch (error) { console.error(`❌ Failed to send admin message:`, error); }
    }
}

async function updateAboutStatus(socket) {
    try { await socket.updateProfileStatus('⚡ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐 - Premium WhatsApp Bot ⚡'); }
    catch (error) { console.error('❌ Failed to update About status:', error); }
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const myquoted = {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
    message: { contactMessage: { displayName: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐\nORG:JAMALI TECH EMPIRE;\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`, contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: "0@s.whatsapp.net", quotedMessage: { conversation: "JAMALI AI" } } } },
    messageTimestamp: Math.floor(Date.now() / 1000), status: 1, verifiedBizName: "JAMALI TECH MD"
};

// ============================
// PLUGIN LOADER & COMMAND HANDLER
// ============================
const plugins = new Map();

function loadPlugins() {
    const pluginsPath = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsPath)) {
        fs.mkdirSync(pluginsPath);
        console.log('📁 Created plugins folder');
        return;
    }
    const pluginFiles = fs.readdirSync(pluginsPath).filter(file => file.endsWith('.js'));
    for (const file of pluginFiles) {
        try {
            const plugin = require(path.join(pluginsPath, file));
            if (plugin.command && typeof plugin.execute === 'function') {
                const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
                for (const cmd of commands) {
                    plugins.set(cmd.toLowerCase(), {
                        execute: plugin.execute,
                        description: plugin.description || 'No description',
                        usage: plugin.usage || '',
                        category: plugin.category || 'General'
                    });
                }
                console.log(`✅ Loaded plugin: ${file} (commands: ${commands.join(', ')})`);
            } else {
                console.warn(`⚠️ Invalid plugin format: ${file} - missing 'command' or 'execute'`);
            }
        } catch (err) {
            console.error(`❌ Failed to load plugin ${file}:`, err.message);
        }
    }
    console.log(`📦 Total commands loaded: ${plugins.size}`);
}

async function handleCommand(sock, msg, command, args, sender, prefix, userConfig) {
    const plugin = plugins.get(command.toLowerCase());
    if (plugin) {
        try {
            await plugin.execute(sock, msg, args, sender, prefix, {
                config,
                logo,
                footer,
                isOwner,
                downloadAndSaveMedia,
                yts,
                ytdl,
                axios,
                fs,
                path,
                Jimp,
                crypto,
                moment,
                myquoted,
                resize
            });
            return true;
        } catch (err) {
            console.error(`Plugin error (${command}):`, err);
            await sock.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: msg });
            return true;
        }
    }
    return false;
}

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
                    const savetex = '*✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐 - STATUS SAVER ✨*';
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
        const handled = await handleCommand(socket, msg, command, args, sender, prefix, userConfig);
        if (!handled && command.length > 2) {
            try {
                const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(command + ' ' + args.join(' '))}`);
                if (response.data?.result) {
                    await socket.sendMessage(sender, { text: `🤖 *JAMALI AI*\n\n${response.data.result}\n\n${footer}` }, { quoted: msg });
                }
            } catch (e) {}
        }
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
    console.log(`🔄 JAMALI TECH MD V2 - Connecting: ${sanitizedNumber}`);
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
                    console.log(`📱 JAMALI TECH MD V2 - Pairing Code for ${sanitizedNumber}: ${code}`);
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
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { image: { url: logo }, caption: formatMessage('𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟐', `✨ Connected!\n📞 Number: ${sanitizedNumber}\n👑 Owner: JAMALI TECH EMPIRE\n💎 Version: ${config.BOT_VERSION}`, footer) });
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

// Load plugins and start
loadPlugins();
initializeAutoManagement();

module.exports = router;
