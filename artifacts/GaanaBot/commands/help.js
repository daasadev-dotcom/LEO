const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder, MessageFlags, ComponentType
} = require('discord.js');
const emojis = require('../utils/emojis');

const parseEmoji = (str) => {
    if (!str) return null;
    const match = str.trim().match(/^<(a)?:(\w+):(\d+)>$/);
    if (!match) return null;
    return { animated: !!match[1], name: match[2], id: match[3] };
};

const COMMANDS_PER_PAGE = 10;

const CATEGORIES = [
    {
        id: 'music',
        label: 'Music Playback',
        emoji: emojis.music,
        commands: [
            { name: 'play',        description: 'Play a song or playlist' },
            { name: 'pause',       description: 'Pause the current song' },
            { name: 'resume',      description: 'Resume the paused song' },
            { name: 'stop',        description: 'Stop music and clear the queue' },
            { name: 'skip',        description: 'Skip the current song' },
            { name: 'back',        description: 'Play the previous song' },
            { name: 'backward',    description: 'Skip backward in the current song' },
            { name: 'forward',     description: 'Skip forward in the current song' },
            { name: 'seek',        description: 'Seek to a specific time in the current song' },
            { name: 'loop',        description: 'Set repeat mode' },
            { name: 'shuffle',     description: 'Shuffle the queue order' },
            { name: 'volume',      description: 'Set music volume' },
            { name: 'nowplaying',  description: 'Show the currently playing song' },
            { name: 'disconnect',  description: 'Disconnect the bot from the voice channel' },
            { name: 'autoplay',    description: 'Enable or disable autoplay' },
            { name: '247',         description: 'Keep the bot connected to a voice channel 24/7' },
        ],
    },
    {
        id: 'queue',
        label: 'Queue',
        emoji: emojis.queue,
        commands: [
            { name: 'queue',  description: 'Show the current song queue' },
            { name: 'remove', description: 'Remove a song from the queue' },
            { name: 'move',   description: 'Move a track to a different position in the queue' },
            { name: 'clear',  description: 'Clear the current queue' },
        ],
    },
    {
        id: 'filters',
        label: 'Filters',
        emoji: emojis.filter,
        commands: [
            { name: 'filter', description: 'Choose and apply an audio filter (equalizer)' },
        ],
    },
    {
        id: 'lyrics',
        label: 'Lyrics',
        emoji: emojis.lyrics,
        commands: [
            { name: 'lyrics', description: 'Show the lyrics of the currently playing song' },
        ],
    },
    {
        id: 'favorites',
        label: 'Favorites',
        emoji: emojis.favorite,
        commands: [
            { name: 'favoriteadd',    description: 'Add a song to your favorites' },
            { name: 'favoritelist',   description: 'Show your favorite songs' },
            { name: 'favoriteplay',   description: 'Play all songs from your favorites' },
            { name: 'favoriteremove', description: 'Remove a song from your favorites' },
        ],
    },
    {
        id: 'playlists',
        label: 'Playlists',
        emoji: emojis.playlist,
        commands: [
            { name: 'playlistcreate',      description: 'Create a new empty playlist' },
            { name: 'playlistdelete',      description: 'Delete one of your playlists' },
            { name: 'playlistimport',      description: 'Import a playlist from a share code or Spotify URL' },
            { name: 'playlistlist',        description: 'Show all of your saved playlists' },
            { name: 'playlistload',        description: 'Clear the queue and load a playlist' },
            { name: 'playlistrename',      description: 'Rename one of your playlists' },
            { name: 'playlistsave',        description: 'Save the current queue as a playlist' },
            { name: 'playlistshare',       description: 'Share a playlist with others' },
            { name: 'playlisttrackadd',    description: 'Add a single song to one of your playlists' },
            { name: 'playlisttracklist',   description: 'Show the list of tracks in a playlist' },
            { name: 'playlisttrackremove', description: 'Remove a track from one of your playlists' },
            { name: 'playlistappend',      description: 'Add songs from a playlist to the current queue' },
        ],
    },
    {
        id: 'general',
        label: 'General',
        emoji: emojis.info,
        commands: [
            { name: 'help',   description: 'Browse all available commands' },
            { name: 'ping',   description: 'Check the bot\'s latency' },
            { name: 'stats',  description: 'View bot statistics' },
            { name: 'prefix', description: 'View or set the bot prefix for this server' },
        ],
    },
];

