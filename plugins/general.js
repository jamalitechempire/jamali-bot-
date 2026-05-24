// plugins/general.js
module.exports = {
    command: ['general'], // Main command not actually used, subcommands handled manually
    description: 'General bot commands',
    usage: '.info | .owner | .runtime | .profile | .support',
    category: 'General',
    async execute(sock, msg, args, sender, prefix, { config, logo, footer, runtime }) {
        
        const getContextInfo = (m) => {
            return {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363425061263455@newsletter',
                    newsletterName: 'JAMALI TECH MD V2',
                    serverMessageId: 143,
                },
            };
        };

        const command = args[0]?.toLowerCase() || '';

        // 1. INFO COMMAND
        if (command === 'info' || command === 'about' || command === 'botinfo') {
            await sock.sendMessage(sender, {
                text: `╔════════════════════════════╗
║        📊 BOT INFO         ║
╚════════════════════════════╝

┌────────────────────────────┐
│  🤖 *Name*: JAMALI TECH MD V2
│  ⚡ *Version*: 2.0.0
│  👨‍💻 *Owner*: Jamali Tech
│  🌐 *Language*: JavaScript
│  📅 *Created*: 2024
│  🔧 *Status*: 🟢 Active
└────────────────────────────┘

${footer}`,
                contextInfo: getContextInfo(msg)
            });
            return;
        }

        // 2. OWNER COMMAND
        if (command === 'owner' || command === 'creator' || command === 'developer') {
            await sock.sendMessage(sender, {
                text: `╔════════════════════════════╗
║        👑 BOT OWNER        ║
╚════════════════════════════╝

┌────────────────────────────┐
│  👤 *Name*: Jamali Tech
│  📞 *Contact*: Wa.me/255XXXXXXXXX
│  📧 *Email*: jamalitech@gmail.com
│  🌐 *GitHub*: github.com/jamali
│  💬 *WhatsApp*: Click above
└────────────────────────────┘

${footer}`,
                contextInfo: getContextInfo(msg)
            });
            return;
        }

        // 3. RUNTIME COMMAND
        if (command === 'runtime' || command === 'uptime' || command === 'alive') {
            const uptime = runtime || process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            await sock.sendMessage(sender, {
                text: `╔════════════════════════════╗
║        ⏰ BOT RUNTIME       ║
╚════════════════════════════╝

┌────────────────────────────┐
│  📆 *Days*: ${days}
│  🕐 *Hours*: ${hours}
│  ⏱️ *Minutes*: ${minutes}
│  ⏲️ *Seconds*: ${seconds}
│  🟢 *Status*: Online
└────────────────────────────┘

${footer}`,
                contextInfo: getContextInfo(msg)
            });
            return;
        }

        // 4. PROFILE COMMAND
        if (command === 'profile' || command === 'myinfo' || command === 'whoami') {
            const pushName = msg.pushName || 'User';
            const userNumber = sender.split('@')[0];
            
            await sock.sendMessage(sender, {
                text: `╔════════════════════════════╗
║        👤 USER PROFILE      ║
╚════════════════════════════╝

┌────────────────────────────┐
│  🏷️ *Name*: ${pushName}
│  📞 *Number*: ${userNumber}
│  🤖 *Bot*: JAMALI TECH MD V2
│  💬 *Chat Type*: ${msg.key.remoteJid.includes('g.us') ? 'Group' : 'Private'}
└────────────────────────────┘

${footer}`,
                contextInfo: getContextInfo(msg)
            });
            return;
        }

        // 5. SUPPORT COMMAND
        if (command === 'support' || command === 'helpme' || command === 'contact') {
            await sock.sendMessage(sender, {
                text: `╔════════════════════════════╗
║        🆘 SUPPORT          ║
╚════════════════════════════╝

┌────────────────────────────┐
│  📞 *Support Contact*: 
│     Wa.me/255XXXXXXXXX
│  
│  📧 *Email*: 
│     support@jamalitech.com
│  
│  💬 *Report Issues*: 
│     Use .report <message>
│  
│  ⭐ *Donate*: 
│     Support development
└────────────────────────────┘

${footer}`,
                contextInfo: getContextInfo(msg)
            });
            return;
        }

        // Default help message for .general
        await sock.sendMessage(sender, {
            text: `╔════════════════════════════╗
║      📋 GENERAL COMMANDS    ║
╚════════════════════════════╝

┌────────────────────────────┐
│  📊 *.info* - Bot info
│  👑 *.owner* - Owner info
│  ⏰ *.runtime* - Uptime
│  👤 *.profile* - Your profile
│  🆘 *.support* - Support
└────────────────────────────┘

${footer}`,
            contextInfo: getContextInfo(msg)
        });
    }
};
