const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/philo/Opi/app.opinion.trade.har'));
const m = d.log.entries.filter(e => {
    if (!e.response || !e.response.content || !e.response.content.text) return false;
    const text = e.response.content.text;
    return text.includes('"list":[') && text.includes('"title":');
});
const out = new Set(m.map(e => e.request.url.split('?')[0]));
fs.writeFileSync('C:/Users/philo/Opi/opinion-lens/har-urls.txt', Array.from(out).join('\n'));
