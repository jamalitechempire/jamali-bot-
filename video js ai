const yts = require('yt-search');
const ytdl = require('ytdl-core');

module.exports = {
    command: 'video',
    description: 'Download video from YouTube',
    usage: '.video <video name>',
    category: 'Downloads',
    async execute(sock, msg, args, sender, prefix, { footer, yts, ytdl }) {
        if (!args[0]) {
            return await sock.sendMessage(sender, { 
                text: `❌ *Provide a video name*\n📌 Usage: ${prefix}video <video name>` 
            }, { quoted: msg });
        }
        const query = args.join(' ');
        await sock.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
        const searchResults = await yts(query);
        if (!searchResults?.videos?.length) {
            return await sock.sendMessage(sender, { text: `❌ No results for: ${query}` }, { quoted: msg });
        }
        const video = searchResults.videos[0];
        await sock.sendMessage(sender, { text: `🎬 *Downloading:* ${video.title}\n⏱️ Please wait...` }, { quoted: msg });
        try {
            const stream = ytdl(video.url, { filter: 'audioandvideo', quality: 'highest' });
            await sock.sendMessage(sender, { 
                video: { stream }, 
                caption: `🎬 *${video.title}*\n\n${footer}`
            }, { quoted: msg });
            await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        } catch (error) {
            await sock.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: msg });
        }
    }
                                          };
