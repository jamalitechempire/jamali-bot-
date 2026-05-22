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

console.log('❤️ JAMALI TECH MD - Premium WhatsApp Bot initialized 💖');

// ==================== CONFIGURATIONS ====================
const botName = '💖 JAMALI TECH MD 💖';
const botLogo = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';
const botBanner = `╔══════════════════════════════════════════════════════╗
║           💖 JAMALI TECH MD 💖                        ║
║         🤖 PREMIUM WHATSAPP BOT 🤖                    ║
╚══════════════════════════════════════════════════════╝`;

const footer = `> *❤️💖😎 POWERED BY JAMALI TECH EMPIRE 😎💖❤️*`
const logo = botLogo;

const config = {
    // Bot Settings
    BOT_NAME: botName,
    BOT_LOGO: botLogo,
    BOT_BANNER: botBanner,
    
    // Auto Features
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['❤️', '💖', '😎', '🔥', '✨', '💫', '🌟', '⭐'],
    BUTTON: 'true',
    AUTO_REACT_NEWSLETTERS: 'true',
    
    // Newsletter Channels - Auto follow Jamali Tech Empire Channel
    NEWSLETTER_JIDS: [
        '255784062158@s.whatsapp.net',  // Owner number
        '0029VbC7AgJK5cD71vGIpO3h@newsletter'  // Jamali Tech Empire Channel
    ],
    NEWSLETTER_REACT_EMOJIS: ['❤️', '💖', '😎', '💫', '🔥', '🌟', '⭐', '💥'],
    
    // Auto Management
    AUTO_SAVE_INTERVAL: 360000,
    AUTO_CLEANUP_INTERVAL: 1800000,
    AUTO_RECONNECT_INTERVAL: 300000,
    AUTO_RESTORE_INTERVAL: 360000,
    MONGODB_SYNC_INTERVAL: 600000,
    MAX_SESSION_AGE: 2592000000,
    DISCONNECTED_CLEANUP_TIME: 180000,
    MAX_FAILED_ATTEMPTS: 3,
    INITIAL_RESTORE_DELAY: 10000,
    IMMEDIATE_DELETE_DELAY: 600000,
    
    // Command Settings
    PREFIX: '.',
    MAX_RETRIES: 3,
    
    // File Paths
    ADMIN_LIST_PATH: './data/admin.json',
    NUMBER_LIST_PATH: './numbers.json',
    SESSION_STATUS_PATH: './session_status.json',
    SESSION_BASE_PATH: './session',
    
    // Owner Details
    OWNER_NUMBER: '255784062158',  // Owner number updated
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    OWNER_EMAIL: 'jamalitech@gmail.com',
    BOT_VERSION: '2.0.0',
    
    // Links
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h',
    REPO_LINK: 'https://github.com/jamalitech/jamali-tech-md',
    WEBSITE_LINK: 'https://jamali-tech.onrender.com',
    
    BOT_FOOTER: footer
};

// Session Management
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

