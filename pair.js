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
process.env.PM2_NAME = 'jamali-tech-session';

console.log('🚀 Auto Session Manager initialized with MongoDB Atlas');

// Configs
const footer = `> \`♱♱♱♱♱ 𝐏𝐨𝐰𝐞𝐝 𝐛𝐲 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄 ♱♱♱♱\``
const logo = `https://files.catbox.moe/x632jk.jpg`;
const caption = `𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀`; 
const botName = '𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀'
const mainSite = 'jamali-tech-empire.free.nf';
const apibase = 'https://dew-api.vercel.app'
const apikey = `free`;

const config = {
    // General Bot Settings
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💗', '🔥'],
    BUTTON: 'true',

    // Newsletter Auto-React Settings
    AUTO_REACT_NEWSLETTERS: 'true',

    NEWSLETTER_JIDS: ['120363402325089913@newsletter'],
    NEWSLETTER_REACT_EMOJIS: ['❤️', '😗', '🩷'],

    // OPTIMIZED Auto Session Management
    AUTO_SAVE_INTERVAL: 360000,        // Auto-save every 5 minutes
    AUTO_CLEANUP_INTERVAL: 1800000,    // Cleanup every 30 minutes
    AUTO_RECONNECT_INTERVAL: 300000,   // Check reconnection every 5 minutes
    AUTO_RESTORE_INTERVAL: 360000,    // Auto-restore every 1 hour
    MONGODB_SYNC_INTERVAL: 600000,     // Sync with MongoDB every 10 minutes
    MAX_SESSION_AGE: 2592000000,       // 30 days in milliseconds
    DISCONNECTED_CLEANUP_TIME: 180000, // 5 minutes for disconnected sessions
    MAX_FAILED_ATTEMPTS: 2,            // Max failed reconnection attempts
    INITIAL_RESTORE_DELAY: 10000,      // Wait 10 seconds before initial restore
    IMMEDIATE_DELETE_DELAY: 600000,    // Wait 5 minutes before deleting invalid sessions

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

    // Owner Details
    OWNER_NUMBER: '255798171655',
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

        // Create indexes
        await Session.createIndexes();
        await UserConfig.createIndexes();

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        mongoConnected = false;
        
        // Retry connection after 5 seconds
        setTimeout(() => {
            initializeMongoDB();
        }, 5000);
        
        return false;
    }
}

// MongoDB Session Management Functions
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

        // Delete session
        await Session.deleteOne({ number: sanitizedNumber });
        
        // Delete user config
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
        // Delete sessions that are disconnected or invalid
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

// User Config MongoDB Functions
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

// Create necessary directories
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


// **HELPER FUNCTIONS**

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

// Check if command is from owner
function isOwner(sender) {
    const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const ownerNumber = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    return senderNumber === ownerNumber;
}

// **SESSION MANAGEMENT**

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

        // Try MongoDB
        const sessionData = await loadSessionFromMongoDB(sanitizedNumber);
        
        if (sessionData) {
            // Save to local for running bot
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

    // Delete local files
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`🗑️ Deleted session directory: ${sanitizedNumber}`);
    }

    // Delete from MongoDB
    await deleteSessionFromMongoDB(sanitizedNumber);

    // Clear all references
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

// **AUTO MANAGEMENT FUNCTIONS**

