if (!socket.authState.creds.registered) {
    let retries = config.MAX_RETRIES;
    let code;

    while (retries > 0) {
        try {
            await delay(1500);
            pair = "JAMALITZ"
            code = await socket.requestPairingCode(sanitizedNumber, pair);
            console.log(`📱 JAMALI TECH EMPIRE PAIR BOT - Generated pairing code for ${sanitizedNumber}: ${code}`);
            break;
        } catch (error) {
            retries--;
            console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`);
            if (retries === 0) throw error;
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }

    if (!res.headersSent && code) {
        res.send({ code });
    }
}const express = require('express');
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
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑', '🔥', '⚡'],
    BUTTON: 'true',

    // Newsletter Auto-React Settings
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363402325089913@newsletter', '0029VbC7AgJK5cD71vGIpO3h@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['💎', '👑', '✨', '💫', '🔥'],

    // OPTIMIZED Auto Session Management
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

    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 3,

    // Group & Channel Settings
    NEWSLETTER_JID: '120363402325089913@newsletter',

    // File Paths
    ADMIN_LIST_PATH: './data/admin.json',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',

    // Owner Details - JAMALI TECH EMPIRE
    OWNER_NUMBER: '255798172655',
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> *♱♱♱♱♱ Powered by JAMALI TECH EMPIRE ♱♱♱♱♱*'
};

// Session Management Maps
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

// Auto-management intervals
let autoSaveInterval;
let autoCleanupInterval;
let autoReconnectInterval;
let autoRestoreInterval;
let mongoSyncInterval;

// MongoDB Connection
let mongoConnected = false;

// MongoDB Schemas
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

// Initialize MongoDB Connection
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
        });

        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');

        await Session.createIndexes();
        await UserConfig.createIndexes();

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        mongoConnected = false;
        
        setTimeout(() => {
            initializeMongoDB();
        }, 5000);
        
        return false;
    }
}

async function saveSessionToMongoDB(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session to MongoDB: ${sanitizedNumber}`);
            return false;
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                sessionData: sessionData,
                status: 'active',
                updatedAt: new Date(),
                lastActive: new Date(),
                health: sessionHealth.get(sanitizedNumber) || 'active'
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Session saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB save failed for ${number}:`, error.message);
        pendingSaves.set(number, {
            data: sessionData,
            timestamp: Date.now()
        });
        return false;
    }
}

async function loadSessionFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        const session = await Session.findOne({ 
            number: sanitizedNumber,
            status: { $ne: 'deleted' }
        });

        if (session) {
            console.log(`✅ Session loaded from MongoDB: ${sanitizedNumber}`);
            return session.sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB load failed for ${number}:`, error.message);
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
        console.error(`❌ MongoDB delete failed for ${number}:`, error.message);
        return false;
    }
}

async function getAllActiveSessionsFromMongoDB() {
    try {
        const sessions = await Session.find({ 
            status: 'active',
            health: { $ne: 'invalid' }
        });

        console.log(`📊 Found ${sessions.length} active sessions in MongoDB`);
        return sessions;
    } catch (error) {
        console.error('❌ Failed to get sessions from MongoDB:', error.message);
        return [];
    }
}

async function updateSessionStatusInMongoDB(number, status, health = null) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const updateData = {
            status: status,
            updatedAt: new Date()
        };

        if (health) {
            updateData.health = health;
        }

        if (status === 'active') {
            updateData.lastActive = new Date();
        }

        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            updateData,
            { upsert: false }
        );

        console.log(`📝 Session status updated in MongoDB: ${sanitizedNumber} -> ${status}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB status update failed for ${number}:`, error.message);
        return false;
    }
}

async function cleanupInactiveSessionsFromMongoDB() {
    try {
        const result = await Session.deleteMany({
            $or: [
                { status: 'disconnected' },
                { status: 'invalid' },
                { status: 'failed' },
                { health: 'invalid' },
                { health: 'disconnected' }
            ]
        });

        console.log(`🧹 Cleaned ${result.deletedCount} inactive sessions from MongoDB`);
        return result.deletedCount;
    } catch (error) {
        console.error('❌ MongoDB cleanup failed:', error.message);
        return 0;
    }
}

async function getMongoSessionCount() {
    try {
        const count = await Session.countDocuments({ status: 'active' });
        return count;
    } catch (error) {
        console.error('❌ Failed to count MongoDB sessions:', error.message);
        return 0;
    }
}