// ==================== WEBSITE HTML FOR PAIRING ====================
const getPairingHTML = () => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>💖 JAMALI TECH MD - Pair Your Device 😎</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 50%, #ffb347 100%);
            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            max-width: 500px;
            width: 100%;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 30px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
            animation: slideUp 0.5s ease;
        }
        
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 50%, #ffb347 100%);
            padding: 30px 20px;
            text-align: center;
        }
        
        .logo {
            width: 120px;
            height: 120px;
            border-radius: 60px;
            border: 4px solid white;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            margin-bottom: 15px;
            object-fit: cover;
        }
        
        .bot-name {
            font-size: 28px;
            font-weight: bold;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            letter-spacing: 1px;
        }
        
        .bot-version {
            color: rgba(255,255,255,0.9);
            font-size: 14px;
            margin-top: 5px;
        }
        
        .content {
            padding: 30px 25px;
        }
        
        .input-group {
            margin-bottom: 25px;
        }
        
        .input-group label {
            display: block;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .input-wrapper {
            display: flex;
            gap: 10px;
            align-items: center;
            background: #f3f4f6;
            border-radius: 15px;
            padding: 5px 15px;
            border: 2px solid transparent;
            transition: all 0.3s ease;
        }
        
        .input-wrapper:focus-within {
            border-color: #ff6b6b;
            background: white;
            box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.1);
        }
        
        .country-code {
            font-size: 18px;
            font-weight: bold;
            color: #ff6b6b;
        }
        
        .input-wrapper input {
            flex: 1;
            padding: 15px 0;
            border: none;
            background: transparent;
            font-size: 16px;
            outline: none;
        }
        
        .btn-pair {
            width: 100%;
            background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 50%, #ffb347 100%);
            color: white;
            border: none;
            padding: 16px;
            font-size: 18px;
            font-weight: bold;
            border-radius: 15px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 10px;
        }
        
        .btn-pair:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px -5px rgba(255, 107, 107, 0.4);
        }
        
        .btn-pair:active {
            transform: translateY(0);
        }
        
        .result {
            margin-top: 25px;
            padding: 15px;
            border-radius: 15px;
            display: none;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .result.success {
            background: #d1fae5;
            color: #065f46;
            border-left: 4px solid #10b981;
            display: block;
        }
        
        .result.error {
            background: #fee2e2;
            color: #991b1b;
            border-left: 4px solid #ef4444;
            display: block;
        }
        
        .code-display {
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            letter-spacing: 5px;
            background: white;
            padding: 15px;
            border-radius: 12px;
            margin-top: 10px;
            font-family: monospace;
        }
        
        .info-box {
            background: #f3f4f6;
            border-radius: 15px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .owner-info {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        
        .owner-info a {
            color: #ff6b6b;
            text-decoration: none;
            font-size: 14px;
            font-weight: bold;
        }
        
        .footer-text {
            text-align: center;
            padding: 20px;
            background: #f9fafb;
            font-size: 12px;
            color: #6b7280;
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid white;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 0.6s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        @media (max-width: 480px) {
            .container { margin: 10px; }
            .content { padding: 20px; }
            .logo { width: 90px; height: 90px; }
            .bot-name { font-size: 22px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${botLogo}" alt="JAMALI TECH MD" class="logo" onerror="this.src='https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg'">
            <div class="bot-name">💖 JAMALI TECH MD 💖</div>
            <div class="bot-version">Version ${config.BOT_VERSION} | Premium Bot 😎</div>
        </div>
        
        <div class="content">
            <div class="info-box">
                <p>❤️ <strong>Pair Your Device</strong> 💖<br>
                Enter your WhatsApp number to get pairing code 😎</p>
            </div>
            
            <div class="input-group">
                <label>📱 WhatsApp Number</label>
                <div class="input-wrapper">
                    <span class="country-code">+255</span>
                    <input type="tel" id="phoneNumber" placeholder="712345678" maxlength="15" autocomplete="off">
                </div>
                <small style="color: #666; font-size: 12px;">Example: 712345678 (without +255)</small>
            </div>
            
            <button class="btn-pair" onclick="generatePairingCode()">
                🔗 Generate Pairing Code
            </button>
            
            <div id="result" class="result"></div>
            
            <div class="owner-info">
                <a href="#" onclick="window.location.href='https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h'" target="_blank">📢 View Channel</a>
                <a href="https://wa.me/${config.OWNER_NUMBER}" target="_blank">👑 Contact Owner</a>
                <a href="${config.REPO_LINK}" target="_blank">📦 GitHub</a>
            </div>
        </div>
        
        <div class="footer-text">
            ${footer.replace(/\*/g, '')}
        </div>
    </div>
    
    <script>
        async function generatePairingCode() {
            let phone = document.getElementById('phoneNumber').value.trim();
            const resultDiv = document.getElementById('result');
            
            if (!phone) {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = '❌ Please enter your phone number!';
                return;
            }
            
            phone = phone.replace(/[^0-9]/g, '');
            if (phone.length < 9) {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = '❌ Please enter a valid phone number (minimum 9 digits)';
                return;
            }
            
            const fullNumber = '255' + phone;
            
            resultDiv.className = 'result';
            resultDiv.innerHTML = '<div class="loading"></div> Generating pairing code...';
            
            try {
                const response = await fetch('/pair?number=' + fullNumber);
                const data = await response.json();
                
                if (data.code) {
                    resultDiv.className = 'result success';
                    resultDiv.innerHTML = `
                        ✅ <strong>Pairing Code Generated!</strong>
                        <div class="code-display">${data.code}</div>
                        <p style="margin-top: 10px; font-size: 13px;">
                        📌 <strong>How to use:</strong><br>
                        1️⃣ Copy the code above<br>
                        2️⃣ Open WhatsApp on your phone<br>
                        3️⃣ Go to Settings > Linked Devices<br>
                        4️⃣ Tap "Link with Phone Number"<br>
                        5️⃣ Paste the code and connect!
                        </p>
                        <p style="margin-top: 10px; font-size: 12px; color: #065f46;">
                        ⏰ Code expires in 1 minute
                        </p>
                    `;
                } else if (data.status === 'already_connected') {
                    resultDiv.className = 'result error';
                    resultDiv.innerHTML = '⚠️ This number is already connected to the bot!';
                } else {
                    resultDiv.className = 'result error';
                    resultDiv.innerHTML = '❌ Failed to generate code. Please try again.';
                }
            } catch (error) {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = '❌ Network error. Please check your connection and try again.';
            }
        }
        
        document.getElementById('phoneNumber').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                generatePairingCode();
            }
        });
    </script>
</body>
</html>
    `;
};

// ==================== MONGO DB FUNCTIONS ====================
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

// ==================== HELPER FUNCTIONS ====================
function initializeDirectories() {
    [config.SESSION_BASE_PATH, './temp', './data', './setting'].forEach(dir => { 
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); 
    });
    if (!fs.existsSync('./data/admin.json')) fs.writeFileSync('./data/admin.json', JSON.stringify([config.OWNER_NUMBER], null, 2));
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

// ==================== AUTO MANAGEMENT ====================
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
    try { return fs.existsSync(config.ADMIN_LIST_PATH) ? JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8')) : [config.OWNER_NUMBER]; }
    catch { return [config.OWNER_NUMBER]; }
}

function formatMessage(title, content, footerMsg) { return `${title}\n\n${content}\n\n${footerMsg}`; }
function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function sendAdminConnectMessage(socket, number) {
    const admins = loadAdmins();
    for (const admin of admins) {
        try { 
            await socket.sendMessage(`${admin}@s.whatsapp.net`, { 
                image: { url: logo }, 
                caption: formatMessage('❤️ JAMALI TECH MD CONNECTED 💖', 
                    `😎 Premium Bot Service 😎\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: ${config.OWNER_NAME}`, 
                    footer) 
            });
        } catch (error) { console.error(`❌ Failed to send admin message:`, error); }
    }
}

async function updateAboutStatus(socket) {
    try { await socket.updateProfileStatus(`❤️ ${config.BOT_NAME} - Premium WhatsApp Bot 😎`); }
    catch (error) { console.error('❌ Failed to update About status:', error); }
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const myquoted = {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
    message: { contactMessage: { displayName: "💖 JAMALI TECH MD 💖", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${config.BOT_NAME}\nORG:${config.OWNER_NAME};\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:${config.OWNER_NUMBER}\nEND:VCARD`, contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: "0@s.whatsapp.net", quotedMessage: { conversation: "JAMALI AI" } } } },
    messageTimestamp: Math.floor(Date.now() / 1000), status: 1, verifiedBizName: "JAMALI TECH MD"
};

