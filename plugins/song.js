// plugins/song.js
const yts = require('yt-search');
const ytdl = require('ytdl-core');

module.exports = {
    command: 'song',
    description: 'Download audio from YouTube',
    usage: '.song <song name>',
    category: 'Downloads',
    async execute(sock, msg, args, sender, prefix, { footer, yts, ytdl, axios }) {
        if (!args[0]) {
            return await sock.sendMessage(sender, { 
                text: `❌ *Provide a song name*\n📌 Usage: ${prefix}song <song name>` 
            }, { quoted: msg });
        }
        
        const query = args.join(' ');
        await sock.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
        
        const searchResults = await yts(query);
        if (!searchResults?.videos?.length) {
            return await sock.sendMessage(sender, { text: `❌ No results for: ${query}` }, { quoted: msg });
        }
        
        const video = searchResults.videos[0];
        await sock.sendMessage(sender, { text: `🎵 *Downloading:* ${video.title}\n⏱️ Please wait...` }, { quoted: msg });
        
        try {
            const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
            await sock.sendMessage(sender, { 
                audio: { stream }, 
                mimetype: 'audio/mpeg', 
                fileName: `${video.title}.mp3`,
                caption: `🎵 *${video.title}*\n\n${footer}`
            }, { quoted: msg });
            await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        } catch (error) {
            await sock.sendMessage(sender, { text: `❌ Error: ${error.message}` }, { quoted: msg });
        }
    }
};