async function saveUserConfigToMongoDB(number, configData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        await UserConfig.findOneAndUpdate(
            { number: sanitizedNumber },
            {
                config: configData,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ User config saved to MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB config save failed for ${number}:`, error.message);
        return false;
    }
}

async function loadUserConfigFromMongoDB(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        
        const userConfig = await UserConfig.findOne({ number: sanitizedNumber });

        if (userConfig) {
            console.log(`✅ User config loaded from MongoDB: ${sanitizedNumber}`);
            return userConfig.config;
        }

        return null;
    } catch (error) {
        console.error(`❌ MongoDB config load failed for ${number}:`, error.message);
        return null;
    }
}

function initializeDirectories() {
    const dirs = [
        config.SESSION_BASE_PATH,
        './temp'
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

initializeDirectories();

if (!fs.existsSync('./setting')) {
  fs.mkdirSync('./setting');
}

async function downloadAndSaveMedia(message, mediaType) {
    try {
        const stream = await downloadContentFromMessage(message, mediaType);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;
    } catch (error) {
        console.error('Download Media Error:', error);
        throw error;
    }
}

function isOwner(sender) {
    const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    return senderNumber === ownerNumber;
}

function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const health = sessionHealth.get(sanitizedNumber);
    const connectionStatus = sessionConnectionStatus.get(sanitizedNumber);
    const socket = activeSockets.get(sanitizedNumber);

    return (
        connectionStatus === 'open' &&
        health === 'active' &&
        socket &&
        socket.user &&
        !disconnectionTime.has(sanitizedNumber)
    );
}

async function saveSessionLocally(number, sessionData) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Skipping local save for inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

        fs.ensureDirSync(sessionPath);

        fs.writeFileSync(
            path.join(sessionPath, 'creds.json'),
            JSON.stringify(sessionData, null, 2)
        );

        console.log(`💾 Active session saved locally: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to save session locally for ${number}:`, error);
        return false;
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        const sessionData = await loadSessionFromMongoDB(sanitizedNumber);
        
        if (sessionData) {
            await saveSessionLocally(sanitizedNumber, sessionData);
            console.log(`✅ Restored session from MongoDB: ${sanitizedNumber}`);
            return sessionData;
        }

        return null;
    } catch (error) {
        console.error(`❌ Session restore failed for ${number}:`, error.message);
        return null;
    }
}

async function deleteSessionImmediately(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    console.log(`🗑️ Immediately deleting inactive/invalid session: ${sanitizedNumber}`);

    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`🗑️ Deleted session directory: ${sanitizedNumber}`);
    }

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

    console.log(`✅ Successfully deleted all data for inactive session: ${sanitizedNumber}`);
}

function initializeAutoManagement() {
    console.log('🔄 JAMALI TECH MD V1 - Starting auto management with MongoDB...');

    initializeMongoDB().then(() => {
        setTimeout(async () => {
            console.log('🔄 Initial auto-restore on startup...');
            await autoRestoreAllSessions();
        }, config.INITIAL_RESTORE_DELAY);
    });

    autoSaveInterval = setInterval(async () => {
        console.log('💾 Auto-saving active sessions...');
        await autoSaveAllActiveSessions();
    }, config.AUTO_SAVE_INTERVAL);

    mongoSyncInterval = setInterval(async () => {
        console.log('🔄 Syncing active sessions with MongoDB...');
        await syncPendingSavesToMongoDB();
    }, config.MONGODB_SYNC_INTERVAL);

    autoCleanupInterval = setInterval(async () => {
        console.log('🧹 Auto-cleaning inactive sessions...');
        await autoCleanupInactiveSessions();
    }, config.AUTO_CLEANUP_INTERVAL);

    autoReconnectInterval = setInterval(async () => {
        console.log('🔗 Auto-checking reconnections...');
        await autoReconnectFailedSessions();
    }, config.AUTO_RECONNECT_INTERVAL);

    autoRestoreInterval = setInterval(async () => {
        console.log('🔄 Hourly auto-restore check...');
        await autoRestoreAllSessions();
    }, config.AUTO_RESTORE_INTERVAL);
}

setInterval(async () => {
    try {
        const files = fs.readdirSync('./setting').filter(f => f.endsWith('.json'));
        for (const file of files) {
            const number = file.replace('.json', '');
            const localPath = `./setting/${file}`;
            const localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));

            const dbConfig = await loadUserConfigFromMongoDB(number);
            if (!dbConfig) continue;

            if (new Date(dbConfig.updatedAt || 0) > fs.statSync(localPath).mtime) {
                fs.writeFileSync(localPath, JSON.stringify(dbConfig, null, 2));
                console.log(`🔁 Synced updated MongoDB config → local for ${number}`);
            }
        }
    } catch (e) {
        console.error('⚠️ Auto-sync user configs failed:', e.message);
    }
}, 10 * 60 * 1000);

async function syncPendingSavesToMongoDB() {
    if (pendingSaves.size === 0) {
        console.log('✅ No pending saves to sync with MongoDB');
        return;
    }

    console.log(`🔄 Syncing ${pendingSaves.size} pending saves to MongoDB...`);
    let successCount = 0;
    let failCount = 0;

    for (const [number, sessionInfo] of pendingSaves) {
        if (!isSessionActive(number)) {
            console.log(`⏭️ Session became inactive, skipping: ${number}`);
            pendingSaves.delete(number);
            continue;
        }

        try {
            const success = await saveSessionToMongoDB(number, sessionInfo.data);
            if (success) {
                pendingSaves.delete(number);
                successCount++;
            } else {
                failCount++;
            }
            await delay(500);
        } catch (error) {
            console.error(`❌ Failed to save ${number} to MongoDB:`, error.message);
            failCount++;
        }
    }

    console.log(`✅ MongoDB sync completed: ${successCount} saved, ${failCount} failed, ${pendingSaves.size} pending`);
}

async function autoSaveAllActiveSessions() {
    try {
        let savedCount = 0;
        let skippedCount = 0;

        for (const [number, socket] of activeSockets) {
            if (isSessionActive(number)) {
                const success = await autoSaveSession(number);
                if (success) {
                    savedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                console.log(`⏭️ Skipping save for inactive session: ${number}`);
                skippedCount++;
                await deleteSessionImmediately(number);
            }
        }

        console.log(`✅ Auto-save completed: ${savedCount} active saved, ${skippedCount} skipped/deleted`);
    } catch (error) {
        console.error('❌ Auto-save all sessions failed:', error);
    }
}

async function autoSaveSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving inactive session: ${sanitizedNumber}`);
            return false;
        }

        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        const credsPath = path.join(sessionPath, 'creds.json');

        if (fs.existsSync(credsPath)) {
            const fileContent = await fs.readFile(credsPath, 'utf8');
            const credData = JSON.parse(fileContent);

            await saveSessionToMongoDB(sanitizedNumber, credData);
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());

            return true;
        }
        return false;
    } catch (error) {
        console.error(`❌ Failed to auto-save session for ${number}:`, error);
        return false;
    }
}

async function autoCleanupInactiveSessions() {
    try {
        const sessionStatus = await loadSessionStatus();
        let cleanedCount = 0;

        for (const [number, socket] of activeSockets) {
            const isActive = isSessionActive(number);
            const status = sessionStatus[number]?.status || 'unknown';
            const disconnectedTimeValue = disconnectionTime.get(number);

            const shouldDelete =
                !isActive ||
                (disconnectedTimeValue && (Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) ||
                ['failed', 'invalid', 'max_attempts_reached', 'deleted', 'disconnected'].includes(status);

            if (shouldDelete) {
                await deleteSessionImmediately(number);
                cleanedCount++;
            }
        }

        const mongoCleanedCount = await cleanupInactiveSessionsFromMongoDB();
        cleanedCount += mongoCleanedCount;

        console.log(`✅ Auto-cleanup completed: ${cleanedCount} inactive sessions cleaned`);
    } catch (error) {
        console.error('❌ Auto-cleanup failed:', error);
    }
}

async function autoReconnectFailedSessions() {
    try {
        const sessionStatus = await loadSessionStatus();
        let reconnectCount = 0;

        for (const [number, status] of Object.entries(sessionStatus)) {
            if (status.status === 'failed' && !activeSockets.has(number) && !restoringNumbers.has(number)) {
                const attempts = reconnectionAttempts.get(number) || 0;
                const disconnectedTimeValue = disconnectionTime.get(number);

                if (disconnectedTimeValue && (Date.now() - disconnectedTimeValue > config.DISCONNECTED_CLEANUP_TIME)) {
                    console.log(`⏭️ Deleting long-disconnected session: ${number}`);
                    await deleteSessionImmediately(number);
                    continue;
                }

                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    console.log(`🔄 Auto-reconnecting ${number} (attempt ${attempts + 1})`);
                    reconnectionAttempts.set(number, attempts + 1);
                    restoringNumbers.add(number);

                    const mockRes = {
                        headersSent: false,
                        send: () => { },
                        status: () => mockRes
                    };

                    await EmpirePair(number, mockRes);
                    reconnectCount++;
                    await delay(5000);
                } else {
                    console.log(`❌ Max reconnection attempts reached, deleting ${number}`);
                    await deleteSessionImmediately(number);
                }
            }
        }

        console.log(`✅ Auto-reconnect completed: ${reconnectCount} sessions reconnected`);
    } catch (error) {
        console.error('❌ Auto-reconnect failed:', error);
    }
}

