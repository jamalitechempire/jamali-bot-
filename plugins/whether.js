module.exports = {
    command: 'weather',   // au array: ['weather', 'climate']
    description: 'Get weather info',
    usage: '.weather <city>',
    category: 'Utility',
    async execute(sock, msg, args, sender, prefix, { axios, config, footer }) {
        // Logic yako hapa
        if (!args[0]) return sock.sendMessage(...);
        // ... implement
    }
};
