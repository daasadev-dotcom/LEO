const emojis = require('./emojis');

const parseEmoji = (str) => {
    if (!str) return null;
    const match = str.trim().match(/^<(a)?:(\w+):(\d+)>$/);
    if (!match) return null;
    return { animated: !!match[1], name: match[2], id: match[3] };
};

function appName(key) {
    return ('ax_' + key).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setupApplicationEmojis(client) {
    try {
        const emojiEntries = Object.entries(emojis).filter(([, v]) => parseEmoji(v));

        const existing = await client.application.emojis.fetch();
        const existingByName = new Map(existing.map(e => [e.name, e]));

        let registered = 0;
        let skipped = 0;
        let failed = 0;

        for (const [key, emojiStr] of emojiEntries) {
            const parsed = parseEmoji(emojiStr);
            if (!parsed) continue;

            const name = appName(key);
            if (existingByName.has(name)) {
                skipped++;
                continue;
            }

            const ext = parsed.animated ? 'gif' : 'webp';
            const url = `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}?size=64&quality=lossless`;
            try {
                const created = await client.application.emojis.create({ name, attachment: url });
                existingByName.set(name, created);
                registered++;
                await sleep(300);
            } catch (e) {
                console.warn(`[AppEmoji] Failed ${name}: ${e.message}`);
                failed++;
            }
        }

        const refreshed = await client.application.emojis.fetch();
        const byName = new Map(refreshed.map(e => [e.name, e]));

        for (const [key] of emojiEntries) {
            const name = appName(key);
            const appEmoji = byName.get(name);
            if (!appEmoji) continue;
            const prefix = appEmoji.animated ? '<a:' : '<:';
            emojis[key] = `${prefix}${appEmoji.name}:${appEmoji.id}>`;
        }

        console.log(`[AppEmoji] Done — registered: ${registered}, skipped: ${skipped}, failed: ${failed}`);
    } catch (e) {
        console.warn(`[AppEmoji] Setup failed: ${e.message}`);
    }
}

module.exports = setupApplicationEmojis;