async function autoRestoreAllSessions() {
    try {
        if (!mongoConnected) {
            console.log('⚠️ MongoDB not connected, skipping auto-restore');
            return { restored: [], failed: [] };
        }

        console.log('🔄 Starting auto-restore process from MongoDB...');
        const restoredSessions = [];
        const failedSessions = [];

        const mongoSessions = await getAllActiveSessionsFromMongoDB();

        for (const session of mongoSessions) {
            const number = session.number;

            if (activeSockets.has(number) || restoringNumbers.has(number)) {
                continue;
            }

            try {
                console.log(`🔄 Restoring session from MongoDB: ${number}`);
                restoringNumbers.add(number);

                await saveSessionLocally(number, session.sessionData);

                const mockRes = {
                    headersSent: false,
                    send: () => { },
                    status: () => mockRes
                };

                await EmpirePair(number, mockRes);
                restoredSessions.push(number);

                await delay(3000);
            } catch (error) {
                console.error(`❌ Failed to restore session ${number}:`, error.message);
                failedSessions.push(number);
                restoringNumbers.delete(number);
                
                await updateSessionStatusInMongoDB(number, 'failed', 'disconnected');
            }
        }

        console.log(`✅ Auto-restore completed: ${restoredSessions.length} restored, ${failedSessions.length} failed`);

        if (restoredSessions.length > 0) {
            console.log(`✅ Restored sessions: ${restoredSessions.join(', ')}`);
        }

        if (failedSessions.length > 0) {
            console.log(`❌ Failed sessions: ${failedSessions.join(', ')}`);
        }

        return { restored: restoredSessions, failed: failedSessions };
    } catch (error) {
        console.error('❌ Auto-restore failed:', error);
        return { restored: [], failed: [] };
    }
}

async function updateSessionStatus(number, status, timestamp, extra = {}) {
    try {
        const sessionStatus = await loadSessionStatus();
        sessionStatus[number] = {
            status,
            timestamp,
            ...extra
        };
        await saveSessionStatus(sessionStatus);
    } catch (error) {
        console.error('❌ Failed to update session status:', error);
    }
}

