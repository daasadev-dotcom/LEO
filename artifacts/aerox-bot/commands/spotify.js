const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const emojis = require('../utils/emojis');
const SpotifyProfile = require('../database/models/SpotifyProfile');
const { getSpotifyUser, getSpotifyPlaylists, extractSpotifyUserId } = require('../helpers/spotifyHelper');

const SPOTIFY_GREEN = 0x1DB954;

function hasSpotifyCredentials() {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify profile integration')
        .addSubcommand(sub =>
            sub.setName('login')
                .setDescription('Link your Spotify profile')
                .addStringOption(opt =>
                    opt.setName('url')
                        .setDescription('Your Spotify profile URL (open.spotify.com/user/...)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('profile')
                .setDescription('View your linked Spotify profile')
        )
        .addSubcommand(sub =>
            sub.setName('playlists')
                .setDescription('Browse your public Spotify playlists')
        )
        .addSubcommand(sub =>
            sub.setName('logout')
                .setDescription('Disconnect your Spotify profile')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (!hasSpotifyCredentials()) {
            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${emojis.error} Spotify integration is not configured.\nAsk the bot owner to set \`SPOTIFY_CLIENT_ID\` and \`SPOTIFY_CLIENT_SECRET\` in the environment.`
                )
            );
            return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
        }

        if (sub === 'login') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const url = interaction.options.getString('url');
            const spotifyUserId = extractSpotifyUserId(url);

            if (!spotifyUserId) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emojis.error} Invalid Spotify URL.\nUse your profile URL: \`https://open.spotify.com/user/your_username\``
                    )
                );
                return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }

            let userData;
            try {
                userData = await getSpotifyUser(spotifyUserId);
            } catch (err) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Could not find that Spotify profile. Make sure the URL is correct.`)
                );
                return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }

            const imageUrl = userData.images?.[0]?.url ?? null;
            await SpotifyProfile.upsert({
                userId: interaction.user.id,
                spotifyUserId: userData.id,
                displayName: userData.display_name || userData.id,
                imageUrl,
                profileUrl: userData.external_urls?.spotify ?? url,
                followersCount: userData.followers?.total ?? 0,
            });

            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${emojis.success} Spotify profile linked!\n**${userData.display_name || userData.id}** • ${userData.followers?.total ?? 0} followers`
                )
            );
            return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        }

        if (sub === 'profile') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const record = await SpotifyProfile.findOne({ where: { userId: interaction.user.id } });

            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **No Spotify Linked**\nYou don't have a Spotify profile connected.\nUse \`/spotify login\` to link your profile.`
                    )
                );
                return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }

            let userData;
            try {
                userData = await getSpotifyUser(record.spotifyUserId);
            } catch {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Could not fetch your Spotify profile right now. Try again later.`)
                );
                return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }

            const playlistData = await getSpotifyPlaylists(record.spotifyUserId, 1, 0).catch(() => null);
            const playlistCount = playlistData?.total ?? 0;
            const displayName = userData.display_name || record.displayName;
            const avatarUrl = userData.images?.[0]?.url;

            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View Playlists')
                    .setEmoji('🎵')
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId('spotify_view_playlists'),
                new ButtonBuilder()
                    .setLabel('Open Spotify')
                    .setEmoji('↗️')
                    .setStyle(ButtonStyle.Link)
                    .setURL(record.profileUrl),
                new ButtonBuilder()
                    .setLabel('Disconnect')
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId('spotify_disconnect')
            );

            let container = new ContainerBuilder();
            if (avatarUrl) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `## 🎵 Spotify Profile\n**${displayName}**\n${playlistCount} public playlists`
                            )
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
                );
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🎵 Spotify Profile\n**${displayName}**\n${playlistCount} public playlists`
                    )
                );
            }

            container
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(buttonRow);

            const msg = await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 60_000 });
            collector.on('collect', async (i) => {
                if (i.customId === 'spotify_disconnect') {
                    await SpotifyProfile.destroy({ where: { userId: interaction.user.id } });
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.success} Spotify profile disconnected.`)
                    );
                    await i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                    collector.stop();
                } else if (i.customId === 'spotify_view_playlists') {
                    await showPlaylists(i, record, 0);
                }
            });
            return;
        }

        if (sub === 'playlists') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const record = await SpotifyProfile.findOne({ where: { userId: interaction.user.id } });
            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} No Spotify linked. Use \`/spotify login\` first.`)
                );
                return interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }
            return showPlaylistsDeferred(interaction, record, 0);
        }

        if (sub === 'logout') {
            const deleted = await SpotifyProfile.destroy({ where: { userId: interaction.user.id } });
            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    deleted
                        ? `${emojis.success} Spotify profile disconnected successfully.`
                        : `${emojis.error} You don't have a Spotify profile linked.`
                )
            );
            return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
        }
    },
};

async function buildPlaylistContainer(record, offset) {
    const PAGE = 8;
    const data = await getSpotifyPlaylists(record.spotifyUserId, PAGE, offset);
    const playlists = data.items ?? [];
    const total = data.total ?? 0;
    const page = Math.floor(offset / PAGE) + 1;
    const totalPages = Math.ceil(total / PAGE);

    if (playlists.length === 0) {
        const c = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`ℹ️ No public playlists found.`)
        );
        return { container: c, total, offset, page, totalPages };
    }

    const lines = playlists.map((pl, idx) => {
        const trackCount = pl.tracks?.total ?? 0;
        return `**${offset + idx + 1}.** [${pl.name}](${pl.external_urls?.spotify ?? '#'}) • ${trackCount} tracks`;
    });

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🎵 Playlists — Page ${page}/${totalPages}\n${lines.join('\n')}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('spl_prev')
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(offset === 0),
                new ButtonBuilder()
                    .setCustomId('spl_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(offset + PAGE >= total)
            )
        );

    return { container, total, offset, page, totalPages, PAGE };
}

async function showPlaylists(interaction, record, offset) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const { container, PAGE, total } = await buildPlaylistContainer(record, offset).catch(async () => {
        const c = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${emojis.error} Could not fetch playlists right now.`)
        );
        await interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        return null;
    });
    if (!container) return;

    const msg = await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    let currentOffset = offset;

    const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 120_000 });
    col.on('collect', async (i) => {
        await i.deferUpdate();
        if (i.customId === 'spl_prev') currentOffset = Math.max(0, currentOffset - PAGE);
        if (i.customId === 'spl_next') currentOffset = currentOffset + PAGE;
        const { container: newC } = await buildPlaylistContainer(record, currentOffset);
        await interaction.editReply({ components: [newC], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    });
}

async function showPlaylistsDeferred(interaction, record, offset) {
    const { container, PAGE, total } = await buildPlaylistContainer(record, offset).catch(async () => {
        const c = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${emojis.error} Could not fetch playlists right now.`)
        );
        await interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
        return {};
    });
    if (!container) return;

    const msg = await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    let currentOffset = offset;

    const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 120_000 });
    col.on('collect', async (i) => {
        await i.deferUpdate();
        if (i.customId === 'spl_prev') currentOffset = Math.max(0, currentOffset - (PAGE || 8));
        if (i.customId === 'spl_next') currentOffset = currentOffset + (PAGE || 8);
        const { container: newC } = await buildPlaylistContainer(record, currentOffset);
        await interaction.editReply({ components: [newC], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
    });
}
