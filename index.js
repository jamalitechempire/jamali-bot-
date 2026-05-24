// ==================== API Routes - Pairing (IMEREKEBISHWA) ====================
app.get('/api/pair', async (req, res) => {
    const { number } = req.query;
    console.log(`📱 Pairing request for number: ${number}`);
    
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`🔍 Sanitized number: ${sanitizedNumber}`);
    
    // Check if already connected
    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.json({ 
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'Already connected' : 'Session is reconnecting'
        });
    }
    
    // Check if already generating
    if (restoringNumbers.has(sanitizedNumber)) {
        return res.json({ 
            status: 'generating', 
            message: 'Pairing code is being generated, please wait...' 
        });
    }
    
    try {
        restoringNumbers.add(sanitizedNumber);
        
        // Create session directory
        const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        
        // Load auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        // Create socket connection
        const socket = makeWASocket({
            auth: { 
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) 
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["JAMALI TECH", "Chrome", "120.0.0"],
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 30000
        });
        
        // Handle connection update
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ Connection opened for ${sanitizedNumber}`);
                sessionHealth.set(sanitizedNumber, 'active');
                sessionConnectionStatus.set(sanitizedNumber, 'open');
                activeSockets.set(sanitizedNumber, socket);
                socketCreationTime.set(sanitizedNumber, Date.now());
                restoringNumbers.delete(sanitizedNumber);
                
                // Send welcome message
                const welcomeMsg = `╔════════════════════════════════════════╗
║         JAMALI TECH MD CONNECTED        ║
╚════════════════════════════════════════╝

┌────────────────────────────────────────┐
│  ✅ Bot connected successfully!
│  📞 Number: ${sanitizedNumber}
│  👑 Owner: JAMALI TECH EMPIRE
│  💎 Version: ${config.BOT_VERSION}
│  
│  📌 Try these commands:
│  • ${config.PREFIX}menu - Show all commands
│  • ${config.PREFIX}alive - Check bot status
│  • ${config.PREFIX}ping - Check speed
└────────────────────────────────────────┘

${footer}`;
                
                await socket.sendMessage(jidNormalizedUser(socket.user.id), { 
                    image: { url: botLogo }, 
                    caption: welcomeMsg 
                });
                
                // Save session to MongoDB
                const credData = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
                await saveSessionToMongoDB(sanitizedNumber, credData);
                
            } else if (connection === 'close') {
                console.log(`❌ Connection closed for ${sanitizedNumber}`);
                sessionHealth.set(sanitizedNumber, 'disconnected');
                sessionConnectionStatus.set(sanitizedNumber, 'closed');
                disconnectionTime.set(sanitizedNumber, Date.now());
                activeSockets.delete(sanitizedNumber);
                restoringNumbers.delete(sanitizedNumber);
            }
        });
        
        // Handle credentials update
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            console.log(`💾 Credentials saved for ${sanitizedNumber}`);
            
            if (isSessionActive(sanitizedNumber)) {
                const credData = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
                await saveSessionToMongoDB(sanitizedNumber, credData);
            }
        });
        
        // Generate pairing code if not registered
        if (!socket.authState.creds.registered) {
            try {
                await delay(1000);
                const code = await socket.requestPairingCode(sanitizedNumber, config.PAIRING_CODE_NAME);
                console.log(`✅ PAIRING CODE FOR ${sanitizedNumber}: ${code}`);
                
                if (!res.headersSent) {
                    return res.json({ 
                        code: code, 
                        status: 'success',
                        message: 'Pairing code generated successfully'
                    });
                }
            } catch (pairingError) {
                console.error(`❌ Pairing code error:`, pairingError.message);
                restoringNumbers.delete(sanitizedNumber);
                if (!res.headersSent) {
                    return res.status(500).json({ 
                        error: pairingError.message,
                        status: 'error'
                    });
                }
            }
        } else {
            restoringNumbers.delete(sanitizedNumber);
            if (!res.headersSent) {
                return res.json({ 
                    status: 'already_connected',
                    message: 'Device already connected'
                });
            }
        }
        
    } catch (error) {
        console.error(`❌ EmpirePair error:`, error);
        restoringNumbers.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: error.message || 'Failed to generate pairing code',
                status: 'error'
            });
        }
    }
});