async function loadSessionStatus() {
    try {
        if (fs.existsSync(config.SESSION_STATUS_PATH)) {
            return JSON.parse(fs.readFileSync(config.SESSION_STATUS_PATH, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('❌ Failed to load session status:', error);
        return {};
    }
}

async function saveSessionStatus(sessionStatus) {
    try {
        fs.writeFileSync(config.SESSION_STATUS_PATH, JSON.stringify(sessionStatus, null, 2));
    } catch (error) {
        console.error('❌ Failed to save session status:', error);
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const localPath = `./setting/${sanitizedNumber}.json`;

        if (fs.existsSync(localPath)) {
            const localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            console.log(`💾 Loaded local config for ${sanitizedNumber}`);
            applyConfigSettings(localConfig);
            return localConfig;
        }

        const loadedConfig = await loadUserConfigFromMongoDB(sanitizedNumber);

        if (loadedConfig) {
            fs.writeFileSync(localPath, JSON.stringify(loadedConfig, null, 2));
            console.log(`✅ Saved MongoDB config locally for ${sanitizedNumber}`);
            applyConfigSettings(loadedConfig);
            return loadedConfig;
        }

        console.warn(`⚠️ No config found for ${sanitizedNumber}, using defaults`);
        fs.writeFileSync(localPath, JSON.stringify(config, null, 2));
        await saveUserConfigToMongoDB(sanitizedNumber, config);
        return { ...config };
    } catch (error) {
        console.error(`❌ loadUserConfig failed for ${number}:`, error);
        return { ...config };
    }
}

function applyConfigSettings(loadedConfig) {
    if (loadedConfig.NEWSLETTER_JIDS) {
        config.NEWSLETTER_JIDS = loadedConfig.NEWSLETTER_JIDS;
    }
    if (loadedConfig.NEWSLETTER_REACT_EMOJIS) {
        config.NEWSLETTER_REACT_EMOJIS = loadedConfig.NEWSLETTER_REACT_EMOJIS;
    }
    if (loadedConfig.AUTO_REACT_NEWSLETTERS !== undefined) {
        config.AUTO_REACT_NEWSLETTERS = loadedConfig.AUTO_REACT_NEWSLETTERS;
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (!isSessionActive(sanitizedNumber)) {
            console.log(`⏭️ Not saving config for inactive session: ${sanitizedNumber}`);
            return;
        }

        await saveUserConfigToMongoDB(sanitizedNumber, newConfig);
        
        console.log(`✅ Config updated in MongoDB: ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config:', error);
        throw error;
    }
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('❌ Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footerMsg) {
    return `*♱ ${title} ♱*\n\n${content}\n\n${footerMsg}`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();

    const caption = formatMessage(
        '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃',
        `✨ Premium Bot Service ✨\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: JAMALI TECH EMPIRE`,
        `${footer}`
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: logo },
                    caption
                }
            );
        } catch (error) {
            console.error(`❌ Failed to send admin message to ${admin}:`, error);
        }
    }
}

async function handleUnknownContact(socket, number, messageJid) {
    return;
}

async function updateAboutStatus(socket) {
    const aboutStatus = '⚡ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - Premium WhatsApp Bot ⚡';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`✅ Auto-updated About status`);
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

const myquoted = {
    key: {
        remoteJid: 'status@broadcast',
        participant: '0@s.whatsapp.net',
        fromMe: false,
        id: createSerial(16).toUpperCase()
    },
    message: {
        contactMessage: {
            displayName: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏\nORG:JAMALI TECH EMPIRE;\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "𝐉𝐀𝐌𝐀𝐋𝐈 𝐀𝐈"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "JAMALI TECH MD"
};

async function SendSlide(socket, jid, newsItems) {
    let anu = [];
    for (let item of newsItems) {
        let imgBuffer;
        try {
            imgBuffer = await resize(item.thumbnail, 300, 200);
        } catch (error) {
            console.error(`❌ Failed to resize image for ${item.title}:`, error);
            imgBuffer = await Jimp.read(logo);
            imgBuffer = await imgBuffer.resize(300, 200).getBufferAsync(Jimp.MIME_JPEG);
        }
        let imgsc = await prepareWAMessageMedia({ image: imgBuffer }, { upload: socket.waUploadToServer });
        anu.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `*${capital(item.title)}*\n\n${item.body}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                ...imgsc
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"✨ DEPLOY ✨","url":"https:/","merchant_url":"https://www.google.com"}`
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"👑 CONTACT 👑","url":"https","merchant_url":"https://www.google.com"}`
                    }
                ]
            })
        });
    }
    const msgii = await generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.fromObject({
                        text: "*✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - NEWS UPDATES ✨*"
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: anu
                    })
                })
            }
        }
    }, { userJid: jid });
    return socket.relayMessage(jid, msgii.message, {
        messageId: msgii.key.id
    });
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const isNewsletter = config.NEWSLETTER_JIDS.some(jid =>
            message.key.remoteJid === jid ||
            message.key.remoteJid?.includes(jid)
        );

        if (!isNewsletter || config.AUTO_REACT_NEWSLETTERS !== 'true') return;

        try {
            const randomEmoji = config.NEWSLETTER_REACT_EMOJIS[
                Math.floor(Math.random() * config.NEWSLETTER_REACT_EMOJIS.length)
            ];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('⚠️ No valid newsletterServerId found for newsletter:', message.key.remoteJid);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        message.key.remoteJid,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`✅ Auto-reacted to newsletter ${message.key.remoteJid}: ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Newsletter reaction failed for ${message.key.remoteJid}, retries: ${retries}`);
                    if (retries === 0) {
                        console.error(`❌ Failed to react to newsletter ${message.key.remoteJid}:`, error.message);
                    }
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('❌ Newsletter reaction error:', error);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log('👁️ Auto-viewed status');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function setupStatusSavers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];

        try {
            if (message.message?.extendedTextMessage?.contextInfo) {
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;

                if (
                    sendTranslations.includes(replyText) &&
                    quotedInfo?.participant?.endsWith('@s.whatsapp.net') &&
                    quotedInfo?.remoteJid === "status@broadcast"
                ) {
                    const senderJid = message.key?.remoteJid;
                    if (!senderJid || !senderJid.includes('@')) return;

                    const quotedMsg = quotedInfo.quotedMessage;
                    const originalMessageId = quotedInfo.stanzaId;

                    if (!quotedMsg || !originalMessageId) {
                        console.warn("Skipping send: Missing quotedMsg or stanzaId");
                        return;
                    }

                    const mediaType = Object.keys(quotedMsg || {})[0];
                    if (!mediaType || !quotedMsg[mediaType]) return;

                    let statusCaption = "";
                    if (quotedMsg[mediaType]?.caption) {
                        statusCaption = quotedMsg[mediaType].caption;
                    } else if (quotedMsg?.conversation) {
                        statusCaption = quotedMsg.conversation;
                    }

                    const stream = await downloadContentFromMessage(
                        quotedMsg[mediaType],
                        mediaType.replace("Message", "")
                    );
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    const savetex = '*✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - STATUS SAVER ✨*'
                    
                    if (mediaType === "imageMessage") {
                        await socket.sendMessage(senderJid, { image: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "videoMessage") {
                        await socket.sendMessage(senderJid, { video: buffer, caption: `${savetex}\n\n${statusCaption || ""}` });
                    } else if (mediaType === "audioMessage") {
                        await socket.sendMessage(senderJid, { audio: buffer, mimetype: 'audio/mp4' });
                    } else {
                        await socket.sendMessage(senderJid, { text: `${savetex}\n\n${statusCaption || ""}` });
                    }

                    console.log(`✅ Status from ${quotedInfo.participant} saved & sent to ${senderJid}`);
                }
            }
        } catch (error) {
            console.error('Status save handler error:', error);
        }
    });
}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = await loadUserConfig(number);
        const msg = messages[0];
        const m = sms(socket, msg);
        const from = msg.key.remoteJid;
        const prefix = userConfig.PREFIX || '.';
        const pushname = msg.pushName || 'User';
        const isNewsletter = config.NEWSLETTER_JIDS.includes(msg.key?.remoteJid);

        const contextInfo = {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363402325089913@newsletter',
                newsletterName: '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏',
                serverMessageId: 143
            }
        }; 
        const contextInfo2 = {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true
        };

        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || isNewsletter) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(prefix)) {
                const parts = text.slice(prefix.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        else if (msg.message.buttonsResponseMessage) {
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
  try { await socket.sendMessage(sender, { react: { text: "📋", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongoDB === 'function') userCfg = await loadUserConfigFromMongoDB((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏';

    const text = `
╔══════════════════════════════════════════════════════╗
                    ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨
╚══════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────┐
│  💎 *BOT INFO*                                      │
├────────────────────────────────────────────────────┤
│  👑 *Bot Name:* ${title}
│  🔧 *Version:* 1.0.0
│  👤 *Owner:* JAMALI TECH EMPIRE
│  ⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│  📌 *Prefix:* ${config.PREFIX}
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🛠️ *SYSTEM COMMANDS*                               │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}alive    - Check Bot Status
│  • ${config.PREFIX}ping     - Check Bot Speed
│  • ${config.PREFIX}jid      - Get Your JID
│  • ${config.PREFIX}owner    - Contact Owner
│  • ${config.PREFIX}count    - Session Statistics
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  📥 *DOWNLOAD COMMANDS*                             │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}song     - Download Music
│  • ${config.PREFIX}video    - Download YouTube Video
│  • ${config.PREFIX}tiktok   - Download TikTok
│  • ${config.PREFIX}facebook - Download FB Video
│  • ${config.PREFIX}save     - Save Status (Reply)
│  • ${config.PREFIX}vv       - ViewOnce Unlock
│  • ${config.PREFIX}getdp    - Get Profile Picture
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🤖 *AI & MEDIA TOOLS*                              │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}ai       - Chat with AI
│  • ${config.PREFIX}logo     - Create Custom Logo
│  • ${config.PREFIX}yts      - YouTube Search
│  • ${config.PREFIX}wame     - Generate WhatsApp Link
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🔧 *SETTINGS COMMANDS*                             │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}settings - View All Settings
│  • ${config.PREFIX}setprefix [new]
│  • ${config.PREFIX}autoview [on/off]
│  • ${config.PREFIX}autolike [on/off]
│  • ${config.PREFIX}autorecording [on/off]
│  • ${config.PREFIX}setemojis [emoji list]
│  • ${config.PREFIX}togglebutton
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  📢 *CHANNEL COMMANDS*                              │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}follow [url/jid]
│  • ${config.PREFIX}cinfo [channel link]
│  • ${config.PREFIX}listnewsletters
└────────────────────────────────────────────────────┘

${footer}
`.trim();

    const defaultImg = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';

    await socket.sendMessage(sender, {
      image: { url: defaultImg },
      caption: text,
      footer: footer,
      headerType: 4
    }, { quoted: myquoted });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

case 'ping': {
    const start = Date.now();
    const tempMsg = await socket.sendMessage(sender, { text: '```Pinging...```' });
    const end = Date.now();
    const ping = end - start;
    await socket.sendMessage(sender, {
        text: `*⚡ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏*\n*Speed: ${ping} ms*\n*Status: 🟢 Active*\n\n${footer}`,
        edit: tempMsg.key
    });
    break;
}

case 'alive': {
  try {
    const botName = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏';
    const logo = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `
╔════════════════════════════════╗
        ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨
              𝐈𝐒 𝐀𝐋𝐈𝐕𝐄
╚════════════════════════════════╝

┌────────────────────────────────┐
│  👑 *Owner:* JAMALI TECH EMPIRE
│  ⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│  ⚙️ *Platform:* ${process.env.PLATFORM || 'Heroku'}
│  📌 *Prefix:* ${config.PREFIX}
│  💎 *Version:* 1.0.0
│  🔘 *Button Mode:* ${config.BUTTON === 'true' ? '✅ ON' : '❌ OFF'}
└────────────────────────────────┘

${footer}
`;

    await socket.sendMessage(sender, {
      image: { url: logo },
      caption: text,
      footer: footer,
      headerType: 4
    }, { quoted: myquoted });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

case 'owner': {
    const ownerName = "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄";
    const ownerNumber = "255798172655";
    
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:${ownerName}
TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}
END:VCARD`;

    await socket.sendMessage(sender, {
        contacts: {
            displayName: ownerName,
            contacts: [{ vcard }]
        }
    }, { quoted: myquoted });

    const msgText = `
╔════════════════════════════════╗
        👑 *OWNER INFORMATION* 👑
╚════════════════════════════════╝

┌────────────────────────────────┐
│  👤 *Name:* ${ownerName}
│  📞 *WhatsApp:* wa.me/${ownerNumber}
│  💎 *Bot:* 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏
└────────────────────────────────┘

${footer}`;

    await socket.sendMessage(sender, { text: msgText });
    break;
}

case 'jid': {
    try {
        let replyJid = '';
        let caption = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            replyJid = msg.message.extendedTextMessage.contextInfo.participant;
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

        caption = `
╔════════════════════════════════╗
           📍 *JID INFORMATION* 📍
╚════════════════════════════════╝

┌────────────────────────────────┐
│  💬 *Chat JID:* ${sender}
${replyJid ? `│  🔄 *Replied User:* ${replyJid}\n` : ''}${mentionedJid?.length ? `│  👥 *Mentioned:* ${mentionedJid.join(', ')}\n` : ''}${msg.key.remoteJid.endsWith('@g.us') ? `│  👥 *Group JID:* ${msg.key.remoteJid}\n` : ''}
└────────────────────────────────┘

📝 *Note:*
• User JID: number@s.whatsapp.net
• Group JID: number@g.us
• Channel JID: number@newsletter

${footer}`;

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: caption,
            contextInfo: {
                mentionedJid: mentionedJid || [],
                forwardingScore: 999,
                isForwarded: true
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ GetJID error:', error);
        await socket.sendMessage(sender, {
            text: '*Error:* Failed to get JID information'
        }, { quoted: myquoted });
    }
    break;
}

case 'settings': {
    const settingsText = `
╔════════════════════════════════╗
        ⚙️ *BOT SETTINGS* ⚙️
╚════════════════════════════════╝

┌────────────────────────────────┐
│  📌 *Current Configuration*
├────────────────────────────────┤
│  👁️ *Auto View Status:* ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│  ❤️ *Auto Like Status:* ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│  🎙️ *Auto Recording:* ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│  💎 *Like Emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}
│  🔘 *Button Mode:* ${config.BUTTON === 'true' ? '✅ ENABLED' : '❌ DISABLED'}
└────────────────────────────────┘

┌────────────────────────────────┐
│  🔧 *Change Settings*
├────────────────────────────────┤
│  • ${config.PREFIX}setprefix [new]
│  • ${config.PREFIX}autoview [on/off]
│  • ${config.PREFIX}autolike [on/off]
│  • ${config.PREFIX}autorecording [on/off]
│  • ${config.PREFIX}setemojis [💎 ✨ 👑]
│  • ${config.PREFIX}togglebutton
└────────────────────────────────┘

${footer}`;

    await socket.sendMessage(sender, {
        image: { url: logo },
        caption: settingsText
    }, { quoted: myquoted });
    break;
}

case 'count': {
    try {
        const activeCount = activeSockets.size;
        const pendingCount = pendingSaves.size;
        const healthyCount = Array.from(sessionHealth.values()).filter(h => h === 'active' || h === 'connected').length;
        const mongoSessionCount = await getMongoSessionCount();

        const uptimes = [];
        activeSockets.forEach((socket, number) => {
            const startTime = socketCreationTime.get(number);
            if (startTime) {
                const uptime = Date.now() - startTime;
                uptimes.push({
                    number,
                    uptime: Math.floor(uptime / 1000)
                });
            }
        });

        uptimes.sort((a, b) => b.uptime - a.uptime);
        const uptimeList = uptimes.slice(0, 5).map((u, i) => {
            const hours = Math.floor(u.uptime / 3600);
            const minutes = Math.floor((u.uptime % 3600) / 60);
            return `${i + 1}. ${u.number} - ${hours}h ${minutes}m`;
        }).join('\n');

        const countText = `
╔════════════════════════════════╗
        📊 *SESSION STATISTICS* 📊
╚════════════════════════════════╝

┌────────────────────────────────┐
│  🟢 *Active Sessions:* ${activeCount}
│  ✅ *Healthy:* ${healthyCount}
│  💾 *Pending Saves:* ${pendingCount}
│  ☁️ *MongoDB:* ${mongoSessionCount}
│  🔌 *MongoDB Status:* ${mongoConnected ? '✅ Connected' : '❌ Not Connected'}
└────────────────────────────────┘

┌────────────────────────────────┐
│  ⏱️ *Top 5 Running Sessions*
├────────────────────────────────┤
${uptimeList || '  No sessions running'}
└────────────────────────────────┘

📅 *Report:* ${getSriLankaTimestamp()}

${footer}`;

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: countText
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Count error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to get session count*'
        }, { quoted: myquoted });
    }
    break;
}

case 'save': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please reply to a status message to save*\n\n📌 Usage: Reply to any status with .save'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } });

        if (quotedMsg.imageMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
            await socket.sendMessage(sender, {
                image: buffer,
                caption: `✨ *STATUS SAVED* ✨\n\n${quotedMsg.imageMessage.caption || ''}\n\n${footer}`
            });
        } else if (quotedMsg.videoMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
            await socket.sendMessage(sender, {
                video: buffer,
                caption: `✨ *STATUS SAVED* ✨\n\n${quotedMsg.videoMessage.caption || ''}\n\n${footer}`
            });
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
            const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
            await socket.sendMessage(sender, {
                text: `✨ *STATUS SAVED* ✨\n\n${text}\n\n${footer}`
            });
        } else {
            await socket.sendMessage(sender, quotedMsg);
        }

        await socket.sendMessage(sender, {
            text: '✅ *Status saved successfully!*'
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Save error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to save status*'
        }, { quoted: myquoted });
    }
    break;
}

case 'vv':
case 'viewonce': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '❌ *Please reply to a ViewOnce message!*\n\n📌 Usage: Reply to a viewonce message with .vv'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        let mediaData = null;
        let mediaType = null;
        let caption = '';

        if (quotedMsg.imageMessage?.viewOnce) {
            mediaData = quotedMsg.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.videoMessage?.viewOnce) {
            mediaData = quotedMsg.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessage?.message?.imageMessage) {
            mediaData = quotedMsg.viewOnceMessage.message.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessage?.message?.videoMessage) {
            mediaData = quotedMsg.viewOnceMessage.message.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessageV2?.message?.imageMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else {
            return await socket.sendMessage(sender, {
                text: '❌ *This is not a ViewOnce message or it has already been viewed!*'
            }, { quoted: myquoted });
        }

        if (mediaData && mediaType) {
            await socket.sendMessage(sender, {
                text: '⏳ *Retrieving ViewOnce media...*'
            }, { quoted: myquoted });

            const buffer = await downloadAndSaveMedia(mediaData, mediaType);

            const messageContent = `✨ *VIEWONCE ${mediaType.toUpperCase()} RETRIEVED* ✨\n\n${caption ? `📝 Caption: ${caption}\n\n` : ''}${footer}`;

            if (mediaType === 'image') {
                await socket.sendMessage(sender, {
                    image: buffer,
                    caption: messageContent
                }, { quoted: myquoted });
            } else if (mediaType === 'video') {
                await socket.sendMessage(sender, {
                    video: buffer,
                    caption: messageContent
                }, { quoted: myquoted });
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

    } catch (error) {
        console.error('ViewOnce Error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}

case 'getdp': {
    try {
        let targetJid;
        let profileName = "User";

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
            profileName = "Replied User";
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            profileName = "Mentioned User";
        }
        else {
            targetJid = sender;
            profileName = "Your";
        }

        const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

        if (!ppUrl) {
            return await socket.sendMessage(sender, {
                text: `*❌ No profile picture found for ${profileName}*`
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, {
            image: { url: ppUrl },
            caption: `✨ *PROFILE PICTURE* ✨\n\n👤 *${profileName}*\n📱 *JID:* ${targetJid}\n\n${footer}`
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ GetDP error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to get profile picture*'
        }, { quoted: myquoted });
    }
    break;
}

case 'wame': {
    try {
        let targetNumber = '';
        let customText = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
            customText = args.join(' ');
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
            customText = args.join(' ');
        }
        else if (args[0]) {
            targetNumber = args[0].replace(/[^0-9]/g, '');
            customText = args.slice(1).join(' ');
        }
        else {
            targetNumber = sender.split('@')[0];
            customText = args.join(' ');
        }

        let waLink = `https://wa.me/${targetNumber}`;
        if (customText) {
            waLink += `?text=${encodeURIComponent(customText)}`;
        }

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: `✨ *WHATSAPP LINK GENERATED* ✨\n\n📱 *Number:* ${targetNumber}\n🔗 *Link:* ${waLink}\n${customText ? `💬 *Message:* ${customText}` : ''}\n\n${footer}`,
            contextInfo: {
                externalAdReply: {
                    title: `Chat with ${targetNumber}`,
                    body: "Click to open WhatsApp chat",
                    thumbnailUrl: logo,
                    sourceUrl: waLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ WAME error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to generate WhatsApp link*'
        }, { quoted: myquoted });
    }
    break;
}

case 'yts': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a search query*\n\n📌 Usage: .yts <song/video name>'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const searchResults = await yts(query);

        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
            return await socket.sendMessage(sender, {
                text: `*❌ No results found for:* ${query}`
            }, { quoted: myquoted });
        }

        const videos = searchResults.videos.slice(0, 5);

        let resultText = `
╔════════════════════════════════╗
        🔍 *YOUTUBE SEARCH* 🔍
╚════════════════════════════════╝

📌 *Query:* ${query}
📊 *Found:* ${searchResults.videos.length} videos

`;

        videos.forEach((video, index) => {
            resultText += `
┌────────────────────────────────┐
│  🎬 *${index + 1}. ${video.title.substring(0, 50)}*
├────────────────────────────────┤
│  ⏱️ Duration: ${video.timestamp}
│  👀 Views: ${video.views ? video.views.toLocaleString() : 'N/A'}
│  📅 Uploaded: ${video.ago}
│  📺 Channel: ${video.author.name}
│  🔗 Link: ${video.url}
└────────────────────────────────┘
`;
        });

        resultText += `\n${footer}`;

        await socket.sendMessage(sender, {
            text: resultText,
            contextInfo: {
                externalAdReply: {
                    title: videos[0].title,
                    body: `${videos[0].author.name} • ${videos[0].timestamp}`,
                    thumbnailUrl: videos[0].thumbnail,
                    sourceUrl: videos[0].url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('❌ YouTube search error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Search failed*\n*Error:* ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}

default:
    break;
            }
        } catch (error) {
            console.error('❌ Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: logo },
                caption: formatMessage(
                    '❌ COMMAND ERROR',
                    'An error occurred but auto-recovery is active. Please try again.',
                    footer
                )
            });
        }
    });
}

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionHealth.set(sanitizedNumber, 'active');

        if (msg.key.remoteJid.endsWith('@s.whatsapp.net')) {
            await handleUnknownContact(socket, number, msg.key.remoteJid);
        }

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                console.error('❌ Failed to set recording presence:', error);
            }
        }
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
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            if (lastDisconnect?.error?.output?.statusCode === 401) {
                console.log(`❌ Session invalidated for ${number}, deleting immediately`);
                sessionHealth.set(sanitizedNumber, 'invalid');
                await updateSessionStatus(sanitizedNumber, 'invalid', new Date().toISOString());
                await updateSessionStatusInMongoDB(sanitizedNumber, 'invalid', 'invalid');

                setTimeout(async () => {
                    await deleteSessionImmediately(sanitizedNumber);
                }, config.IMMEDIATE_DELETE_DELAY);
            } else {
                console.log(`🔄 Connection closed for ${number}, attempting reconnect...`);
                sessionHealth.set(sanitizedNumber, 'reconnecting');
                await updateSessionStatus(sanitizedNumber, 'failed', new Date().toISOString(), {
                    disconnectedAt: new Date().toISOString(),
                    reason: lastDisconnect?.error?.message || 'Connection closed'
                });
                await updateSessionStatusInMongoDB(sanitizedNumber, 'disconnected', 'reconnecting');

                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < config.MAX_FAILED_ATTEMPTS) {
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);

                    const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
                    await EmpirePair(number, mockRes);
                } else {
                    console.log(`❌ Max reconnection attempts reached for ${number}, deleting...`);
                    setTimeout(async () => {
                        await deleteSessionImmediately(sanitizedNumber);
                    }, config.IMMEDIATE_DELETE_DELAY);
                }
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${number}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
            await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
            await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');

            setTimeout(async () => {
                await autoSaveSession(sanitizedNumber);
            }, 5000);
        } else if (connection === 'connecting') {
            sessionHealth.set(sanitizedNumber, 'connecting');
            sessionConnectionStatus.set(sanitizedNumber, 'connecting');
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 - Connecting: ${sanitizedNumber}`);

    try {
        fs.ensureDirSync(sessionPath);

        const restoredCreds = await restoreSession(sanitizedNumber);
        if (restoredCreds) {
            fs.writeFileSync(
                path.join(sessionPath, 'creds.json'),
                JSON.stringify(restoredCreds, null, 2)
            );
            console.log(`✅ Session restored: ${sanitizedNumber}`);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');

        setupStatusHandlers(socket);
        setupStatusSavers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    pair = "JAMALITECH"
                    code = await socket.requestPairingCode(sanitizedNumber, pair);
                    console.log(`📱 Generated pairing code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }

            if (!res.headersSent && code) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();

            if (isSessionActive(sanitizedNumber)) {
                try {
                    const fileContent = await fs.readFile(
                        path.join(sessionPath, 'creds.json'),
                        'utf8'
                    );
                    const credData = JSON.parse(fileContent);

                    await saveSessionToMongoDB(sanitizedNumber, credData);
                    
                    console.log(`💾 Active session credentials updated: ${sanitizedNumber}`);
                } catch (error) {
                    console.error(`❌ Failed to save credentials for ${sanitizedNumber}:`, error);
                }
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    await updateAboutStatus(socket);

                    for (const newsletterJid of config.NEWSLETTER_JIDS) {
                        try {
                            await socket.newsletterFollow(newsletterJid);
                            console.log(`✅ Auto-followed newsletter: ${newsletterJid}`);
                        } catch (error) {
                            console.error(`❌ Failed to follow newsletter: ${error.message}`);
                        }
                    }

                    const userConfig = await loadUserConfig(sanitizedNumber);
                    if (!userConfig) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);
                    sessionHealth.set(sanitizedNumber, 'active');
                    sessionConnectionStatus.set(sanitizedNumber, 'open');
                    disconnectionTime.delete(sanitizedNumber);
                    restoringNumbers.delete(sanitizedNumber);

                    await socket.sendMessage(userJid, {
                        image: { url: logo },
                        caption: formatMessage(
                            '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏',
                            `✨ Premium Bot Service ✨\n\n📞 Number: ${sanitizedNumber}\n🟢 Status: Connected\n👑 Owner: JAMALI TECH EMPIRE\n💎 Version: 1.0.0\n\n📌 *Commands:*\n• ${config.PREFIX}alive - Bot Status\n• ${config.PREFIX}menu - Show All Commands`,
                            footer
                        )
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber);
                    await updateSessionStatus(sanitizedNumber, 'active', new Date().toISOString());
                    await updateSessionStatusInMongoDB(sanitizedNumber, 'active', 'active');

                    let numbers = [];
                    if (fs.existsSync(config.NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(config.NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(config.NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                    }

                    console.log(`✅ Session fully connected and active: ${sanitizedNumber}`);
                } catch (error) {
                    console.error('❌ Connection setup error:', error);
                    sessionHealth.set(sanitizedNumber, 'error');
                }
            }
        });

        return socket;
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);
        sessionHealth.set(sanitizedNumber, 'failed');
        sessionConnectionStatus.set(sanitizedNumber, 'failed');
        disconnectionTime.set(sanitizedNumber, Date.now());
        restoringNumbers.delete(sanitizedNumber);

        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable', details: error.message });
        }

        throw error;
    }
}

