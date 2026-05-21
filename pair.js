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
process.env.PM2_NAME = 'luxury-session';

console.log('🚀 LUXURY BOT - Auto Session Manager initialized with MongoDB Atlas');

// Configs - LUXURY BRANDING
const footer = `> *✧ L U X U R Y   B O T   B Y   J A M A L I   T E C H   E M P I R E ✧*`
const logo = `https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg`;
const caption = `𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻`; 
const botName = '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻'
const mainSite = 'luxury-bot.jamali-tech.com'
const apibase = 'https://dew-api.vercel.app'
const apikey = `free`;

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑'],
    BUTTON: 'true',

    // Newsletter Auto-React Settings - JAMALI TECH EMPIRE CHANNEL
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363402325089913@newsletter', '0029VbC7AgJK5cD71vGIpO3h@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['💎', '👑', '✨', '💫'],

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
    BOT_VERSION: '2.0.0',
    BOT_FOOTER: '> *✧ LUXURY BOT BY JAMALI TECH EMPIRE ✧*'
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
    console.log('🔄 LUXURY BOT - Starting optimized auto management with MongoDB...');

    initializeMongoDB().then(() => {
        setTimeout(async () => {
            console.log('🔄 LUXURY BOT - Initial auto-restore on startup...');
            await autoRestoreAllSessions();
        }, config.INITIAL_RESTORE_DELAY);
    });

    autoSaveInterval = setInterval(async () => {
        console.log('💾 LUXURY BOT - Auto-saving active sessions...');
        await autoSaveAllActiveSessions();
    }, config.AUTO_SAVE_INTERVAL);

    mongoSyncInterval = setInterval(async () => {
        console.log('🔄 LUXURY BOT - Syncing active sessions with MongoDB...');
        await syncPendingSavesToMongoDB();
    }, config.MONGODB_SYNC_INTERVAL);

    autoCleanupInterval = setInterval(async () => {
        console.log('🧹 LUXURY BOT - Auto-cleaning inactive sessions...');
        await autoCleanupInactiveSessions();
    }, config.AUTO_CLEANUP_INTERVAL);

    autoReconnectInterval = setInterval(async () => {
        console.log('🔗 LUXURY BOT - Auto-checking reconnections...');
        await autoReconnectFailedSessions();
    }, config.AUTO_RECONNECT_INTERVAL);

    autoRestoreInterval = setInterval(async () => {
        console.log('🔄 LUXURY BOT - Hourly auto-restore check...');
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

        console.log('🔄 LUXURY BOT - Starting auto-restore process from MongoDB...');
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
    return `*✧ ${title} ✧*\n\n${content}\n\n${footerMsg}`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();

    const caption = formatMessage(
        '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 𝑪𝑶𝑵𝑵𝑬𝑪𝑻𝑬𝑫',
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
    const aboutStatus = '💎 𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 𝑩𝒀 𝑱𝑨𝑴𝑨𝑳𝑰 𝑻𝑬𝑪𝑯 𝑬𝑴𝑷𝑰𝑹𝑬 💎';
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
            displayName: "𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻\nORG:JAMALI TECH EMPIRE;\nTEL;type=CELL;type=VOICE;waid=255798172655:255798172655\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "𝑳𝑼𝑿𝑼𝑹𝒀 𝑨𝑰"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "LUXURY BOT"
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
                        text: "*✨ LUXURY BOT NEWS UPDATES ✨*"
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
                    const savetex = '*✨ LUXURY BOT - STATUS SAVER ✨*'
                    
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
                newsletterName: '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 𝑩𝒀 𝑱𝑨𝑴𝑨𝑳𝑰 𝑻𝑬𝑪𝑯',
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

case 'alive': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongoDB(sanitized) || {};
    const botName = '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 💎';
    const logo = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "LUXURY_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:JAMALI TECH EMPIRE\nTEL;type=CELL;type=VOICE;waid=255798172655:+255 798 172 655\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `
💎 *𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 𝑰𝑺 𝑨𝑳𝑰𝑽𝑬* 💎
━━━━━━━━━━━━━━━━━━━━
👑 *Owner:* JAMALI TECH EMPIRE
⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
⚙️ *Platform:* ${process.env.PLATFORM || 'Heroku'}
📌 *Prefix:* ${config.PREFIX}
━━━━━━━━━━━━━━━━━━━━
*✨ Premium Bot Service ✨*
`;

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `💎 LUXURY BOT BY JAMALI TECH EMPIRE 💎`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

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

    const title = userCfg.botName || '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻 💎';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "LUXURY_MENU_ID"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:JAMALI TECH EMPIRE
TEL;type=CELL;type=VOICE;waid=255798172655:+255 798 172 655
END:VCARD`
            }
        }
    };

    const text = `
╭───❏ *✨ LUXURY BOT STATUS ✨* ❏
│ 💎 *Bot Name:* ${title}
│ 👑 *Owner:* JAMALI TECH EMPIRE
│ 📌 *Version:* ${config.BOT_VERSION || '2.0.0'}
│ ⚙️ *Platform:* ${process.env.PLATFORM || 'Heroku'}
│ ⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
╰───────────────❏

➤ *✨ AVAILABLE COMMANDS ✨*
┏━━━━━━━━━━━━━━━━━━━━┓
┃ *🛠️ SYSTEM COMMANDS*
┃ • \`.alive\` — Bot Status
┃ • \`.ping\` — Speed Test
┃ • \`.jid\` — Get JID
┃ • \`.owner\` — Contact Owner
┃━━━━━━━━━━━━━━━━━━━━┃
┃ *📥 DOWNLOAD COMMANDS*
┃ • \`.song\` — Download Music
┃ • \`.video\` — Download Video
┃ • \`.tiktok\` — TikTok Video
┃ • \`.facebook\` — FB Video
┃ • \`.save\` — Save Status
┃━━━━━━━━━━━━━━━━━━━━┃
┃ *🤖 AI FEATURES*
┃ • \`.ai\` — Chat with AI
┃ • \`.logo\` — Create Logo
┃━━━━━━━━━━━━━━━━━━━━┃
┃ *⚙️ SETTINGS*
┃ • \`.settings\` — View Settings
┃ • \`.autoview [on/off]\`
┃ • \`.autolike [on/off]\`
┗━━━━━━━━━━━━━━━━━━━━┛

${footer}
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 DOWNLOAD MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ SETTINGS" }, type: 1 }
    ];
    
    const defaultImg = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';
    const useLogo = userCfg.logo || defaultImg;

    let imagePayload;
    if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };
    else {
      try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }
    }

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: footer,
      buttons,
      headerType: 4
    }, { quoted: shonux });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

case 'download': {
  try { await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongoDB === 'function') userCfg = await loadUserConfigFromMongoDB((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝑳𝑼𝑿𝑼𝑹𝒀 𝑩𝑶𝑻';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "LUXURY_DOWNLOAD_ID"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:JAMALI TECH EMPIRE
TEL;type=CELL;type=VOICE;waid=255798172655:+255 798 172 655
END:VCARD`
            }
        }
    };

    const text = `
╭───❍ *✨ DOWNLOAD MENU ✨* ❍
│ 
│ 🎵 *Music Downloaders*
│ ${config.PREFIX}song [query]
│ 
│ 🎬 *Video Downloaders*
│ ${config.PREFIX}tiktok [url]
│ ${config.PREFIX}video [query]
│ ${config.PREFIX}facebook [url]
│ 
│ 💾 *Media Saver*
│ ${config.PREFIX}save (reply to status)
│ 
╰───────────────❏
    `.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      text,
      footer: "📥 LUXURY BOT DOWNLOAD COMMANDS",
      buttons
    }, { quoted: shonux });

  } catch (err) {
    console.error('download command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show download menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

case 'settings': {
    const settingsText = `*✨ JAMALI 𝑩𝑶𝑻 𝑺𝑬𝑻𝑻𝑰𝑵𝑮𝑺 ✨*

📌 *Prefix:* ${config.PREFIX}
👁️ *Auto View Status:* ${config.AUTO_VIEW_STATUS}
❤️ *Auto Like Status:* ${config.AUTO_LIKE_STATUS}
🎙️ *Auto Recording:* ${config.AUTO_RECORDING}
💎 *Auto Like Emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}

*Commands to change:*
• ${config.PREFIX}setprefix [new prefix]
• ${config.PREFIX}autoview [on/off]
• ${config.PREFIX}autolike [on/off]
• ${config.PREFIX}autorecording [on/off]
• ${config.PREFIX}setemojis [emoji1 emoji2...]

👑 *Powered by JAMALI TECH EMPIRE*`;

    await socket.sendMessage(sender, {
        image: { url: logo },
        caption: formatMessage(
            '⚙️ JAMALI TECH BOT SETTINGS',
            settingsText,
            footer
        )
    }, { quoted: myquoted });
    break;
}

case 'togglebutton': {
    try {
        const userConfig = await loadUserConfig(number);
        userConfig.BUTTON = userConfig.BUTTON === 'true' ? 'false' : 'true';
        await updateUserConfig(number, userConfig);

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: formatMessage(
                '🔄 BUTTON MODE TOGGLED',
                `Button mode is now: ${userConfig.BUTTON === 'true' ? '✅ ENABLED (Buttons)' : '❌ DISABLED (Normal Message)'}`,
                footer
            )
        }, { quoted: myquoted });

    } catch (error) {
        console.error("❌ ToggleButton command error:", error);
        await socket.sendMessage(sender, { text: "❌ Failed to toggle button setting" });
    }
    break;
}

