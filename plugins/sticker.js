module.exports = {
    command: ['sticker', 's'],
    description: 'Convert image/video to sticker',
    usage: '.sticker (reply to image/video)',
    category: 'Media',
    async execute(sock, msg, args, sender, prefix, { downloadAndSaveMedia }) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return await sock.sendMessage(sender, { 
                text: `❌ *Reply to an image/video to convert to sticker*\n📌 Usage: ${prefix}sticker` 
            }, { quoted: msg });
        }
        let mediaData = null;
        if (quotedMsg.imageMessage) mediaData = quotedMsg.imageMessage;
        else if (quotedMsg.videoMessage) mediaData = quotedMsg.videoMessage;
        if (!mediaData) {
            return await sock.sendMessage(sender, { text: '❌ *Reply to an image or video*' }, { quoted: msg });
        }
        await sock.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });
        const buffer = await downloadAndSaveMedia(mediaData, mediaData.imageMessage ? 'image' : 'video');
        await sock.sendMessage(sender, { sticker: buffer }, { quoted: msg });
        await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    }
};