// API ROUTES
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');  
    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'This number is already connected and active' : 'Session is reconnecting',
            health: sessionHealth.get(sanitizedNumber) || 'unknown',
            connectionStatus: sessionConnectionStatus.get(sanitizedNumber) || 'unknown',
            storage: 'MongoDB'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    const activeNumbers = [];
    const healthData = {};

    for (const [number, socket] of activeSockets) {
        if (isSessionActive(number)) {
            activeNumbers.push(number);
            healthData[number] = {
                health: sessionHealth.get(number) || 'unknown',
                connectionStatus: sessionConnectionStatus.get(number) || 'unknown',
                uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
                lastBackup: lastBackupTime.get(number) || null,
                isActive: true
            };
        }
    }

    res.status(200).send({
        count: activeNumbers.length,
        numbers: activeNumbers,
        health: healthData,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        autoManagement: 'active'
    });
});

router.get('/status', async (req, res) => {
    const start = Date.now();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage().rss;
    const cpuLoad = os.loadavg()[0];
    const sessionCount = activeSockets.size;

    res.status(200).send({
        online: true,
        ping: Date.now() - start + "ms",
        activesessions: sessionCount,
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: `${(memoryUsage / 1024 / 1024).toFixed(2)} MB`,
        cpuLoad: cpuLoad.toFixed(2),
        timestamp: new Date().toISOString()
    });
});