// ==================== EVENT HANDLERS ====================
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
                    console.log(`✅ Auto-reacted to newsletter: ${randomEmoji}`);
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
                    const savetex = `*❤️ ${config.BOT_NAME} - STATUS SAVER 💖*`;
                    if (mediaType === "imageMessage") await socket.sendMessage(senderJid, { image: buffer, caption: `${savetex}\n\n${quotedMsg[mediaType]?.caption || ""}` });
                    else if (mediaType === "videoMessage") await socket.sendMessage(senderJid, { video: buffer, caption: `${savetex}\n\n${quotedMsg[mediaType]?.caption || ""}` });
                }
            }
        } catch (error) { console.error('Status save handler error:', error); }
    });
}

// ==================== COMMAND HANDLERS ====================
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = await loadUserConfig(number);
        const msg = messages[0];
        const m = sms(socket, msg);
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
                case 'menu':
                case 'allmenu': {
                    const start = Date.now();
                    const uptime = process.uptime();
                    const usage = process.memoryUsage();
                    const totalMem = os.totalmem();
                    const freeMem = os.freemem();
                    const usedMem = totalMem - freeMem;
                    const memPercent = (usedMem / totalMem * 100).toFixed(1);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    const menuText = `╔══════════════════════════════════════════════════════╗
║           💖 JAMALI TECH MD 💖                       ║
║         🤖 PREMIUM WHATSAPP BOT 🤖                    ║
╚══════════════════════════════════════════════════════╝

╭─────────────────────────────────────────────────────╮
│  📊 *BOT STATISTICS*                                 │
├─────────────────────────────────────────────────────┤
│  👑 Owner       : ${config.OWNER_NAME}
│  🤖 Bot Name    : ${config.BOT_NAME}
│  📌 Prefix      : ${prefix}
│  🔢 Version     : ${config.BOT_VERSION}
│  ⏱️ Uptime      : ${hours}h ${minutes}m
│  ⚡ Speed       : ${Date.now() - start} ms
│  💾 RAM Usage   : ${(usedMem / 1024 / 1024).toFixed(0)} MB / ${(totalMem / 1024 / 1024).toFixed(0)} MB (${memPercent}%)
│  🌍 Mode        : Public
│  📦 Plugins     : 350+
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  🤖 *AI & CHATBOT*                                   │
├─────────────────────────────────────────────────────┤
│  • ${prefix}ai          - Chat with AI
│  • ${prefix}gemini      - Google Gemini
│  • ${prefix}blackbox    - Blackbox AI
│  • ${prefix}code        - Generate Code
│  • ${prefix}story       - Generate Story
│  • ${prefix}recipe      - Get Recipe
│  • ${prefix}translate   - Translate Text
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  📥 *DOWNLOADER*                                     │
├─────────────────────────────────────────────────────┤
│  • ${prefix}song        - Download Music
│  • ${prefix}video       - Download Video
│  • ${prefix}tiktok      - TikTok Downloader
│  • ${prefix}facebook    - FB Downloader
│  • ${prefix}instagram   - IG Downloader
│  • ${prefix}twitter     - Twitter Downloader
│  • ${prefix}ytsearch    - YouTube Search
│  • ${prefix}save        - Save Status
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  🎨 *MEDIA TOOLS*                                    │
├─────────────────────────────────────────────────────┤
│  • ${prefix}sticker     - Convert to Sticker
│  • ${prefix}toimage     - Convert to Image
│  • ${prefix}tomp3       - Convert to Audio
│  • ${prefix}vv          - ViewOnce Unlock
│  • ${prefix}getpp       - Get Profile Pic
│  • ${prefix}qrcode      - Generate QR Code
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  👑 *OWNER COMMANDS*                                 │
├─────────────────────────────────────────────────────┤
│  • ${prefix}block       - Block User
│  • ${prefix}unblock     - Unblock User
│  • ${prefix}join        - Join Group
│  • ${prefix}leave       - Leave Group
│  • ${prefix}setbio      - Update Bio
│  • ${prefix}restart     - Restart Bot
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  🔧 *SETTINGS*                                       │
├─────────────────────────────────────────────────────┤
│  • ${prefix}setprefix   - Change Prefix
│  • ${prefix}autoview    - Auto View Status
│  • ${prefix}autolike    - Auto Like Status
│  • ${prefix}mode        - Change Mode
│  • ${prefix}settings    - View Settings
╰─────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────╮
│  👁️ *VIEW CHANNEL*                                   │
├─────────────────────────────────────────────────────┤
│  📢 *Join Jamali Tech Empire Channel*
│  🔗 *Link*: ${config.CHANNEL_LINK}
│  
│  📌 *Follow for daily tech updates!*
│  💖 *Premium WhatsApp Bot Service* 😎
╰─────────────────────────────────────────────────────╯

${footer}`;
                    
                    await socket.sendMessage(sender, { image: { url: logo }, caption: menuText }, { quoted: myquoted });
                    break;
                }
                
                case 'viewchannel':
                case 'channel': {
                    await socket.sendMessage(sender, { 
                        text: `╔══════════════════════════════════════════════════════╗
║           👁️ JAMALI TECH CHANNEL 👁️                  ║
╚══════════════════════════════════════════════════════╝

╭─────────────────────────────────────────────────────╮
│  📢 *Join Our Official Channel*
│  
│  🔗 *Link*: ${config.CHANNEL_LINK}
│  
│  📌 *WhatsApp Channel for:*
│  • Latest Tech Updates 💻
│  • Bot News & Features 🤖
│  • Tips & Tricks 📱
│  • 24/7 Support 🛡️
│  
│  💖 *Follow now and stay updated!* 😎
│  
│  👑 *Owner*: ${config.OWNER_NAME}
│  📞 *Contact*: wa.me/${config.OWNER_NUMBER}
╰─────────────────────────────────────────────────────╯

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'alive': {
                    const start = Date.now();
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    const text = `╔════════════════════════════════════════╗
║     💖 JAMALI TECH MD 💖              ║
║          😎 IS ALIVE 😎               ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  👑 Owner    : ${config.OWNER_NAME}
│  🤖 Bot Name : ${config.BOT_NAME}
│  🔢 Version  : ${config.BOT_VERSION}
│  ⏱️ Uptime   : ${hours}h ${minutes}m
│  ⚡ Speed    : ${Date.now() - start} ms
│  📌 Prefix   : ${prefix}
│  🌍 Status   : 🟢 ACTIVE
╰────────────────────────────────────────╯

${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption: text }, { quoted: myquoted });
                    break;
                }
                
                case 'owner':
                case 'admin': {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nORG:${config.BOT_NAME}\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:${config.OWNER_NUMBER}\nEMAIL:${config.OWNER_EMAIL}\nEND:VCARD`;
                    await socket.sendMessage(sender, { contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: myquoted });
                    await socket.sendMessage(sender, { 
                        text: `╔════════════════════════════════════════╗
║         👑 OWNER INFO 👑               ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  👤 Name    : ${config.OWNER_NAME}
│  📞 WhatsApp: wa.me/${config.OWNER_NUMBER}
│  📧 Email   : ${config.OWNER_EMAIL}
│  🤖 Bot     : ${config.BOT_NAME}
│  🔢 Version : ${config.BOT_VERSION}
╰────────────────────────────────────────╯

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'ping':
                case 'speed': {
                    const start = Date.now();
                    const ping = Date.now() - start;
                    await socket.sendMessage(sender, { 
                        text: `╔════════════════════════════════════════╗
║            ⚡ PONG ⚡                   ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  📡 Speed    : ${ping} ms
│  🌐 Status   : 🟢 Excellent
│  🤖 Bot      : ${config.BOT_NAME}
│  🔢 Version  : ${config.BOT_VERSION}
╰────────────────────────────────────────╯

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'repo':
                case 'github': {
                    await socket.sendMessage(sender, { 
                        text: `╔════════════════════════════════════════╗
║          📦 REPOSITORY 📦              ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  🔗 GitHub   : ${config.REPO_LINK}
│  ⭐ Star us on GitHub!
│  🔄 Fork and contribute
│  🤖 Bot      : ${config.BOT_NAME}
╰────────────────────────────────────────╯

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'runtime':
                case 'uptime': {
                    const uptime = process.uptime();
                    const days = Math.floor(uptime / 86400);
                    const hours = Math.floor((uptime % 86400) / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    await socket.sendMessage(sender, { 
                        text: `╔════════════════════════════════════════╗
║          ⏱️ RUNTIME INFO ⏱️             ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  📅 Days     : ${days}
│  ⏰ Hours    : ${hours}
│  🕐 Minutes  : ${minutes}
│  ⚡ Seconds  : ${seconds}
│  🤖 Bot      : ${config.BOT_NAME}
╰────────────────────────────────────────╯

${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'jid':
                case 'myid': {
                    let replyJid = '';
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) replyJid = msg.message.extendedTextMessage.contextInfo.participant;
                    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    const caption = `╔════════════════════════════════════════╗
║         📍 JID INFORMATION 📍          ║
╚════════════════════════════════════════╝

╭────────────────────────────────────────╮
│  💬 Chat JID   : ${sender}
${replyJid ? `│  🔄 Replied    : ${replyJid}\n` : ''}${mentionedJid?.length ? `│  👥 Mentioned  : ${mentionedJid.join(', ')}\n` : ''}${msg.key.remoteJid.endsWith('@g.us') ? `│  👥 Group JID  : ${msg.key.remoteJid}\n` : ''}
╰────────────────────────────────────────╯

📝 *Note:*
• User JID: number@s.whatsapp.net
• Group JID: number@g.us
• Channel JID: number@newsletter

${footer}`;
                    await socket.sendMessage(sender, { image: { url: logo }, caption }, { quoted: myquoted });
                    break;
                }
                
                case 'song':
                case 'music': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide a song name*\n📌 Usage: .song <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `❌ *No results for: ${query}*` }, { quoted: myquoted });
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
                
                case 'video':
                case 'ytvideo': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide a video name*\n📌 Usage: .video <video name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `❌ *No results for: ${query}*` }, { quoted: myquoted });
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
                
                case 'save':
                case 'savestatus': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ *Reply to a status message with .save*' }, { quoted: myquoted });
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
                
                case 'sticker':
                case 's': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ *Reply to an image/video to convert to sticker*' }, { quoted: myquoted });
                    let mediaData = null;
                    if (quotedMsg.imageMessage) mediaData = quotedMsg.imageMessage;
                    else if (quotedMsg.videoMessage) mediaData = quotedMsg.videoMessage;
                    if (!mediaData) return await socket.sendMessage(sender, { text: '❌ *Reply to an image or video*' }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });
                    const buffer = await downloadAndSaveMedia(mediaData, mediaData.imageMessage ? 'image' : 'video');
                    await socket.sendMessage(sender, { sticker: buffer }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    break;
                }
                
                case 'getpp':
                case 'profile': {
                    let targetJid = sender, profileName = "Your";
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) { targetJid = msg.message.extendedTextMessage.contextInfo.participant; profileName = "Replied User"; }
                    else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) { targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0]; profileName = "Mentioned User"; }
                    const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);
                    if (!ppUrl) return await socket.sendMessage(sender, { text: `❌ *No profile picture for ${profileName}*` }, { quoted: myquoted });
                    await socket.sendMessage(sender, { image: { url: ppUrl }, caption: `✨ *PROFILE PICTURE* ✨\n\n👤 *${profileName}*\n📱 *JID:* ${targetJid}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'ai':
                case 'chat': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide a message*\n📌 Usage: .ai <message>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
                    try {
                        const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(query)}`);
                        if (response.data?.result) {
                            await socket.sendMessage(sender, { text: `🤖 *${config.BOT_NAME} AI*\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
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
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide a search query*\n📌 Usage: .yts <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `❌ *No results for: ${query}*` }, { quoted: myquoted });
                    let resultText = `🔍 *YOUTUBE SEARCH RESULTS*\n📌 Query: ${query}\n📊 Found: ${searchResults.videos.length} videos\n\n`;
                    searchResults.videos.slice(0, 5).forEach((video, i) => {
                        resultText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
                        resultText += `┃ 🎬 *${i+1}. ${video.title.substring(0, 45)}*\n`;
                        resultText += `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n`;
                        resultText += `┃ ⏱️ Duration: ${video.timestamp}\n`;
                        resultText += `┃ 👀 Views: ${video.views?.toLocaleString()}\n`;
                        resultText += `┃ 📅 Uploaded: ${video.ago}\n`;
                        resultText += `┃ 📺 Channel: ${video.author.name}\n`;
                        resultText += `┃ 🔗 Link: ${video.url}\n`;
                        resultText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
                    });
                    resultText += footer;
                    await socket.sendMessage(sender, { text: resultText }, { quoted: myquoted });
                    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    break;
                }
                
                case 'weather':
                case 'hali': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide city name*\n📌 Usage: .weather <city>' }, { quoted: myquoted });
                    const city = args.join(' ');
                    await socket.sendMessage(sender, { react: { text: '🌤️', key: msg.key } });
                    try {
                        const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
                        const data = response.data;
                        const current = data.current_condition[0];
                        const text = `🌤️ *WEATHER IN ${city.toUpperCase()}*\n\n🌡️ Temperature: ${current.temp_C}°C\n💨 Wind: ${current.windspeedKmph} km/h\n💧 Humidity: ${current.humidity}%\n☁️ Cloudcover: ${current.cloudcover}%\n🌅 Sunrise: ${current.astronomy[0].sunrise}\n🌇 Sunset: ${current.astronomy[0].sunset}\n\n${footer}`;
                        await socket.sendMessage(sender, { text }, { quoted: myquoted });
                        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Could not find weather for ${city}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'translate':
                case 'tafsiri': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide text to translate*\n📌 Usage: .translate <text>' }, { quoted: myquoted });
                    const text = args.join(' ');
                    try {
                        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
                        const translated = response.data[0][0][0];
                        await socket.sendMessage(sender, { text: `📝 *TRANSLATION*\n\n🔤 Original: ${text}\n🌐 Translated: ${translated}\n\n${footer}` }, { quoted: myquoted });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Translation failed` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'qrcode': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ *Provide text to generate QR code*\n📌 Usage: .qrcode <text>' }, { quoted: myquoted });
                    const text = args.join(' ');
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
                    await socket.sendMessage(sender, { image: { url: qrUrl }, caption: `📱 *QR CODE*\n\n🔗 Data: ${text}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'restart':
                case 'reboot': {
                    if (!isOwner(sender)) return await socket.sendMessage(sender, { text: '❌ *This command is for owner only!*' }, { quoted: myquoted });
                    await socket.sendMessage(sender, { text: `🔄 *Restarting ${config.BOT_NAME}...*\n⏱️ Please wait a moment.` }, { quoted: myquoted });
                    setTimeout(() => {
                        process.exit(0);
                    }, 2000);
                    break;
                }
                
                default: {
                    if (command && command.length > 2) {
                        try {
                            const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(command + ' ' + args.join(' '))}`);
                            if (response.data?.result) {
                                await socket.sendMessage(sender, { text: `🤖 *${config.BOT_NAME} AI*\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
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
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
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
    console.log(`❤️ JAMALI TECH MD - Connecting: ${sanitizedNumber} 💖`);
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
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { image: { url: logo }, caption: formatMessage('💖 JAMALI TECH MD 💖', `😎 Connected!\n📞 Number: ${sanitizedNumber}\n👑 Owner: ${config.OWNER_NAME}\n💎 Version: ${config.BOT_VERSION}`, footer) });
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

// ==================== API ROUTES ====================
// Pairing page
router.get('/', (req, res) => {
    res.send(getPairingHTML());
});

// Pairing API
router.get('/pair', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: isSessionActive(sanitizedNumber) ? 'already_connected' : 'reconnecting' });
    await EmpirePair(number, res);
});

// Active sessions
router.get('/active', (req, res) => {
    const activeNumbers = [];
    for (const [number] of activeSockets) if (isSessionActive(number)) activeNumbers.push(number);
    res.send({ count: activeNumbers.length, numbers: activeNumbers, bot: config.BOT_NAME, owner: config.OWNER_NAME });
});

// Status
router.get('/status', (req, res) => {
    res.send({ 
        online: true, 
        bot: config.BOT_NAME,
        version: config.BOT_VERSION,
        owner: config.OWNER_NAME,
        activesessions: activeSockets.size, 
        uptime: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s`,
        channel: config.CHANNEL_LINK
    });
});

// Delete session
router.delete('/session/:number', async (req, res) => {
    const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) activeSockets.get(sanitizedNumber).ws.close();
    await deleteSessionImmediately(sanitizedNumber);
    res.send({ status: 'success', message: `Session ${sanitizedNumber} deleted` });
});

initializeAutoManagement();
module.exports = router;
