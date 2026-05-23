// plugins/ping.js
module.exports = {
    command: ['ping', 'speed'],  // multiple commands aliases
    description: 'Check bot response time',
    usage: '.ping',
    category: 'Utility',
    async execute(sock, msg, args, sender, prefix, { config, logo, footer }) {
        const start = Date.now();
        const tempMsg = await sock.sendMessage(sender, { text: '⚡ \`\`\`Testing...\`\`\`' });
        const ping = Date.now() - start;
        await sock.sendMessage(sender, {
            text: `╔════════════════════════════╗
║        ⚡ PONG ⚡          ║
╚════════════════════════════╝

┌────────────────────────────┐
│  📡 *Speed* : ${ping} ms
│  🌐 *Status*: 🟢 Excellent
│  🤖 *Bot*   : JAMALI TECH MD V2
└────────────────────────────┘

${footer}`,
            edit: tempMsg.key
        });
    }
};
