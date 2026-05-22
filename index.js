const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const mongoose = require('mongoose');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

// ==================== CONFIGURATIONS ====================
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dinu60970_db_user:RfGn7kG6A5jLe2px@cluster0.4yb6fvp.mongodb.net/';

const config = {
    PREFIX: process.env.PREFIX || '.',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '255784062158',
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    BOT_NAME: process.env.BOT_NAME || 'JAMALI TECH MD',
    BOT_VERSION: '2.0.0',
    AUTO_VIEW_STATUS: process.env.AUTO_VIEW_STATUS || 'true',
    AUTO_LIKE_STATUS: process.env.AUTO_LIKE_STATUS || 'true',
    AUTO_RECORDING: process.env.AUTO_RECORDING || 'true',
    AUTO_LIKE_EMOJI: ['💎', '✨', '👑', '🔥', '⚡', '❤️'],
    CHANNEL_LINK: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h',
    REPO_LINK: 'https://github.com/jamalitechempire/Jamali-tech-bot',
    PAIRING_CODE_NAME: process.env.PAIRING_CODE_NAME || 'JAMALITZ',
    SESSION_BASE_PATH: './session'
};

const botLogo = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';
const footer = `> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*`;

// Session Management
const activeSockets = new Map();
const socketCreationTime = new Map();
const disconnectionTime = new Map();
const sessionHealth = new Map();
const reconnectionAttempts = new Map();
const pendingSaves = new Map();
const restoringNumbers = new Set();
const sessionConnectionStatus = new Map();

let mongoConnected = false;

// MongoDB Schemas
const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    sessionData: { type: Object, required: true },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    health: { type: String, default: 'active' }
});

const Session = mongoose.model('Session', sessionSchema);

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== MONGO DB FUNCTIONS ====================
async function initializeMongoDB() {
    try {
        if (mongoConnected) return true;
        await mongoose.connect(MONGODB_URI);
        mongoConnected = true;
        console.log('✅ MongoDB Atlas connected successfully');
        await Session.createIndexes();
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
        console.log(`🗑️ Session deleted from MongoDB: ${sanitizedNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ MongoDB delete failed:`, error.message);
        return false;
    }
}

// ==================== HELPER FUNCTIONS ====================
function initializeDirectories() {
    [config.SESSION_BASE_PATH, './temp', './data'].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    if (!fs.existsSync('./data/admin.json')) fs.writeFileSync('./data/admin.json', JSON.stringify([config.OWNER_NUMBER], null, 2));
    if (!fs.existsSync('./data/sendTranslations.js')) {
        fs.writeFileSync('./data/sendTranslations.js', 'module.exports = { sendTranslations: ["save", "savestatus", "download status"] };');
    }
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
    restoringNumbers.delete(sanitizedNumber);
    activeSockets.delete(sanitizedNumber);
    console.log(`✅ Deleted session: ${sanitizedNumber}`);
}

function formatMessage(title, content, footerMsg) { return `${title}\n\n${content}\n\n${footerMsg}`; }
function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function sendAdminConnectMessage(socket, number) {
    const admins = [config.OWNER_NUMBER];
    for (const admin of admins) {
        try {
            await socket.sendMessage(`${admin}@s.whatsapp.net`, {
                image: { url: botLogo },
                caption: formatMessage('JAMALI TECH MD CONNECTED', `Premium Bot Service\n\n📞 Number: ${number}\n🟢 Status: Auto-Connected\n⏰ Time: ${getSriLankaTimestamp()}\n👑 Owner: ${config.OWNER_NAME}`, footer)
            });
        } catch (error) { console.error(`❌ Failed to send admin message:`, error); }
    }
}