const TOTAL_COMMANDS = CATEGORIES.reduce((sum, c) => sum + c.commands.length, 0);

// ─── builders ──────────────────────────────────────────────────────────────────

function buildCategorySelect() {
    const select = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Select a category to view commands');

    for (const cat of CATEGORIES) {
        const option = new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setValue(cat.id)
            .setDescription(`${cat.commands.length} command${cat.commands.length !== 1 ? 's' : ''}`);
        const parsed = parseEmoji(cat.emoji);
        if (parsed) option.setEmoji(parsed);
        select.addOptions(option);
    }

    return new ActionRowBuilder().addComponents(select);
}

function buildNavRow(categoryId, page, maxPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('Home')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`help_prev:${categoryId}:${page}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`help_next:${categoryId}:${page}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= maxPages - 1)
    );
}

function buildHomeContainer(client) {
    const avatarUrl = client.user.displayAvatarURL({ extension: 'png', size: 256 });
    const botName = client.user.username;

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${botName} - Help\n` +
                `Welcome to the command center! Use the dropdown below to browse commands.\n` +
                `-# ${CATEGORIES.length} categories  •  ${TOTAL_COMMANDS} commands available`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

    return new ContainerBuilder()
        .addSectionComponents(section)
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# Select a category from the dropdown to view its commands')
        )
        .addActionRowComponents(buildCategorySelect());
}

function buildCategoryContainer(categoryId, page) {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return null;

    const maxPages = Math.ceil(cat.commands.length / COMMANDS_PER_PAGE);
    const start = page * COMMANDS_PER_PAGE;
    const pageCommands = cat.commands.slice(start, start + COMMANDS_PER_PAGE);

    const commandList = pageCommands
        .map(cmd => `› \`${cmd.name}\` - ${cmd.description}`)
        .join('\n');

    const pageInfo = maxPages > 1 ? `\n-# Page ${page + 1} of ${maxPages}` : '';

    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${cat.emoji} ${cat.label} Commands`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(commandList + pageInfo)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# Use the buttons below to navigate')
        )
        .addActionRowComponents(buildCategorySelect())
        .addActionRowComponents(buildNavRow(categoryId, page, maxPages));
}

// ─── command ───────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse all available commands'),

    async execute(interaction) {
        const { client } = interaction;

        const msg = await interaction.reply({
            components: [buildHomeContainer(client)],
            fetchReply: true,
            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
        });

        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 10 * 60 * 1000, // 10 minutes
        });

        collector.on('collect', async (i) => {
            let newContainer = null;

            if (i.customId === 'help_category_select') {
                newContainer = buildCategoryContainer(i.values[0], 0);
            } else if (i.customId === 'help_home') {
                newContainer = buildHomeContainer(client);
            } else if (i.customId.startsWith('help_prev:')) {
                const [, catId, pageStr] = i.customId.split(':');
                const newPage = Math.max(0, parseInt(pageStr, 10) - 1);
                newContainer = buildCategoryContainer(catId, newPage);
            } else if (i.customId.startsWith('help_next:')) {
                const [, catId, pageStr] = i.customId.split(':');
                const cat = CATEGORIES.find(c => c.id === catId);
                const maxPages = Math.ceil(cat.commands.length / COMMANDS_PER_PAGE);
                const newPage = Math.min(maxPages - 1, parseInt(pageStr, 10) + 1);
                newContainer = buildCategoryContainer(catId, newPage);
            }

            if (newContainer) {
                await i.update({
                    components: [newContainer],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                });
            }
        });
    },
};

/*
: ! Aegis !
    + Discord: itsfizys
    + Portfolio: https://itsfiizys.com
    + Community: https://discord.gg/8wfT8SfB5Z  (AeroX Development )
    + for any queries reach out Community or DM me.
*/
