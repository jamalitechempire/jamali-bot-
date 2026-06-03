const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  Browsers,
  DisconnectReason,
  jidDecode,
  downloadContentFromMessage,
  getContentType,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");
const FileType = require("file-type");
const path = require("path");
const config = require("./config");
const { cmd, commands } = require("./momy");
const { sms } = require("./lib/msg");   // make sure you have lib/msg.js or adjust

const app = express();
const port = process.env.PORT || 3000;

// ========== LOAD SILATECH PLUGINS ==========
const silatechDir = path.join(__dirname, "silatech");
if (!fs.existsSync(silatechDir)) fs.mkdirSync(silatechDir, { recursive: true });
const pluginFiles = fs.readdirSync(silatechDir).filter(f => f.endsWith(".js"));
console.log(`📦 Loading ${pluginFiles.length} silatech plugins...`);
for (const file of pluginFiles) {
  try {
    require(path.join(silatechDir, file));
    console.log(`✅ Loaded: ${file}`);
  } catch (e) {
    console.error(`❌ Failed to load ${file}:`, e);
  }
}

const activeSockets = new Map();
const socketCreationTime = new Map();

// ========== AUTO-FOLLOW & AUTO-JOIN ==========
async function autoFollowNewsletters(conn) {
  if (!config.AUTO_FOLLOW_CHANNELS) return;
  console.log("📰 Auto-following newsletters...");
  for (const jid of config.NEWSLETTER_JIDS) {
    try {
      await conn.newsletterFollow(jid);
      console.log(`✅ Followed: ${jid}`);
      await delay(2000);
    } catch (e) { console.log(`❌ Failed follow ${jid}: ${e.message}`); }
  }
}

async function autoJoinGroups(conn) {
  if (!config.AUTO_JOIN_GROUPS) return;
  console.log("👥 Auto-joining groups...");
  for (const link of config.GROUP_LINKS) {
    const code = link.split("/").pop();
    if (!code) continue;
    try {
      await conn.groupAcceptInvite(code);
      console.log(`✅ Joined: ${link}`);
      await delay(3000);
    } catch (e) { console.log(`❌ Join failed ${link}: ${e.message}`); }
  }
}