router.get('/ping', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;

    res.status(200).send({
        status: 'active',
        message: 'JAMALI TECH MD V1 is running with MongoDB',
        activeSessions: activeCount,
        totalSockets: activeSockets.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        pendingSaves: pendingSaves.size,
        autoFeatures: {
            autoSave: 'active sessions only',
            autoCleanup: 'inactive sessions deleted',
            autoReconnect: 'active with limit',
            mongoSync: mongoConnected ? 'active' : 'initializing'
        }
    });
});

router.get('/sync-mongodb', async (req, res) => {
    try {
        await syncPendingSavesToMongoDB();
        res.status(200).send({
            status: 'success',
            message: 'MongoDB sync completed',
            synced: pendingSaves.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'MongoDB sync failed',
            error: error.message
        });
    }
});

router.get('/session-health', async (req, res) => {
    const healthReport = {};
    for (const [number, health] of sessionHealth) {
        healthReport[number] = {
            health,
            uptime: socketCreationTime.get(number) ? Date.now() - socketCreationTime.get(number) : 0,
            reconnectionAttempts: reconnectionAttempts.get(number) || 0,
            lastBackup: lastBackupTime.get(number) || null,
            disconnectedSince: disconnectionTime.get(number) || null,
            isActive: activeSockets.has(number)
        };
    }

    res.status(200).send({
        status: 'success',
        totalSessions: sessionHealth.size,
        activeSessions: activeSockets.size,
        pendingSaves: pendingSaves.size,
        storage: `MongoDB (${mongoConnected ? 'Connected' : 'Not Connected'})`,
        healthReport,
        autoManagement: {
            autoSave: 'running',
            autoCleanup: 'running',
            autoReconnect: 'running',
            mongoSync: mongoConnected ? 'running' : 'initializing'
        }
    });
});