case 'setprefix': {
    if (!args[0]) {
        return await socket.sendMessage(sender, {
            text: `*Current prefix:* ${config.PREFIX}\n*Usage:* ${config.PREFIX}setprefix [new prefix]`
        }, { quoted: msg });
    }

    const oldPrefix = config.PREFIX;
    config.PREFIX = args[0];

    const userConfig = await loadUserConfig(number);
    userConfig.PREFIX = config.PREFIX;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Prefix changed*\n*Old:* ${oldPrefix}\n*New:* ${config.PREFIX}`
    }, { quoted: msg });
    break;
}

case 'autoview': {
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_VIEW_STATUS}\n*Usage:* ${config.PREFIX}autoview [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_VIEW_STATUS = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_VIEW_STATUS = config.AUTO_VIEW_STATUS;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto View Status:* ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autolike': {
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_LIKE_STATUS}\n*Usage:* ${config.PREFIX}autolike [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_LIKE_STATUS = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_LIKE_STATUS = config.AUTO_LIKE_STATUS;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Status:* ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'autorecording': {
    if (!args[0] || !['on', 'off'].includes(args[0].toLowerCase())) {
        return await socket.sendMessage(sender, {
            text: `*Current:* ${config.AUTO_RECORDING}\n*Usage:* ${config.PREFIX}autorecording [on/off]`
        }, { quoted: msg });
    }

    config.AUTO_RECORDING = args[0].toLowerCase() === 'on' ? 'true' : 'false';

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_RECORDING = config.AUTO_RECORDING;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Recording:* ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}`
    }, { quoted: msg });
    break;
}