async function updateAboutStatus(socket) {
    try { await socket.updateProfileStatus(`${config.BOT_NAME} - Premium WhatsApp Bot`); }
    catch (error) { console.error('❌ Failed to update About status:', error); }
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);
const myquoted = {
    key: { remoteJid: 'status@broadcast', participant: '0@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
    message: { contactMessage: { displayName: config.BOT_NAME, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${config.BOT_NAME}\nORG:${config.OWNER_NAME};\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:${config.OWNER_NUMBER}\nEND:VCARD` } }
};

// ==================== EVENT HANDLERS ====================
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
        try {
            if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            if (config.AUTO_VIEW_STATUS === 'true') {
                await socket.readMessages([message.key]);
            }
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            }
        } catch (error) { console.error('Status handler error:', error); }
    });
}

// ==================== COMMAND HANDLERS ====================
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        const prefix = config.PREFIX;
        const sender = msg.key.remoteJid;
        
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        let command = null, args = [];
        
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(prefix)) {
                const parts = text.slice(prefix.length).trim().split(/\s+/);
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
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const menuText = `╔════════════════════════════════════════╗
║           JAMALI TECH MD               ║
║         PREMIUM WHATSAPP BOT           ║
╚════════════════════════════════════════╝

┌────────────────────────────────────────┐
│  🤖 BOT INFORMATION                     │
├────────────────────────────────────────┤
│  👑 Owner: ${config.OWNER_NAME}
│  🤖 Name: ${config.BOT_NAME}
│  🔢 Version: ${config.BOT_VERSION}
│  📌 Prefix: ${prefix}
│  ⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
│  ⚡ Speed: ${Date.now() - start} ms
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  ⚡ QUICK COMMANDS                      │
├────────────────────────────────────────┤
│  • ${prefix}alive - Bot Status
│  • ${prefix}ping - Speed Test
│  • ${prefix}owner - Contact Owner
│  • ${prefix}repo - GitHub Repo
│  • ${prefix}channel - View Channel
│  • ${prefix}jid - Your JID
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  📥 DOWNLOAD COMMANDS                   │
├────────────────────────────────────────┤
│  • ${prefix}song - Download Music
│  • ${prefix}video - Download Video
│  • ${prefix}tiktok - TikTok Downloader
│  • ${prefix}facebook - FB Downloader
│  • ${prefix}save - Save Status
│  • ${prefix}vv - ViewOnce Unlock
│  • ${prefix}getpp - Profile Picture
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🤖 AI COMMANDS                         │
├────────────────────────────────────────┤
│  • ${prefix}ai - Chat with AI
│  • ${prefix}translate - Translate Text
│  • ${prefix}weather - Weather Info
│  • ${prefix}yts - YouTube Search
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  👥 GROUP COMMANDS                      │
├────────────────────────────────────────┤
│  • ${prefix}tagall - Mention All
│  • ${prefix}tagadmin - Mention Admins
│  • ${prefix}kick - Remove Member
│  • ${prefix}add - Add Member
│  • ${prefix}promote - Make Admin
│  • ${prefix}demote - Remove Admin
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🎮 GAMES                               │
├────────────────────────────────────────┤
│  • ${prefix}truth - Truth Game
│  • ${prefix}dare - Dare Game
│  • ${prefix}quote - Random Quote
│  • ${prefix}joke - Random Joke
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  👁️ VIEW CHANNEL                        │
├────────────────────────────────────────┤
│  📢 ${config.CHANNEL_LINK}
│  👑 Owner: wa.me/${config.OWNER_NUMBER}
└────────────────────────────────────────┘

${footer}`;
                    
                    await socket.sendMessage(sender, { image: { url: botLogo }, caption: menuText }, { quoted: myquoted });
                    break;
                }
                
                case 'alive': {
                    const start = Date.now();
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    const text = `╔══════════════════════════╗
║     JAMALI TECH MD       ║
║        IS ALIVE          ║
╚══════════════════════════╝

┌──────────────────────────┐
│  👑 Owner: ${config.OWNER_NAME}
│  ⏱️ Uptime: ${hours}h ${minutes}m
│  📌 Prefix: ${prefix}
│  ⚡ Speed: ${Date.now() - start} ms
│  🌍 Status: ACTIVE
└──────────────────────────┘

${footer}`;
                    await socket.sendMessage(sender, { image: { url: botLogo }, caption: text }, { quoted: myquoted });
                    break;
                }
                
                case 'ping': {
                    const start = Date.now();
                    const ping = Date.now() - start;
                    await socket.sendMessage(sender, { text: `┌──⌈ PONG ⌋\n│ ⚡ Speed: ${ping} ms\n│ 🌐 Status: Excellent\n│ 🤖 Bot: ${config.BOT_NAME}\n└────────────────\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'owner': {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nORG:${config.BOT_NAME}\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:${config.OWNER_NUMBER}\nEND:VCARD`;
                    await socket.sendMessage(sender, { contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: myquoted });
                    await socket.sendMessage(sender, { text: `👑 *OWNER INFO*\n\nName: ${config.OWNER_NAME}\nWhatsApp: wa.me/${config.OWNER_NUMBER}\nBot: ${config.BOT_NAME}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'channel':
                case 'viewchannel': {
                    await socket.sendMessage(sender, { text: `📢 *JAMALI TECH CHANNEL*\n\nJoin our official channel:\n${config.CHANNEL_LINK}\n\nFollow for daily updates!\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'repo':
                case 'github': {
                    await socket.sendMessage(sender, { text: `📦 *GITHUB REPOSITORY*\n\nRepo: ${config.REPO_LINK}\n⭐ Star us on GitHub!\n🔄 Fork and contribute\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'jid': {
                    const caption = `📍 *JID INFORMATION*\n\n💬 Chat JID: ${sender}\n📝 Note: User JID: number@s.whatsapp.net\n\n${footer}`;
                    await socket.sendMessage(sender, { image: { url: botLogo }, caption }, { quoted: myquoted });
                    break;
                }
                
                case 'song': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ Provide a song name\nUsage: .song <song name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `❌ No results for: ${query}` }, { quoted: myquoted });
                    const video = searchResults.videos[0];
                    await socket.sendMessage(sender, { text: `🎵 Downloading: ${video.title}...` }, { quoted: myquoted });
                    try {
                        const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                        await socket.sendMessage(sender, { audio: { stream }, mimetype: 'audio/mpeg', fileName: `${video.title}.mp3` }, { quoted: myquoted });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'video': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ Provide a video name\nUsage: .video <video name>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    const searchResults = await yts(query);
                    if (!searchResults?.videos?.length) return await socket.sendMessage(sender, { text: `❌ No results for: ${query}` }, { quoted: myquoted });
                    const video = searchResults.videos[0];
                    await socket.sendMessage(sender, { text: `🎬 Downloading: ${video.title}...` }, { quoted: myquoted });
                    try {
                        const stream = ytdl(video.url, { filter: 'audioandvideo', quality: 'highest' });
                        await socket.sendMessage(sender, { video: { stream }, caption: `🎬 ${video.title}\n\n${footer}` }, { quoted: myquoted });
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'save': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ Reply to a status message with .save' }, { quoted: myquoted });
                    if (quotedMsg.imageMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
                        await socket.sendMessage(sender, { image: buffer, caption: `✨ STATUS SAVED ✨\n\n${footer}` });
                    } else if (quotedMsg.videoMessage) {
                        const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
                        await socket.sendMessage(sender, { video: buffer, caption: `✨ STATUS SAVED ✨\n\n${footer}` });
                    }
                    break;
                }
                
                case 'vv':
                case 'viewonce': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ Reply to a ViewOnce message with .vv' }, { quoted: myquoted });
                    let mediaData = null, mediaType = null;
                    if (quotedMsg.imageMessage?.viewOnce) { mediaData = quotedMsg.imageMessage; mediaType = 'image'; }
                    else if (quotedMsg.videoMessage?.viewOnce) { mediaData = quotedMsg.videoMessage; mediaType = 'video'; }
                    if (mediaData) {
                        const buffer = await downloadAndSaveMedia(mediaData, mediaType);
                        if (mediaType === 'image') await socket.sendMessage(sender, { image: buffer, caption: `✨ VIEWONCE IMAGE RETRIEVED ✨\n\n${footer}` });
                        else await socket.sendMessage(sender, { video: buffer, caption: `✨ VIEWONCE VIDEO RETRIEVED ✨\n\n${footer}` });
                    }
                    break;
                }
                
                case 'sticker': {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quotedMsg) return await socket.sendMessage(sender, { text: '❌ Reply to an image/video to convert to sticker' }, { quoted: myquoted });
                    let mediaData = null;
                    if (quotedMsg.imageMessage) mediaData = quotedMsg.imageMessage;
                    else if (quotedMsg.videoMessage) mediaData = quotedMsg.videoMessage;
                    if (!mediaData) return await socket.sendMessage(sender, { text: '❌ Reply to an image or video' }, { quoted: myquoted });
                    const buffer = await downloadAndSaveMedia(mediaData, mediaData.imageMessage ? 'image' : 'video');
                    await socket.sendMessage(sender, { sticker: buffer }, { quoted: myquoted });
                    break;
                }
                
                case 'getpp': {
                    let targetJid = sender;
                    if (msg.message.extendedTextMessage?.contextInfo?.participant) targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                    const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);
                    if (!ppUrl) return await socket.sendMessage(sender, { text: `❌ No profile picture found` }, { quoted: myquoted });
                    await socket.sendMessage(sender, { image: { url: ppUrl }, caption: `✨ PROFILE PICTURE ✨\n\nJID: ${targetJid}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'ai': {
                    if (!args[0]) return await socket.sendMessage(sender, { text: '❌ Provide a message\nUsage: .ai <message>' }, { quoted: myquoted });
                    const query = args.join(' ');
                    try {
                        const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(query)}`);
                        if (response.data?.result) {
                            await socket.sendMessage(sender, { text: `🤖 ${config.BOT_NAME} AI\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
                        } else {
                            await socket.sendMessage(sender, { text: `❌ AI service unavailable` }, { quoted: myquoted });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: myquoted });
                    }
                    break;
                }
                
                case 'truth': {
                    const truths = ["What's your biggest fear?", "Have you ever lied to your best friend?", "What's the biggest trouble you've ever gotten into?", "What's something you're insecure about?"];
                    const randomTruth = truths[Math.floor(Math.random() * truths.length)];
                    await socket.sendMessage(sender, { text: `🎲 TRUTH\n\n${randomTruth}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'dare': {
                    const dares = ["Send a message to your crush right now!", "Share your screen with someone", "Do 10 pushups", "Send a random sticker to the last person you messaged"];
                    const randomDare = dares[Math.floor(Math.random() * dares.length)];
                    await socket.sendMessage(sender, { text: `🎲 DARE\n\n${randomDare}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'quote': {
                    const quotes = ["The only limit is your mind.", "Success is not final, failure is not fatal.", "Believe you can and you're halfway there.", "Don't watch the clock; do what it does. Keep going."];
                    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                    await socket.sendMessage(sender, { text: `💬 QUOTE\n\n${randomQuote}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                case 'joke': {
                    const jokes = ["Why don't scientists trust atoms? Because they make up everything!", "What do you call a fake noodle? An impasta!", "Why did the scarecrow win an award? He was outstanding in his field!"];
                    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
                    await socket.sendMessage(sender, { text: `😂 JOKE\n\n${randomJoke}\n\n${footer}` }, { quoted: myquoted });
                    break;
                }
                
                default: {
                    if (command && command.length > 2) {
                        try {
                            const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(command + ' ' + args.join(' '))}`);
                            if (response.data?.result) {
                                await socket.sendMessage(sender, { text: `🤖 ${config.BOT_NAME} AI\n\n${response.data.result}\n\n${footer}` }, { quoted: myquoted });
                            }
                        } catch (error) {}
                    }
                    break;
                }
            }
        } catch (error) { console.error('Command error:', error); }
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
                setTimeout(() => deleteSessionImmediately(sanitizedNumber), 600000);
            } else {
                setTimeout(async () => {
                    activeSockets.delete(sanitizedNumber);
                    await EmpirePair(number, { headersSent: false, send: () => {}, status: () => {} });
                }, 10000);
            }
        } else if (connection === 'open') {
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
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
        const logger = pino({ level: 'silent' });
        
        const socket = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            printQRInTerminal: false,
            logger: logger,
            browser: Browsers.macOS("Desktop"),
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000
        });
        
        socketCreationTime.set(sanitizedNumber, Date.now());
        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        
        if (!socket.authState.creds.registered) {
            try {
                await delay(2000);
                const code = await socket.requestPairingCode(sanitizedNumber, config.PAIRING_CODE_NAME);
                console.log(`✅ PAIRING CODE FOR ${sanitizedNumber}: ${code}`);
                console.log(`🔑 Use this code: ${code}`);
                console.log(`📱 Open WhatsApp → Settings → Linked Devices → Link with Phone Number`);
                
                if (!res.headersSent && code) {
                    return res.send({ code: code, status: 'success' });
                }
            } catch (error) {
                console.error(`❌ Pairing error:`, error.message);
                if (!res.headersSent) {
                    return res.status(500).send({ error: error.message });
                }
            }
        } else {
            if (!res.headersSent) {
                return res.send({ status: 'already_connected' });
            }
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
                const userConfig = await loadSessionFromMongoDB(sanitizedNumber);
                activeSockets.set(sanitizedNumber, socket);
                sessionHealth.set(sanitizedNumber, 'active');
                sessionConnectionStatus.set(sanitizedNumber, 'open');
                disconnectionTime.delete(sanitizedNumber);
                restoringNumbers.delete(sanitizedNumber);
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { image: { url: botLogo }, caption: formatMessage(config.BOT_NAME, `Connected!\n📞 Number: ${sanitizedNumber}\n👑 Owner: ${config.OWNER_NAME}\n💎 Version: ${config.BOT_VERSION}`, footer) });
                await sendAdminConnectMessage(socket, sanitizedNumber);
                console.log(`✅ Session fully connected: ${sanitizedNumber}`);
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
// Frontend Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'pair.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'settings.html'));
});

// API Routes
app.get('/api/pair', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) return res.status(200).send({ status: isSessionActive(sanitizedNumber) ? 'already_connected' : 'reconnecting' });
    await EmpirePair(number, res);
});

app.get('/api/active', (req, res) => {
    const activeNumbers = [];
    for (const [number] of activeSockets) if (isSessionActive(number)) activeNumbers.push(number);
    res.send({ count: activeNumbers.length, numbers: activeNumbers, bot: config.BOT_NAME, owner: config.OWNER_NAME });
});

app.get('/api/status', (req, res) => {
    res.send({ online: true, bot: config.BOT_NAME, version: config.BOT_VERSION, owner: config.OWNER_NAME, activesessions: activeSockets.size, uptime: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s` });
});

app.get('/api/ping', (req, res) => {
    res.send({ status: 'active', activeSessions: Array.from(activeSockets.keys()).filter(n => isSessionActive(n)).length, pendingSaves: pendingSaves.size });
});

app.get('/api/mongodb-status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
        const sessionCount = await Session.countDocuments({ status: 'active' });
        res.send({ mongodb: { status: states[mongoStatus], connected: mongoConnected, sessionCount: sessionCount } });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

app.post('/api/sync-mongodb', async (req, res) => {
    res.send({ status: 'success', message: 'Sync triggered' });
});

app.post('/api/cleanup', async (req, res) => {
    res.send({ status: 'success', message: 'Cleanup triggered' });
});

app.delete('/api/session/:number', async (req, res) => {
    const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) activeSockets.get(sanitizedNumber).ws.close();
    await deleteSessionImmediately(sanitizedNumber);
    res.send({ status: 'success', message: `Session ${sanitizedNumber} deleted` });
});

app.post('/api/clear-bad-session/:number', async (req, res) => {
    res.send({ status: 'success', message: 'Session cleared' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'jamali123') {
        res.send({ success: true });
    } else {
        res.status(401).send({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/check-session', async (req, res) => {
    res.send({ loggedIn: false });
});

app.get('/api/settings/:number', async (req, res) => {
    res.json({ PREFIX: config.PREFIX, BUTTON: 'true', AUTO_VIEW_STATUS: config.AUTO_VIEW_STATUS, AUTO_LIKE_STATUS: config.AUTO_LIKE_STATUS, AUTO_RECORDING: config.AUTO_RECORDING, AUTO_LIKE_EMOJI: config.AUTO_LIKE_EMOJI });
});

app.post('/api/settings/:number', async (req, res) => {
    res.json({ success: true, message: 'Settings saved successfully!' });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`✅ JAMALI TECH MD Server running on port ${PORT}`);
    console.log(`🌐 Website: http://localhost:${PORT}`);
    console.log(`🔗 Pairing endpoint: /api/pair?number=255XXXXXXXXX`);
    console.log(`🔑 Pairing Code Name: ${config.PAIRING_CODE_NAME}`);
});

// Initialize MongoDB and Auto Management
initializeMongoDB();

module.exports = app;