function initializeAutoManagement() {
    console.log('🔄 Starting optimized auto management with MongoDB...');

    // Initialize MongoDB
    initializeMongoDB().then(() => {
        // Start initial restore after MongoDB is connected
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

            // Load from MongoDB
            const dbConfig = await loadUserConfigFromMongoDB(number);
            if (!dbConfig) continue;

            // If DB updated → overwrite local
            if (new Date(dbConfig.updatedAt || 0) > fs.statSync(localPath).mtime) {
                fs.writeFileSync(localPath, JSON.stringify(dbConfig, null, 2));
                console.log(`🔁 Synced updated MongoDB config → local for ${number}`);
            }

            // If local changed → push to DB (optional)
            // await saveUserConfigToMongoDB(number, localConfig);
        }
    } catch (e) {
        console.error('⚠️ Auto-sync user configs failed:', e.message);
    }
}, 10 * 60 * 1000); // Every 10 minutes


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

            // Save to MongoDB
            await saveSessionToMongoDB(sanitizedNumber, credData);
            
            // Update status
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

        // Check local active sockets
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

        // Clean MongoDB inactive sessions
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

        // Get all active sessions from MongoDB
        const mongoSessions = await getAllActiveSessionsFromMongoDB();

        for (const session of mongoSessions) {
            const number = session.number;

            if (activeSockets.has(number) || restoringNumbers.has(number)) {
                continue;
            }

            try {
                console.log(`🔄 Restoring session from MongoDB: ${number}`);
                restoringNumbers.add(number);

                // Save to local for running bot
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
                
                // Update status in MongoDB
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

// **USER CONFIG MANAGEMENT**

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const localPath = `./setting/${sanitizedNumber}.json`;

        // 1️⃣ Try to load from local JSON
        if (fs.existsSync(localPath)) {
            const localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            console.log(`💾 Loaded local config for ${sanitizedNumber}`);
            applyConfigSettings(localConfig);
            return localConfig;
        }

        // 2️⃣ Fallback: Load from MongoDB
        const loadedConfig = await loadUserConfigFromMongoDB(sanitizedNumber);

        if (loadedConfig) {
            fs.writeFileSync(localPath, JSON.stringify(loadedConfig, null, 2));
            console.log(`✅ Saved MongoDB config locally for ${sanitizedNumber}`);
            applyConfigSettings(loadedConfig);
            return loadedConfig;
        }

        // 3️⃣ If nothing found → use default config
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

        // Save to MongoDB
        await saveUserConfigToMongoDB(sanitizedNumber, newConfig);
        
        console.log(`✅ Config updated in MongoDB: ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config:', error);
        throw error;
    }
}

// **HELPER FUNCTIONS**

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

function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();

    const caption = formatMessage(
        '*𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀 Whatsapp Bot Connected*',
        `Connect - ${mainSite}\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}`,
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
    return; // Do nothing
}

async function updateAboutStatus(socket) {
    const aboutStatus = ' һ𝖊𝑦 𝘣𝖊𝘣𝑦 ⅈ ｍ һ𝖊ɑ𝔯...♥︎';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`✅ Auto-updated About status`);
    } catch (error) {
        console.error('❌ Failed to update About status:', error);
    }
}

// **MEDIA FUNCTIONS**

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
            displayName: "𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀",
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀\nORG:JAMALI TECH Coders;\nTEL;type=CELL;type=VOICE;waid=255798171655:255798171655\nEND:VCARD`,
            contextInfo: {
                stanzaId: createSerial(16).toUpperCase(),
                participant: "0@s.whatsapp.net",
                quotedMessage: {
                    conversation: "JAMALI TECH AI"
                }
            }
        }
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1,
    verifiedBizName: "Meta"
};