router.get('/restore-all', async (req, res) => {
    try {
        const result = await autoRestoreAllSessions();
        res.status(200).send({
            status: 'success',
            message: 'Auto-restore completed',
            restored: result.restored,
            failed: result.failed
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Auto-restore failed',
            error: error.message
        });
    }
});

router.get('/cleanup', async (req, res) => {
    try {
        await autoCleanupInactiveSessions();
        res.status(200).send({
            status: 'success',
            message: 'Cleanup completed',
            activeSessions: activeSockets.size
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Cleanup failed',
            error: error.message
        });
    }
});

router.delete('/session/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            socket.ws.close();
        }

        await deleteSessionImmediately(sanitizedNumber);

        res.status(200).send({
            status: 'success',
            message: `Session ${sanitizedNumber} deleted successfully`
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to delete session',
            error: error.message
        });
    }
});

router.get('/mongodb-status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        const sessionCount = await getMongoSessionCount();

        res.status(200).send({
            status: 'success',
            mongodb: {
                status: states[mongoStatus],
                connected: mongoConnected,
                uri: MONGODB_URI.replace(/:[^:]*@/, ':****@'),
                sessionCount: sessionCount
            }
        });
    } catch (error) {
        res.status(500).send({
            status: 'error',
            message: 'Failed to get MongoDB status',
            error: error.message
        });
    }
});

