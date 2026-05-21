case 'menu': {
  try { await socket.sendMessage(sender, { react: { text: "📋", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongoDB === 'function') userCfg = await loadUserConfigFromMongoDB((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

    const title = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏';

    const text = `
╔══════════════════════════════════════════════════════╗
                    ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨
╚══════════════════════════════════════════════════════╝

┌────────────────────────────────────────────────────┐
│  💎 *BOT INFO*                                      │
├────────────────────────────────────────────────────┤
│  👑 *Bot Name:* ${title}
│  🔧 *Version:* 1.0.0
│  👤 *Owner:* JAMALI TECH EMPIRE
│  ⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│  📌 *Prefix:* ${config.PREFIX}
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🛠️ *SYSTEM COMMANDS*                               │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}alive    - Check Bot Status
│  • ${config.PREFIX}ping     - Check Bot Speed
│  • ${config.PREFIX}jid      - Get Your JID
│  • ${config.PREFIX}owner    - Contact Owner
│  • ${config.PREFIX}count    - Session Statistics
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  📥 *DOWNLOAD COMMANDS*                             │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}song     - Download Music
│  • ${config.PREFIX}video    - Download YouTube Video
│  • ${config.PREFIX}tiktok   - Download TikTok
│  • ${config.PREFIX}facebook - Download FB Video
│  • ${config.PREFIX}save     - Save Status (Reply)
│  • ${config.PREFIX}vv       - ViewOnce Unlock
│  • ${config.PREFIX}getdp    - Get Profile Picture
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🤖 *AI & MEDIA TOOLS*                              │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}ai       - Chat with AI
│  • ${config.PREFIX}logo     - Create Custom Logo
│  • ${config.PREFIX}yts      - YouTube Search
│  • ${config.PREFIX}wame     - Generate WhatsApp Link
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  🔧 *SETTINGS COMMANDS*                             │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}settings - View All Settings
│  • ${config.PREFIX}setprefix [new]
│  • ${config.PREFIX}autoview [on/off]
│  • ${config.PREFIX}autolike [on/off]
│  • ${config.PREFIX}autorecording [on/off]
│  • ${config.PREFIX}setemojis [emoji list]
│  • ${config.PREFIX}togglebutton
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  📢 *CHANNEL COMMANDS*                              │
├────────────────────────────────────────────────────┤
│  • ${config.PREFIX}follow [url/jid]
│  • ${config.PREFIX}cinfo [channel link]
│  • ${config.PREFIX}listnewsletters
└────────────────────────────────────────────────────┘

${footer}
`.trim();

    const defaultImg = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';

    await socket.sendMessage(sender, {
      image: { url: defaultImg },
      caption: text,
      footer: footer,
      headerType: 4
    }, { quoted: myquoted });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

case 'ping': {
    const start = Date.now();
    const tempMsg = await socket.sendMessage(sender, { text: '```Pinging...```' });
    const end = Date.now();
    const ping = end - start;
    await socket.sendMessage(sender, {
        text: `*⚡ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏*\n*Speed: ${ping} ms*\n*Status: 🟢 Active*\n\n${footer}`,
        edit: tempMsg.key
    });
    break;
}

case 'alive': {
  try {
    const botName = '𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏';
    const logo = 'https://i.ibb.co/XfYqpkmm/be2de0bd1b96.jpg';

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `
╔════════════════════════════════╗
        ✨ 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏 ✨
              𝐈𝐒 𝐀𝐋𝐈𝐕𝐄
╚════════════════════════════════╝

┌────────────────────────────────┐
│  👑 *Owner:* JAMALI TECH EMPIRE
│  ⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│  ⚙️ *Platform:* ${process.env.PLATFORM || 'Heroku'}
│  📌 *Prefix:* ${config.PREFIX}
│  💎 *Version:* 1.0.0
│  🔘 *Button Mode:* ${config.BUTTON === 'true' ? '✅ ON' : '❌ OFF'}
└────────────────────────────────┘

${footer}
`;

    await socket.sendMessage(sender, {
      image: { url: logo },
      caption: text,
      footer: footer,
      headerType: 4
    }, { quoted: myquoted });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

case 'owner': {
    const ownerName = "𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐄𝐌𝐏𝐈𝐑𝐄";
    const ownerNumber = "255798172655";
    
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:${ownerName}
TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}
END:VCARD`;

    await socket.sendMessage(sender, {
        contacts: {
            displayName: ownerName,
            contacts: [{ vcard }]
        }
    }, { quoted: myquoted });

    const msgText = `
╔════════════════════════════════╗
        👑 *OWNER INFORMATION* 👑
╚════════════════════════════════╝

┌────────────────────────────────┐
│  👤 *Name:* ${ownerName}
│  📞 *WhatsApp:* wa.me/${ownerNumber}
│  💎 *Bot:* 𝐉𝐀𝐌𝐀𝐋𝐈 𝐓𝐄𝐂𝐇 𝐌𝐃 𝐕𝟏
└────────────────────────────────┘

${footer}`;

    await socket.sendMessage(sender, { text: msgText });
    break;
}

case 'jid': {
    try {
        let replyJid = '';
        let caption = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            replyJid = msg.message.extendedTextMessage.contextInfo.participant;
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

        caption = `
╔════════════════════════════════╗
           📍 *JID INFORMATION* 📍
╚════════════════════════════════╝

┌────────────────────────────────┐
│  💬 *Chat JID:* ${sender}
${replyJid ? `│  🔄 *Replied User:* ${replyJid}\n` : ''}${mentionedJid?.length ? `│  👥 *Mentioned:* ${mentionedJid.join(', ')}\n` : ''}${msg.key.remoteJid.endsWith('@g.us') ? `│  👥 *Group JID:* ${msg.key.remoteJid}\n` : ''}
└────────────────────────────────┘

📝 *Note:*
• User JID: number@s.whatsapp.net
• Group JID: number@g.us
• Channel JID: number@newsletter

${footer}`;

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: caption,
            contextInfo: {
                mentionedJid: mentionedJid || [],
                forwardingScore: 999,
                isForwarded: true
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ GetJID error:', error);
        await socket.sendMessage(sender, {
            text: '*Error:* Failed to get JID information'
        }, { quoted: myquoted });
    }
    break;
}

case 'settings': {
    const settingsText = `
╔════════════════════════════════╗
        ⚙️ *BOT SETTINGS* ⚙️
╚════════════════════════════════╝

┌────────────────────────────────┐
│  📌 *Current Configuration*
├────────────────────────────────┤
│  👁️ *Auto View Status:* ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│  ❤️ *Auto Like Status:* ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│  🎙️ *Auto Recording:* ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│  💎 *Like Emojis:* ${config.AUTO_LIKE_EMOJI.join(', ')}
│  🔘 *Button Mode:* ${config.BUTTON === 'true' ? '✅ ENABLED' : '❌ DISABLED'}
└────────────────────────────────┘

┌────────────────────────────────┐
│  🔧 *Change Settings*
├────────────────────────────────┤
│  • ${config.PREFIX}setprefix [new]
│  • ${config.PREFIX}autoview [on/off]
│  • ${config.PREFIX}autolike [on/off]
│  • ${config.PREFIX}autorecording [on/off]
│  • ${config.PREFIX}setemojis [💎 ✨ 👑]
│  • ${config.PREFIX}togglebutton
└────────────────────────────────┘

${footer}`;

    await socket.sendMessage(sender, {
        image: { url: logo },
        caption: settingsText
    }, { quoted: myquoted });
    break;
}

case 'count': {
    try {
        const activeCount = activeSockets.size;
        const pendingCount = pendingSaves.size;
        const healthyCount = Array.from(sessionHealth.values()).filter(h => h === 'active' || h === 'connected').length;
        const mongoSessionCount = await getMongoSessionCount();

        const uptimes = [];
        activeSockets.forEach((socket, number) => {
            const startTime = socketCreationTime.get(number);
            if (startTime) {
                const uptime = Date.now() - startTime;
                uptimes.push({
                    number,
                    uptime: Math.floor(uptime / 1000)
                });
            }
        });

        uptimes.sort((a, b) => b.uptime - a.uptime);
        const uptimeList = uptimes.slice(0, 5).map((u, i) => {
            const hours = Math.floor(u.uptime / 3600);
            const minutes = Math.floor((u.uptime % 3600) / 60);
            return `${i + 1}. ${u.number} - ${hours}h ${minutes}m`;
        }).join('\n');

        const countText = `
╔════════════════════════════════╗
        📊 *SESSION STATISTICS* 📊
╚════════════════════════════════╝

┌────────────────────────────────┐
│  🟢 *Active Sessions:* ${activeCount}
│  ✅ *Healthy:* ${healthyCount}
│  💾 *Pending Saves:* ${pendingCount}
│  ☁️ *MongoDB:* ${mongoSessionCount}
│  🔌 *MongoDB Status:* ${mongoConnected ? '✅ Connected' : '❌ Not Connected'}
└────────────────────────────────┘

┌────────────────────────────────┐
│  ⏱️ *Top 5 Running Sessions*
├────────────────────────────────┤
${uptimeList || '  No sessions running'}
└────────────────────────────────┘

📅 *Report:* ${getSriLankaTimestamp()}

${footer}`;

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: countText
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Count error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to get session count*'
        }, { quoted: myquoted });
    }
    break;
}

case 'save': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please reply to a status message to save*\n\n📌 Usage: Reply to any status with .save'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } });

        const userJid = jidNormalizedUser(socket.user.id);

        if (quotedMsg.imageMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.imageMessage, 'image');
            await socket.sendMessage(sender, {
                image: buffer,
                caption: `✨ *STATUS SAVED* ✨\n\n${quotedMsg.imageMessage.caption || ''}\n\n${footer}`
            });
        } else if (quotedMsg.videoMessage) {
            const buffer = await downloadAndSaveMedia(quotedMsg.videoMessage, 'video');
            await socket.sendMessage(sender, {
                video: buffer,
                caption: `✨ *STATUS SAVED* ✨\n\n${quotedMsg.videoMessage.caption || ''}\n\n${footer}`
            });
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
            const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
            await socket.sendMessage(sender, {
                text: `✨ *STATUS SAVED* ✨\n\n${text}\n\n${footer}`
            });
        } else {
            await socket.sendMessage(sender, quotedMsg);
        }

        await socket.sendMessage(sender, {
            text: '✅ *Status saved successfully!*'
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ Save error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to save status*'
        }, { quoted: myquoted });
    }
    break;
}

case 'vv':
case 'viewonce': {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            return await socket.sendMessage(sender, {
                text: '❌ *Please reply to a ViewOnce message!*\n\n📌 Usage: Reply to a viewonce message with .vv'
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        let mediaData = null;
        let mediaType = null;
        let caption = '';

        if (quotedMsg.imageMessage?.viewOnce) {
            mediaData = quotedMsg.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.videoMessage?.viewOnce) {
            mediaData = quotedMsg.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessage?.message?.imageMessage) {
            mediaData = quotedMsg.viewOnceMessage.message.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessage?.message?.videoMessage) {
            mediaData = quotedMsg.viewOnceMessage.message.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessageV2?.message?.imageMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.imageMessage;
            mediaType = 'image';
            caption = mediaData.caption || '';
        } else if (quotedMsg.viewOnceMessageV2?.message?.videoMessage) {
            mediaData = quotedMsg.viewOnceMessageV2.message.videoMessage;
            mediaType = 'video';
            caption = mediaData.caption || '';
        } else {
            return await socket.sendMessage(sender, {
                text: '❌ *This is not a ViewOnce message or it has already been viewed!*'
            }, { quoted: myquoted });
        }

        if (mediaData && mediaType) {
            await socket.sendMessage(sender, {
                text: '⏳ *Retrieving ViewOnce media...*'
            }, { quoted: myquoted });

            const buffer = await downloadAndSaveMedia(mediaData, mediaType);

            const messageContent = `✨ *VIEWONCE ${mediaType.toUpperCase()} RETRIEVED* ✨\n\n${caption ? `📝 Caption: ${caption}\n\n` : ''}${footer}`;

            if (mediaType === 'image') {
                await socket.sendMessage(sender, {
                    image: buffer,
                    caption: messageContent
                }, { quoted: myquoted });
            } else if (mediaType === 'video') {
                await socket.sendMessage(sender, {
                    video: buffer,
                    caption: messageContent
                }, { quoted: myquoted });
            }

            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

    } catch (error) {
        console.error('ViewOnce Error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to retrieve ViewOnce*\n\nError: ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}

case 'getdp': {
    try {
        let targetJid;
        let profileName = "User";

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
            profileName = "Replied User";
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            profileName = "Mentioned User";
        }
        else {
            targetJid = sender;
            profileName = "Your";
        }

        const ppUrl = await socket.profilePictureUrl(targetJid, 'image').catch(() => null);

        if (!ppUrl) {
            return await socket.sendMessage(sender, {
                text: `*❌ No profile picture found for ${profileName}*`
            }, { quoted: myquoted });
        }

        await socket.sendMessage(sender, {
            image: { url: ppUrl },
            caption: `✨ *PROFILE PICTURE* ✨\n\n👤 *${profileName}*\n📱 *JID:* ${targetJid}\n\n${footer}`
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ GetDP error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to get profile picture*'
        }, { quoted: myquoted });
    }
    break;
}

case 'wame': {
    try {
        let targetNumber = '';
        let customText = '';

        if (msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
            customText = args.join(' ');
        }
        else if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetNumber = msg.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
            customText = args.join(' ');
        }
        else if (args[0]) {
            targetNumber = args[0].replace(/[^0-9]/g, '');
            customText = args.slice(1).join(' ');
        }
        else {
            targetNumber = sender.split('@')[0];
            customText = args.join(' ');
        }

        let waLink = `https://wa.me/${targetNumber}`;
        if (customText) {
            waLink += `?text=${encodeURIComponent(customText)}`;
        }

        await socket.sendMessage(sender, {
            image: { url: logo },
            caption: `✨ *WHATSAPP LINK GENERATED* ✨\n\n📱 *Number:* ${targetNumber}\n🔗 *Link:* ${waLink}\n${customText ? `💬 *Message:* ${customText}` : ''}\n\n${footer}`,
            contextInfo: {
                externalAdReply: {
                    title: `Chat with ${targetNumber}`,
                    body: "Click to open WhatsApp chat",
                    thumbnailUrl: logo,
                    sourceUrl: waLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

    } catch (error) {
        console.error('❌ WAME error:', error);
        await socket.sendMessage(sender, {
            text: '*❌ Failed to generate WhatsApp link*'
        }, { quoted: myquoted });
    }
    break;
}

case 'yts': {
    try {
        if (!args[0]) {
            return await socket.sendMessage(sender, {
                text: '*❌ Please provide a search query*\n\n📌 Usage: .yts <song/video name>'
            }, { quoted: myquoted });
        }

        const query = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const searchResults = await yts(query);

        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
            return await socket.sendMessage(sender, {
                text: `*❌ No results found for:* ${query}`
            }, { quoted: myquoted });
        }

        const videos = searchResults.videos.slice(0, 5);

        let resultText = `
╔════════════════════════════════╗
        🔍 *YOUTUBE SEARCH* 🔍
╚════════════════════════════════╝

📌 *Query:* ${query}
📊 *Found:* ${searchResults.videos.length} videos

`;

        videos.forEach((video, index) => {
            resultText += `
┌────────────────────────────────┐
│  🎬 *${index + 1}. ${video.title.substring(0, 50)}*
├────────────────────────────────┤
│  ⏱️ Duration: ${video.timestamp}
│  👀 Views: ${video.views ? video.views.toLocaleString() : 'N/A'}
│  📅 Uploaded: ${video.ago}
│  📺 Channel: ${video.author.name}
│  🔗 Link: ${video.url}
└────────────────────────────────┘
`;
        });

        resultText += `\n${footer}`;

        await socket.sendMessage(sender, {
            text: resultText,
            contextInfo: {
                externalAdReply: {
                    title: videos[0].title,
                    body: `${videos[0].author.name} • ${videos[0].timestamp}`,
                    thumbnailUrl: videos[0].thumbnail,
                    sourceUrl: videos[0].url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: myquoted });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('❌ YouTube search error:', error);
        await socket.sendMessage(sender, {
            text: `*❌ Search failed*\n*Error:* ${error.message}`
        }, { quoted: myquoted });
    }
    break;
}