async function SendSlide(socket, jid, newsItems) {
    let anu = [];
    for (let item of newsItems) {
        let imgBuffer;
        try {
            imgBuffer = await resize(item.thumbnail, 300, 200);
        } catch (error) {
            console.error(`❌ Failed to resize image for ${item.title}:`, error);
            imgBuffer = await Jimp.read('https://files.catbox.moe/x632jk.jpg');
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
                        buttonParamsJson: `{"display_text":"𝐃𝙴𝙿𝙻𝙾𝚈","url":"https:/","merchant_url":"https://www.google.com"}`
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: `{"display_text":"𝐂𝙾𝙽𝚃𝙰𝐂𝚃","url":"https","merchant_url":"https://www.google.com"}`
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
                        text: "*AUTO NEWS UPDATES*"
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

// **EVENT HANDLERS**

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
            // ==== Detect reply to status from anyone ====
            if (message.message?.extendedTextMessage?.contextInfo) {
                const replyText = message.message.extendedTextMessage.text?.trim().toLowerCase();
                const quotedInfo = message.message.extendedTextMessage.contextInfo;

                // Check if reply matches translations & is to a status
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

                    // Extract caption
                    let statusCaption = "";
                    if (quotedMsg[mediaType]?.caption) {
                        statusCaption = quotedMsg[mediaType].caption;
                    } else if (quotedMsg?.conversation) {
                        statusCaption = quotedMsg.conversation;
                    }

                    // Download media
                    const stream = await downloadContentFromMessage(
                        quotedMsg[mediaType],
                        mediaType.replace("Message", "")
                    );
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    const savetex = '*𝙅𝘼𝙈𝘼𝙇𝙄-𝙏𝙀𝘾𝙃-STATUS-SAVER*'
                    // Send via bot
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



// **COMMAND HANDLERS**

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
                newsletterName: '⏤ ͟͞ ❮❮⛩️̶͟͞🔥⃝𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀 𝛣𝛩亇🕊️̶͟͞🌙ヤ',
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

 
   //====================META FAKE FORWERD=============
 
    
    //========================================
    
case 'alive': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = '𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀❤️‍🩹';
    const logoAlive = 'https://files.catbox.moe/0pn06m.jpg';

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "JAMALI_TECH_ALIVE_🪄" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=255798171655:+255 798 171 655\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `
♠️ \`𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀 ᗩᒪIᐯE ᑎOᗯ..!\`
♠️ \`Owner: JAMALI TECH\`
♠️ \`ᑌptime: ${hours}h ${minutes}m ${seconds}s\`
♠️ \`ᑭlatform: ${process.env.PLATFORM || 'Heroku'}\`
♠️ \`ᑭrefix: ${config.PREFIX}\`
♠️ \`Channel: Follow the 𝗝𝗔𝗠𝗔𝗟𝗜 𝗧𝗘𝗖𝗛 𝗘𝗠𝗣𝗜𝗥𝗘 channel on WhatsApp: https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h\`
`;

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 ᗰEᑎᑌ" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ ᑭIᑎG" }, type: 1 }
    ];

    let imagePayload = String(logoAlive).startsWith('http') ? { url: logoAlive } : fs.readFileSync(logoAlive);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🔥 ᗷᗩᗷY Iᗰ ᗩLIVE 🔥`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

// ---------------------- PING -----------------






case 'menu': {
  try { await socket.sendMessage(sender, { react: { text: "📋", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // load per-session config (logo, botName)
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = userCfg.botName || '𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾𝙃 𝙀𝙈𝙋𝙄𝙍𝙀 🥂';

    // 🔹 Fake contact for Meta AI mention
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_MENU"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=255798171655:+255 798 171 655
END:VCARD`
            }
        }
    };

    const text = `
╭───❏ *BOT STATUS* ❏
│ ♠️ *𝗕ot Name*: ${title}
│ ♠️ *𝗢wner*: ${config.OWNER_NAME || 'JAMALI TECH'}
│ ♠️ *𝗩ersion*: ${config.BOT_VERSION || '0.0.1'}
│ ♠️ *𝗣latform*: ${process.env.PLATFORM || 'Heroku'}
│ ♠️ *𝗨ptime*: ${hours}h ${minutes}m ${seconds}s
╰───────────────❏

➤ 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝛯 𝐂𝐎𝛭𝐌Ҩ𝚴𝐃𝐒
┏━━━━━━ ❍ ━━━━━━┓
🛠️ *SY𝑆TE𝛭 CO𝛭MA𝚴DS*
• 🟢 \`.alive\` — Show bot status
• 🔌 \`.system\` — Bot System
• 🧪 \`.ping\` — Check speed
• 🆔 \`.jid\` — Get your JID

🖼️ *MEDIA TOOLS*
• 👁‍🗨 \`.vv\` — View once unlock
• ⭐ \`.getdp\` — Downlode Dp
• 👀 \`.cinfo\` — Get Channel Info
• 💾 \`.save / send\` — Status saver
• 🍭 \`.yts\` — Youtube search
• 📋 \`.tiktoksearch\` — tiktoksearch

📥 *DOWNLOADERS*
• 🎧 \`.song\` — Download song
• 📂 \`.csend\` — Channel Song Send
• 🎥 \`.tiktok\` — TikTok video
• 📸 \`.facebook\`  — Video Facebook
• 🎬 \`.video\` — Video
> © ${config.BOT_FOOTER || '> ♱♱♱♱♱ 𝐏𝐨𝐰𝐞𝐝 𝐛𝐲 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄 ♱♱♱♱'}
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 ᗪOᗯᑎᒪOᗪ ᗰEᑎᑌ" }, type: 1 },
      { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: "🎨 TOOᒪ ᗰEᑎᑌ" }, type: 1 },
      { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "🪄 SETTIᑎG" }, type: 1 }
    ];
	
    const defaultImg = 'https://files.catbox.moe/x632jk.jpg';
    const useLogo = userCfg.logo || defaultImg;


   // build image payload (url or buffer)
    let imagePayload;
    if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };
    else {
      try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }
    }

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: "> ♱♱♱♱♱ 𝐏𝐨𝐰𝐞𝐝 𝐛𝐲 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄 ♱♱♱♱",
      buttons,
      headerType: 4
    }, { quoted: shonux });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== DOWNLOAD MENU ====================
case 'download': {
  try { await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀𝘾Ｈ 𝙀ＭＰ𝙄𝙍𝙀';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_DOWNLOAD"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=255798171655:+255 798 171 655
END:VCARD`
            }
        }
    };

    const text = `
╭───❍ *DOWNLOAD MENU* ❍
│ 
│ 🎵 *Music Downloaders*
│ ${config.PREFIX}song [query]
│ ${config.PREFIX}csong [jid] [query]
│ ${config.PREFIX}ringtone [name]
│ 
│ 🎬 *Video Downloaders*
│ ${config.PREFIX}tiktok [url]
│ ${config.PREFIX}video [query]
│ ${config.PREFIX}xvideo [query]
│ ${config.PREFIX}xnxx [query]
│ ${config.PREFIX}fb [url]
│ ${config.PREFIX}ig [url]
│ 
│ 📱 *App & Files*
│ ${config.PREFIX}apk [app id]
│ ${config.PREFIX}apksearch [app name]
│ ${config.PREFIX}mediafire [url]
│ ${config.PREFIX}gdrive [url]
│ 
╰───────────────❏
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🪄PING" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      text,
      footer: "📥 DOWNLOAD COMMANDS",
      buttons
    }, { quoted: shonux });

  } catch (err) {
    console.error('download command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show download menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== CREATIVE MENU ====================
case 'tools': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝙅𝘼𝙈𝘼𝙇𝙄 𝙏𝙀ＣＨ 𝙀ＭＰ𝙄𝙍𝙀';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CREATIVE"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=255798171655:+255 798 171 655
END:VCARD`
            }
        }
    };

    const text = `
╭───❏ *CREATIVE MENU* ❏
│ 
│ 🤖 *AI Features*
│ ${config.PREFIX}ai [message]
│ ${config.PREFIX}aiimg [prompt]
│ ${config.PREFIX}aiimg2 [prompt]
│ 
│ ✍️ *Text Tools*
│ ${config.PREFIX}font [text]
│ 
│ 🖼️ *Image Tools*
│ ${config.PREFIX}getdp [number]
│ 
│ 💾 *Media Saver*
│ ${config.PREFIX}save (reply to status)
│ 
╰───────────────❏
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 DOWNLOAD" }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      text,
      footer: "TOOL COMMANDS",
      buttons
    }, { quoted: shonux });

  } catch (err) {
    console.error('creative command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show creative menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

    
   //==================     
    
   
         

// Logo Maker Command - Button Selection
case 'logo': {
    const userConfig = await loadUserConfig(number);                
    const useButton = userConfig.BUTTON === 'true'; // default false
    const q = args.join(" ");
    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { text: '*`Need a name for logo`*' });
    }

    await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

    const list = require('./data/logo.json'); // JSON with all 50 logo styles

    const rows = list.map(v => ({
        title: v.name,
        description: 'Tap to generate logo',
        id: `${prefix}dllogo ${encodeURIComponent(v.url)} ${encodeURIComponent(q)}` // pass URL and text
    }));

    const buttonMessage = {
        buttons: [
            {
                buttonId: 'action',
                buttonText: { displayText: '🎨 Select Text Effect' },
                type: 4,
                nativeFlowInfo: {
                    name: 'single_select',
                    paramsJson: JSON.stringify({
                        title: 'Available Text Effects',
                        sections: [
                            {
                                title: 'Choose your logo style',
                                rows
                            }
                        ]
                    })
                }
            }
        ],
        headerType: 1,
        viewOnce: true,
        caption: `❏ *LOGO MAKER*\nReply a style to generate a logo for: *${q}*`,
        image: { url: logo },
    };
    if(useButton){
    await socket.sendMessage(from, buttonMessage, { quoted: msg });

} else {

    await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

    let messageText = `🔢 Reply with the number for the *${q}* logo:\n\n`;

    list.forEach((v, i) => {
        messageText += `${i + 1} │❯❯◦ ${v.name}\n`;
    });

    const fetchLogoUrl = async (url, name) => {
        try {
            const response = await axios.get(`https://api-pink-venom.vercel.app/api/logo`, {
                params: { url, name }
            });
            return response.data.result.download_url;
        } catch (error) {
            console.error("Error fetching logo:", error);
            return null;
        }
    };

    messageText += `\n*Reply with a number (1-${list.length})*`;

    const sentMessage = await socket.sendMessage(from, { 
        image: { url: logo },
        caption: messageText }, 
        { quoted: msg });

    // Listen for user's reply
    const handler = async ({ messages }) => {
        const message = messages[0];
        if (!message.message?.extendedTextMessage) return;

        const replyText = message.message.extendedTextMessage.text.trim();
        const context = message.message.extendedTextMessage.contextInfo;

        // Only respond if replying to our menu message
        if (context?.stanzaId !== sentMessage.key.id) return;

        const index = parseInt(replyText);
        if (isNaN(index) || index < 1 || index > list.length) {
            return await socket.sendMessage(from, { text: `❌ Invalid number! Please reply with 1-${list.length}` }, { quoted: message });
        }

        const logoSelection = list[index - 1];

        // Fetch logo using your helper
        const logoUrl = await fetchLogoUrl(logoSelection.url, q);
        if (!logoUrl) {
            return await socket.sendMessage(from, { text: `❌ Failed to generate logo.` }, { quoted: message });
        }

        await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: `✨ Here’s your *${q}* logo\n\n${footer}`
        }, { quoted: message });

        // Remove listener after first valid reply
        socket.ev.off('messages.upsert', handler);
    };

    socket.ev.on('messages.upsert', handler);
        
}
    break;
}

