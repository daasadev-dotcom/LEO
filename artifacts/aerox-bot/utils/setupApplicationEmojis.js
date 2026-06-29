const emojis = require('./emojis');

const parseEmoji = (str) => {
    if (!str) return null;
    const match = str.trim().match(/^<(a)?:(\w+):(\d+)>$/);
    if (!match) return null;
    return { animated: !!match[1], name: match[2], id: match[3] };
};

const FILTER_EMOJI_KEYS = [
    'filter', 'nightcore', 'vaporwave', 'bassboost',
    'eightD', 'karaoke', 'vibrato', 'tremolo',
    'slowed', 'distortion', 'pop', 'soft',
];

function appEmojiName(key) {
    return `ax_${key.toLowerCase()}`;
}

async function setupApplicationEmojis(client) {
    try {
        const existing = await client.application.emojis.fetch();

        for (const key of FILTER_EMOJI_KEYS) {
            const parsed = parseEmoji(emojis[key]);
            if (!parsed) continue;

            const targetName = appEmojiName(key);
            const found = existing.find(e => e.name === targetName);

            if (!found) {
                const ext = parsed.animated ? 'gif' : 'png';
                const url = `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}`;
                try {
                    await client.application.emojis.create({ name: targetName, attachment: url });
                    console.log(`[AppEmoji] Registered: ${targetName}`);
                } catch (e) {
                    console.warn(`[AppEmoji] Failed to register ${targetName}: ${e.message}`);
                }
            }
        }

        const refreshed = await client.application.emojis.fetch();
        client.appEmojiMap = new Map();
        for (const key of FILTER_EMOJI_KEYS) {
            const targetName = appEmojiName(key);
            const appEmoji = refreshed.find(e => e.name === targetName);
            if (appEmoji) {
                client.appEmojiMap.set(key, {
                    id: appEmoji.id,
                    name: appEmoji.name,
                    animated: appEmoji.animated ?? false,
                });
            }
        }

        console.log(`[AppEmoji] Setup complete (${client.appEmojiMap.size}/${FILTER_EMOJI_KEYS.length} emojis ready)`);
    } catch (e) {
        console.warn(`[AppEmoji] Setup skipped: ${e.message}`);
        client.appEmojiMap = new Map();
    }
}

module.exports = setupApplicationEmojis;