// ========== START BOT (with QR + Pairing fallback) ==========
async function startBot(number, res = null) {
  const num = number.replace(/[^0-9]/g, "");
  if (activeSockets.has(num)) {
    if (res && !res.headersSent) return res.json({ status: "already_connected" });
    return;
  }
  const lockKey = `connecting_${num}`;
  if (global[lockKey]) {
    if (res && !res.headersSent) return res.json({ status: "connection_in_progress" });
    return;
  }
  global[lockKey] = true;

  try {
    const sessionDir = path.join(__dirname, "session", `session_${num}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // ----- CONFIGURATION: first try QR, if fails then pairing -----
    let usePairing = false;   // set to true if you want pairing code instead of QR
    const conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: !usePairing,  // prints QR in console
      usePairingCode: usePairing,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Safari"),
      syncFullHistory: false,
      getMessage: async () => null,
    });

    activeSockets.set(num, conn);
    socketCreationTime.set(num, Date.now());

    // QR code event (when not using pairing)
    if (!usePairing) {
      conn.ev.on("connection.update", (update) => {
        const { qr } = update;
        if (qr) {
          console.log("🔐 SCAN THIS QR CODE WITH WHATSAPP:");
          qrcode.generate(qr, { small: true });
          // If HTTP request exists, send QR as image maybe?
          if (res && !res.headersSent) {
            // Optionally send a response that QR is ready (but QR is in terminal)
            return res.json({ status: "qr_ready", message: "Scan QR from terminal" });
          }
        }
      });
    } else {
      // Pairing mode: request pairing code after a short delay
      setTimeout(async () => {
        try {
          const code = await conn.requestPairingCode(num);
          console.log(`🔑 Pairing Code: ${code}`);
          if (res && !res.headersSent) return res.json({ code, status: "pairing_code" });
          // Also send to owner via WhatsApp if possible
          const ownerJid = config.OWNER_NUMBER + "@s.whatsapp.net";
          await conn.sendMessage(ownerJid, { text: `🔑 *Pairing Code:* ${code}` });
        } catch (err) {
          console.error("❌ Pairing error, switching to QR mode...");
          // Fallback: re-initiate with QR
          // (restart bot or change flag)
        }
      }, 2000);
    }

    conn.ev.on("creds.update", async () => {
      await saveCreds();
      console.log("💾 Credentials saved");
    });

    conn.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        console.log(`✅ Connected: ${num}`);
        const ownerJid = config.OWNER_NUMBER + "@s.whatsapp.net";
        const welcome = `┏━❑ *${config.BOT_NAME}* ━━━━━━━━━━━
┃ 🤖 Status: Active
┃ ⚙️ Prefix: ${config.PREFIX}
┃ 🔓 Mode: ${config.MODE}
┃ 👑 Owner: @${config.OWNER_NUMBER}
┗━━━━━━━━━━━━━━━━━━━━━━━━━
> ✨ Powered by JAMALI TECH TZ`;
        await conn.sendMessage(ownerJid, { text: welcome, mentions: [ownerJid] }).catch(()=>{});
        // Run auto features
        await delay(5000);
        await autoFollowNewsletters(conn);
        await autoJoinGroups(conn);
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.log("❌ Logged out, cleaning session...");
          await fs.remove(sessionDir);
          activeSockets.delete(num);
          socketCreationTime.delete(num);
        } else {
          console.log("Connection closed, will retry...");
          activeSockets.delete(num);
          socketCreationTime.delete(num);
          // Optionally restart after delay
          setTimeout(() => startBot(number), 10000);
        }
      }
    });

    // ---------- MESSAGE HANDLER ----------
    conn.ev.on("messages.upsert", async (msg) => {
      try {
        let mek = msg.messages[0];
        if (!mek.message) return;
        // Handle ephemeral/viewonce
        if (mek.message.ephemeralMessage) mek.message = mek.message.ephemeralMessage.message;
        if (mek.message.viewOnceMessageV2) mek.message = mek.message.viewOnceMessageV2.message;
        const from = mek.key.remoteJid;
        if (!from || from === "status@broadcast") return;

        const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
        if (!body || !body.startsWith(config.PREFIX)) return;

        const args = body.slice(config.PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command = commands.find(c => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
        if (!command) return;

        const sender = mek.key.participant || mek.key.remoteJid;
        const isOwner = sender.split("@")[0] === config.OWNER_NUMBER;
        const reply = (text) => conn.sendMessage(from, { text }, { quoted: mek });
        const m = sms(conn, mek); // if you have sms function, otherwise remove

        await command.function(conn, mek, m, { from, reply, args, isOwner, config });
        if (command.react) await conn.sendMessage(from, { react: { text: command.react, key: mek.key } });
      } catch (e) { console.error("Message error:", e); }
    });

    // If there's an HTTP response pending and not sent, send a default
    if (res && !res.headersSent) {
      res.json({ status: "connecting", message: "Use QR from terminal or pairing code" });
    }

  } catch (err) {
    console.error("Start error:", err);
    if (res && !res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    delete global[lockKey];
  }
}

// ---------- EXPRESS SERVER (for pairing via web) ----------
app.use(express.json());
app.get("/", (req, res) => res.send(`${config.BOT_NAME} is running`));
app.get("/code", async (req, res) => {
  const number = req.query.number;
  if (!number) return res.status(400).json({ error: "Number required (e.g., /code?number=255xxx)" });
  await startBot(number, res);
});

app.listen(port, () => console.log(`🌐 HTTP server on port ${port}`));

// Auto-start for owner number if session exists (optional)
setTimeout(() => {
  if (fs.existsSync(path.join(__dirname, "session", `session_${config.OWNER_NUMBER}`))) {
    startBot(config.OWNER_NUMBER);
  }
}, 3000);

module.exports = { startBot };