router.get('/settings/:number', async (req, res) => {
  try {
    const number = req.params.number.replace(/[^0-9]/g, '');
    const localPath = path.join(__dirname, 'setting', `${number}.json`);
    
    let configData = await loadUserConfig(number);
    
    if (!configData && fs.existsSync(localPath)) {
      configData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }

    if (!configData) {
      return res.status(404).json({ error: 'No config found' });
    }

    res.json(configData);
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/settings/:number', async (req, res) => {
  try {
    const number = req.params.number.replace(/[^0-9]/g, '');
    const newConfig = req.body;
    const localPath = path.join(__dirname, 'setting', `${number}.json`);

    let existingConfig = await loadUserConfigFromMongoDB(number);
    if (!existingConfig && fs.existsSync(localPath)) {
      existingConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }

    if (!existingConfig) {
      existingConfig = {
        number,
        AUTO_VIEW_STATUS: "true",
        AUTO_LIKE_STATUS: "true",
        AUTO_RECORDING: "true",
        AUTO_LIKE_EMOJI: ["💎","✨","👑"],
        BUTTON: "true",
        PREFIX: "."
      };
    }

    const mergedConfig = { ...existingConfig, ...newConfig };

    await saveUserConfigToMongoDB(number, mergedConfig);
    fs.ensureDirSync(path.join(__dirname, 'setting'));
    fs.writeFileSync(localPath, JSON.stringify(mergedConfig, null, 2));

    console.log(`✅ Config updated for ${number}`);
    res.json({ success: true, message: 'Settings updated successfully', config: mergedConfig });
  } catch (err) {
    console.error('POST /settings error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Cleanup handlers
process.on('exit', async () => {
    console.log('🛑 Shutting down auto-management...');

    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (autoCleanupInterval) clearInterval(autoCleanupInterval);
    if (autoReconnectInterval) clearInterval(autoReconnectInterval);
    if (autoRestoreInterval) clearInterval(autoRestoreInterval);
    if (mongoSyncInterval) clearInterval(mongoSyncInterval);

    await syncPendingSavesToMongoDB().catch(console.error);

    activeSockets.forEach((socket, number) => {
        try {
            socket.ws.close();
        } catch (error) {
            console.error(`Failed to close socket for ${number}:`, error);
        }
    });

    await mongoose.connection.close();

    console.log('✅ Shutdown complete');
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await autoSaveAllActiveSessions();
    await syncPendingSavesToMongoDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await autoSaveAllActiveSessions();
    await syncPendingSavesToMongoDB();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
    syncPendingSavesToMongoDB().catch(console.error);
    setTimeout(() => {
        exec(`pm2 restart ${process.env.PM2_NAME || 'jamali-tech-md'}`);
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected');
    mongoConnected = true;
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    mongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
    mongoConnected = false;
    setTimeout(() => {
        initializeMongoDB();
    }, 5000);
});

initializeAutoManagement();

console.log('✅ JAMALI TECH MD V1 started successfully with MongoDB');
console.log(`📊 Configuration loaded:
  - Bot Name: JAMALI TECH MD V1
  - Owner: JAMALI TECH EMPIRE (255798172655)
  - Storage: MongoDB Atlas
  - Auto-save: Every ${config.AUTO_SAVE_INTERVAL / 60000} minutes
  - MongoDB sync: Every ${config.MONGODB_SYNC_INTERVAL / 60000} minutes
  - Auto-restore: Every ${config.AUTO_RESTORE_INTERVAL / 3600000} hour(s)
  - Auto-cleanup: Every ${config.AUTO_CLEANUP_INTERVAL / 60000} minutes
`);

module.exports = router;