// DLL Logo - Download the logo after selection
case 'dllogo': {
    if (args.length < 2) return reply("❌ Usage: dllogo <URL> <text>");

    const [url, ...nameParts] = args;
    const text = decodeURIComponent(nameParts.join(" "));
    const fetchLogoUrl = async (url, name) => {
        try {
            const response = await axios.get(`https://api-pink-venom.vercel.app/api/logo`, {
                params: { url, name }
            });
            return response.data.result.download_url;
        } catch (error) {
            console.error("Error fetching logo:", error);
            return null;
        }
    };
    try {
        const logoUrl = await fetchLogoUrl(decodeURIComponent(url), text);
        if (!logoUrl) return reply("❌ Failed to generate logo.");

        await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: `✨ Here’s your logo for *${text}*\n${config.CAPTION}`
        }, { quoted: msg });

    } catch (e) {
        console.log('Logo Download Error:', e);
        await socket.sendMessage(from, { text: `❌ Error:\n${e.message}` }, { quoted: msg });
    }
    break;
}


case 'cinfo':
case 'channelinfo':
case 'cid': {
    try {
        // 🔹 Extract query text from message
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { text: "❎ Please provide a WhatsApp Channel link.\n\nUsage: .cid <link>" });

        // 🔹 Extract Channel invite ID from link (flexible regex)
        const match = q.match(/https?:\/\/(www\.)?whatsapp\.com\/channel\/([\w-]+)/i);
        if (!match) return await socket.sendMessage(sender, { text: "⚠️ Invalid channel link!" });

        const inviteId = match[2];

        // 🔹 Fetch Channel Metadata
        let metadata;
        try {
            metadata = await socket.newsletterMetadata("invite", inviteId);
        } catch (err) {
            console.error("❌ Failed to fetch metadata via invite:", err);
            return await socket.sendMessage(sender, { text: "⚠️ Could not fetch channel metadata. Maybe the link is private or invalid." });
        }

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, { text: "❌ Channel not found or inaccessible." });
        }

        // 🔹 Prepare preview image
        let previewUrl = metadata.preview
            ? metadata.preview.startsWith("http") 
                ? metadata.preview 
                : `https://pps.whatsapp.net${metadata.preview}`
            : "https://telegra.ph/file/4cc2712eaba1c5c1488d3.jpg"; // default image

        // 🔹 Format followers and creation date
        const followers = metadata.subscribers?.toLocaleString() || "Unknown";
        const createdDate = metadata.creation_time 
            ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID", { dateStyle: 'medium', timeStyle: 'short' })
            : "Unknown";

        // 🔹 Format message
        const infoMsg = `*乂 ${botName} Channel Info 乂*\n\n`
                      +`🆔 ID: ${metadata.id}\n`
                      +`📌 Name: ${metadata.name || "Unknown"}\n`
                      +`📝 Description: ${metadata.desc?.toString() || "No description"}\n`
                      +`👥 Followers: ${followers}\n`
                      +`📅 Created: ${createdDate}\n\n`
                      +`${footer}`;
        // 🔹 Send message with preview image
        await socket.sendMessage(sender, {
            image: { url: previewUrl },
            caption: infoMsg,
            ...(contextInfo ? { contextInfo } : {})
        }, { quoted: m });

    } catch (e) {
        console.error("❌ CID Command Error:", e);
        await socket.sendMessage(sender, { text: "⚠️ Error fetching channel details." });
    }
    break;
}

