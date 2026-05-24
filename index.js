// API Routes - Pairing
app.get('/api/pair', async (req, res) => {
    const { number } = req.query;
    console.log(`📱 Pairing request for number: ${number}`);
    
    if (!number) {
        return res.status(400).json({ error: 'Number parameter is required' });
    }
    
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(`🔍 Sanitized number: ${sanitizedNumber}`);
    
    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).json({ 
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'Already connected' : 'Session is reconnecting'
        });
    }
    
    try {
        await EmpirePair(sanitizedNumber, res);
    } catch (error) {
        console.error('❌ Pairing error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
        }
    }
});
