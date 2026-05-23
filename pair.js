// pair.js (main file)
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
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

// Load config
require('dotenv').config({ path: './2nd_dev_config.env' });

// MongoDB setup (same as before)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://...';
// ... (keep all your existing MongoDB functions: initializeMongoDB, saveSessionToMongoDB, etc.)

// Configs
const config = {
    PREFIX: '.',
    OWNER_NUMBER: '255784062158',
    OWNER_NAME: 'JAMALI TECH EMPIRE',
    BOT_VERSION: '2.0.0',
    LOGO_URL: 'https://files.catbox.moe/xney4v.jpg',
    FOOTER: '> *♱♱♱♱♱ POWERED BY JAMALI TECH EMPIRE ♱♱♱♱♱*',
    // ... rest of your config
};

// ========== PLUGIN LOADER ==========
const plugins = new Map(); // key: command name, value: plugin object

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
                // Support single command or array of commands
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

// ========== COMMAND HANDLER (uses plugins) ==========
async function handleCommand(sock, msg, command, args, sender, prefix, userConfig) {
    const plugin = plugins.get(command.toLowerCase());
    if (plugin) {
        try {
            await plugin.execute(sock, msg, args, sender, prefix, {
                config,
                logo: config.LOGO_URL,
                footer: config.FOOTER,
                downloadAndSaveMedia,
                isOwner: (jid) => jid.replace(/[^0-9]/g, '') === config.OWNER_NUMBER.replace(/[^0-9]/g, ''),
                yts: require('yt-search'),
                ytdl: require('ytdl-core'),
                axios,
                fs,
                path
            });
        } catch (err) {
            console.error(`Plugin error (${command}):`, err);
            await sock.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: msg });
        }
        return true;
    }
    return false; // command not found
}

// ========== MODIFIED setupCommandHandlers ==========
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const userConfig = await loadUserConfig(number);
        const msg = messages[0];
        const m = sms(socket, msg);
        const from = msg.key.remoteJid;
        const prefix = userConfig.PREFIX || '.';
        
        // Ignore status and newsletters
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || config.NEWSLETTER_JIDS.includes(msg.key?.remoteJid)) return;
        
        let command = null, args = [], sender = msg.key.remoteJid;
        
        // Extract text command
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
        
        // Try to handle with plugin
        const handled = await handleCommand(socket, msg, command, args, sender, prefix, userConfig);
        
        // Fallback AI (optional)
        if (!handled && command.length > 2) {
            try {
                const response = await axios.get(`https://api.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(command + ' ' + args.join(' '))}`);
                if (response.data?.result) {
                    await socket.sendMessage(sender, { text: `🤖 *JAMALI AI*\n\n${response.data.result}\n\n${config.FOOTER}` }, { quoted: msg });
                }
            } catch (e) {}
        }
    });
}

// ========== KEEP ALL YOUR EXISTING FUNCTIONS ==========
// (EmpirePair, initializeMongoDB, saveSession, autoRestore, etc. - unchanged)

// Load plugins BEFORE starting
loadPlugins();

// Then your existing routes and initialization...
router.get('/', async (req, res) => { /* same as before */ });
router.get('/active', (req, res) => { /* same */ });
// ... rest of routes

initializeAutoManagement();
module.exports = router;