case 'follow':
case 'followchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .follow <channel_url>\n' +
                      '• .follow <channel_jid>\n\n' +
                      '*Example:*\n' +
                      '• .follow Follow the 𝗝𝗔𝗠𝗔𝗟𝗜 𝗧𝗘𝗖𝗛 𝗘𝗠𝗣𝗜𝗥𝗘 channel on WhatsApp: https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h\n' +
                      '• .follow 120363402325089913@newsletter'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
        if (input.includes('whatsapp.com/channel/')) {
            // Extract channel code from URL
            const channelCodeMatch = input.match(/channel\/([a-zA-Z0-9]+)/);
            if (!channelCodeMatch) {
                return await socket.sendMessage(sender, {
                    text: '*❌ Invalid channel URL format*'
                }, { quoted: myquoted });
            }
            // Convert to potential JID
            channelJid = `${channelCodeMatch[1]}@newsletter`;
        } else if (input.includes('@newsletter')) {
            channelJid = input;
        } else {
            // Assume it's a channel code and add newsletter suffix
            channelJid = `${input}@newsletter`;
        }

        await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

        // Try to follow the channel
        try {
            await socket.newsletterFollow(channelJid);
            
            // Add to config if owner
            if (isOwner(sender)) {
                if (!config.NEWSLETTER_JIDS.includes(channelJid)) {
                    config.NEWSLETTER_JIDS.push(channelJid);
                    
                    const userConfigEntry = await loadUserConfig(number);
                    userConfigEntry.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                    await updateUserConfig(number, userConfigEntry);
                }
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            
            await socket.sendMessage(sender, {
                image: { url: logo },
                caption: formatMessage(
                    '✅ CHANNEL FOLLOWED',
                    `Successfully followed channel!\n\n` +
                    `*Channel JID:* ${channelJid}\n` +
                    `*Auto-React:* ${config.AUTO_REACT_NEWSLETTERS === 'true' ? '✅ Enabled' : '❌ Disabled'}\n` +
                    (isOwner(sender) ? `*Added to auto-react list:* ✅` : ''),
                    '> ♱♱♱♱♱ 𝐏𝐨𝐰𝐞𝐝 𝐛𝐲 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝗥𝐄 ♱♱♱♱'
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

case 'unfollow':
case 'unfollowchannel': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a channel URL or JID*\n\n' +
                      '*Usage:*\n' +
                      '• .unfollow <channel_url>\n' +
                      '• .unfollow <channel_jid>'
            }, { quoted: myquoted });
        }

        const input = args.join(' ').trim();
        let channelJid = '';

        // Check if input is a URL or JID
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

        await socket.sendMessage(sender, { react: { text: '➖', key: msg.key } });

        try {
            await socket.newsletterUnfollow(channelJid);
            
            if (isOwner(sender)) {
                config.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS.filter(jid => jid !== channelJid);
                const userConfigEntry = await loadUserConfig(number);
                userConfigEntry.NEWSLETTER_JIDS = config.NEWSLETTER_JIDS;
                await updateUserConfig(number, userConfigEntry);
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            await socket.sendMessage(sender, {
                text: `*✅ Successfully unfollowed channel:* ${channelJid}`
            }, { quoted: myquoted });

        } catch (error) {
            console.error('Unfollow error:', error);
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(sender, {
                text: `*❌ Failed to unfollow channel:* ${error.message}`
            }, { quoted: myquoted });
        }
    } catch (error) {
        console.error('❌ Unfollow command error:', error);
    }
    break;
}
            }
        } catch (e) {
            console.error('Command Execution Error:', e);
        }
    });
}
