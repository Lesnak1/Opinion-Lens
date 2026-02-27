const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/philo/Opi/app.opinion.trade.har'));
const m = d.log.entries.filter(e => e.request.url.includes('market') && e.request.method === 'GET');
m.slice(0, 5).forEach(e => {
    console.log("-------------------");
    console.log('URL:', e.request.url);
    console.log('Headers:', JSON.stringify(e.request.headers.filter(h => ['apikey', 'authorization', 'cookie'].includes(h.name.toLowerCase()))));
});