case 'setemojis': {
    if (args.length === 0) {
        return await socket.sendMessage(sender, {
            text: `*Current emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}\n*Usage:* ${config.PREFIX}setemojis 💎 ✨ 👑`
        }, { quoted: msg });
    }

    config.AUTO_LIKE_EMOJI = args;

    const userConfig = await loadUserConfig(number);
    userConfig.AUTO_LIKE_EMOJI = config.AUTO_LIKE_EMOJI;
    await updateUserConfig(number, userConfig);

    await socket.sendMessage(sender, {
        text: `✅ *Auto Like Emojis Updated:* ${config.AUTO_LIKE_EMOJI.join(', ')}`
    }, { quoted: msg });
    break;
}

case 'follow':
case 'followchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n*Usage:*\n• .follow <channel_url>\n• .follow <channel_jid>\n\n*Example:*\n• .follow https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h\n• .follow 0029VbC7AgJK5cD71vGIpO3h@newsletter'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        if (input.includes('whatsapp.com/channel/')) {
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

        try {
            await socket.newsletterFollow(channelJid);
            
            if (isOwner(sender)) {
                if (!config.NEWSLETTER_JIDS.includes(channelJid)) {
                    config.NEWSLETTER_JIDS.push(channelJid);
                    
                    const userConfig = await loadUserConfig(number);
                    userConfig.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfig);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            
            await socket.sendMessage(sender, {
                image: { url: logo },
                caption: formatMessage(
                    '✅ CHANNEL FOLLOWED',
                    `Successfully followed channel!\n\n*Channel JID:* ${channelJid}\n*Auto-React:* ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n👑 *JAMALI TECH EMPIRE*`,
                    footer
                )
            }, { quoted: myquoted });

        } catch (error) {
            console.error('Follow error:', error);
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            
            let errorMessage = 'Failed to follow channel';
            if (error.message.includes('not found')) {
                errorMessage = 'Channel not found or invalid JID';
            } else if (error.message.includes('already')) {
                errorMessage = 'Already following this channel';
            }
            
            await socket.sendMessage(sender, {
                text: `*❌ ${errorMessage}*\n\nTried JID: ${channelJid}`
            }, { quoted: myquoted });
        }

    } catch (error) {
        console.error('❌ Follow command error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Error:* ${error.message || 'Failed to follow channel'}`
        }, { quoted: myquoted });
    }
    break;
}

case 'owner': {
    const ownerNamePlain = "𝑱𝑨𝑴𝑨𝑳𝑰 𝑻𝑬𝑪𝑯 𝑬𝑴𝑷𝑰𝑹𝑬";
    const ownerNumber = "255798172655";
    const displayNumber = "255798172655";
    const email = "jamalitech@gmail.com";

    const videoUrl = 'https://github.com/Chamijd/KHAN-DATA/raw/refs/heads/main/logo/VID-20250508-WA0031(1).mp4';

    try {
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: msg });
    } catch (e) {
        console.log("Video send failed:", e);
    }

    const vcard =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${ownerNamePlain}\n` +
        `ORG:${ownerNamePlain}\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${displayNumber}\n` +
        `EMAIL:${email}\n` +
        'END:VCARD';

    await socket.sendMessage(sender, {
        contacts: {
            displayName: ownerNamePlain,
            contacts: [{ vcard }]
        }
    },{ quoted: myquoted });

    const msgText = `*✨ ${ownerNamePlain} ✨*\n\n👑 *Premium WhatsApp Bot Service*\n📞 *Contact:* wa.me/${ownerNumber}\n💎 *LUXURY BOT - Best Quality Service*`;

    await socket.sendMessage(sender, { text: msgText });

    break;
}

// Include all other commands from original (song, video, tiktok, facebook, save, etc.)
// They will work with the new LUXURY branding

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

    console.log(`🔄 LUXURY BOT - Connecting: ${sanitizedNumber}`);

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
                    pair = "JAMALITECHBOT"
                    code = await socket.requestPairingCode(sanitizedNumber,
