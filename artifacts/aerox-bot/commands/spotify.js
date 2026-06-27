const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const emojis = require('../utils/emojis');
const SpotifyProfile = require('../database/models/SpotifyProfile');
const { getSpotifyUser, getSpotifyPlaylists, extractSpotifyUserId } = require('../helpers/spotifyHelper');

const PAGE = 8;

function hasSpotifyCredentials() {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function noCredsContainer() {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${emojis.error} Spotify integration is not configured.\nAsk the bot owner to set \`SPOTIFY_CLIENT_ID\` and \`SPOTIFY_CLIENT_SECRET\`.`
        )
    );
}

function buildProfileContainer(record, playlistCount) {
    const info = `## 🎵 Spotify Profile\n**${record.displayName}**\n${playlistCount} public playlist${playlistCount !== 1 ? 's' : ''}`;
    const container = new ContainerBuilder();

    if (record.imageUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(record.imageUrl))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sp_view_playlists')
                    .setLabel('View Playlists')
                    .setEmoji('🎵')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setLabel('Open Spotify')
                    .setEmoji('↗️')
                    .setStyle(ButtonStyle.Link)
                    .setURL(record.profileUrl)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sp_disconnect')
                    .setLabel('Disconnect')
                    .setStyle(ButtonStyle.Danger)
            )
        );

    return container;
}

async function fetchAndBuildPlaylistsContainer(record, offset) {
    const data = await getSpotifyPlaylists(record.spotifyUserId, PAGE, offset);
    const playlists = (data.items ?? []).filter(Boolean);
    const total = data.total ?? 0;

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🎵 ${record.displayName}'s Playlists\n${total} playlist${total !== 1 ? 's' : ''}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (playlists.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No public playlists found.'));
    } else {
        for (let i = 0; i < playlists.length; i++) {
            const pl = playlists[i];
            const imgUrl = pl.images?.[0]?.url;
            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${offset + i + 1}.** ${pl.name}`)
            );
            if (imgUrl) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(imgUrl));
            container.addSectionComponents(section);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        }
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('sp_select_playlist')
        .setPlaceholder('Select a playlist');

    for (let i = 0; i < playlists.length; i++) {
        selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(playlists[i].name.slice(0, 100))
                .setValue(String(i))
        );
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sp_back_to_profile')
                    .setLabel('Back to Profile')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return { container, playlists, total, offset };
}

function buildPlaylistDetailContainer(pl, ownerName) {
    const imgUrl = pl.images?.[0]?.url;
    const trackCount = pl.tracks?.total ?? 0;
    const info = `## ${pl.name}\nby ${ownerName}`;
    const container = new ContainerBuilder();

    if (imgUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(imgUrl))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sp_play')
                    .setLabel(' ')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('sp_shuffle')
                    .setLabel(' ')
                    .setEmoji('🔀')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setLabel('Open')
                    .setEmoji('↗️')
                    .setStyle(ButtonStyle.Link)
                    .setURL(pl.external_urls?.spotify ?? 'https://open.spotify.com'),
                new ButtonBuilder()
                    .setCustomId('sp_back_to_list')
                    .setLabel('Back to List')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return container;
}

function buildDisconnectConfirmContainer() {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`🎵 **Disconnect Spotify**\nAre you sure you want to unlink your Spotify profile?`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('sp_confirm_dc')
                    .setLabel('Disconnect')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('sp_cancel_dc')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
}

async function setupProfileSession(msg, record, userId, client) {
    let currentPlaylists = [];
    let currentOffset = 0;
    let currentPlaylist = null;

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 600_000,
    });

    collector.on('collect', async (i) => {
        try {
            if (i.customId === 'sp_view_playlists') {
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(record, 0);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.update({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_profile') {
                let count = 0;
                try {
                    const d = await getSpotifyPlaylists(record.spotifyUserId, 1, 0);
                    count = d.total ?? 0;
                } catch {}
                await i.update({ components: [buildProfileContainer(record, count)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_select_playlist') {
                const idx = parseInt(i.values[0], 10);
                const pl = currentPlaylists[idx];
                if (!pl) return i.deferUpdate();
                currentPlaylist = pl;
                await i.update({ components: [buildPlaylistDetailContainer(pl, record.displayName)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_list') {
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(record, currentOffset);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.update({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_play' || i.customId === 'sp_shuffle') {
                if (!currentPlaylist) return i.deferUpdate();
                const guild = client.guilds.cache.get(i.guildId);
                const member = guild?.members.cache.get(i.user.id);
                if (!member?.voice?.channelId) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} You need to be in a voice channel to play music!`)
                    );
                    return i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                }
                const player = client.poru.players.get(i.guildId);
                if (!player) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} No active player. Use \`/play\` to start music first!`)
                    );
                    return i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                }
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                try {
                    const result = await client.poru.resolve({
                        query: currentPlaylist.external_urls?.spotify ?? currentPlaylist.name,
                        source: 'spotify',
                        requester: i.user
                    });
                    if (!result || !result.tracks || result.tracks.length === 0) throw new Error('No tracks');
                    let tracks = result.tracks;
                    if (i.customId === 'sp_shuffle') {
                        for (let j = tracks.length - 1; j > 0; j--) {
                            const k = Math.floor(Math.random() * (j + 1));
                            [tracks[j], tracks[k]] = [tracks[k], tracks[j]];
                        }
                    }
                    for (const t of tracks) player.queue.add(t);
                    if (!player.currentTrack) player.play();
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `${emojis.success} Added **${tracks.length}** tracks from **${currentPlaylist.name}** to the queue${i.customId === 'sp_shuffle' ? ' (shuffled)' : ''}!`
                        )
                    );
                    await i.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                } catch {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Could not load this playlist. Your LavaLink may not have Spotify support.`)
                    );
                    await i.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }

            } else if (i.customId === 'sp_disconnect') {
                const confirmMsg = await i.reply({
                    components: [buildDisconnectConfirmContainer()],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    fetchReply: true,
                });
                const confirmCol = confirmMsg.createMessageComponentCollector({
                    filter: ci => ci.user.id === userId,
                    time: 60_000,
                    max: 1
                });
                confirmCol.on('collect', async (ci) => {
                    if (ci.customId === 'sp_confirm_dc') {
                        await SpotifyProfile.destroy({ where: { userId } });
                        const c = new ContainerBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ **Disconnected**\nYour Spotify profile has been unlinked`));
                        await ci.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                        collector.stop();
                    } else {
                        await ci.deferUpdate();
                    }
                });
            }
        } catch (err) {
            console.error('Spotify session error:', err);
            try { await i.deferUpdate(); } catch {}
        }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify profile integration')
        .addSubcommand(sub => sub.setName('login').setDescription('Connect your Spotify profile'))
        .addSubcommand(sub => sub.setName('profile').setDescription('View your linked Spotify profile'))
        .addSubcommand(sub => sub.setName('playlists').setDescription('Browse your public Spotify playlists'))
        .addSubcommand(sub => sub.setName('logout').setDescription('Disconnect your Spotify profile')),

    async execute(interaction) {
        const { user, client } = interaction;

        if (typeof interaction.options?.getSubcommand !== 'function') {
            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`🎵 Use the slash command \`/spotify login\`, \`/spotify profile\`, \`/spotify playlists\`, or \`/spotify logout\`.`)
            );
            return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (!hasSpotifyCredentials()) {
            return interaction.reply({
                components: [noCredsContainer()],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                ephemeral: true,
            });
        }

        if (sub === 'login') {
            const existing = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (existing) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **Already Connected**\nYou already have a Spotify profile linked. Use \`/spotify logout\` to disconnect first.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            const connectContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`🎵 **Connect Spotify**\nClick the button below to link your Spotify profile`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('sp_enter_url')
                            .setLabel('Enter Spotify URL')
                            .setEmoji('🎵')
                            .setStyle(ButtonStyle.Primary)
                    )
                );

            const msg = await interaction.reply({
                components: [connectContainer],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                fetchReply: true,
            });

            const btnCollector = msg.createMessageComponentCollector({
                filter: i => i.user.id === user.id && i.customId === 'sp_enter_url',
                time: 120_000,
                max: 1,
            });

            btnCollector.on('collect', async (btnInt) => {
                const modal = new ModalBuilder()
                    .setCustomId('sp_url_modal')
                    .setTitle('Connect Spotify')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('sp_url_input')
                                .setLabel('Spotify Profile URL or Username')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('https://open.spotify.com/user/...')
                                .setRequired(true)
                        )
                    );

                await btnInt.showModal(modal);

                let modalSubmit;
                try {
                    modalSubmit = await btnInt.awaitModalSubmit({ time: 120_000 });
                } catch {
                    return;
                }

                await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

                const rawInput = modalSubmit.fields.getTextInputValue('sp_url_input').trim();
                const spotifyUserId = extractSpotifyUserId(rawInput) || rawInput.replace(/^@/, '');

                let userData;
                try {
                    userData = await getSpotifyUser(spotifyUserId);
                } catch (err) {
                    console.error('[Spotify] getSpotifyUser failed:', err.message);
                    let msg;
                    if (err.message.startsWith('SPOTIFY_TOKEN_ERROR')) {
                        msg = `${emojis.error} **Spotify credentials are invalid.**\nThe \`SPOTIFY_CLIENT_ID\` or \`SPOTIFY_CLIENT_SECRET\` set by the bot owner is incorrect.\n-# Details: \`${err.message}\``;
                    } else if (err.message.startsWith('SPOTIFY_USER_NOT_FOUND')) {
                        msg = `${emojis.error} **No Spotify account found** for \`${spotifyUserId}\`.\nMake sure you paste your full profile URL: \`https://open.spotify.com/user/your_id\``;
                    } else if (err.message.includes('not set')) {
                        msg = `${emojis.error} **Spotify is not configured.**\nAsk the bot owner to set \`SPOTIFY_CLIENT_ID\` and \`SPOTIFY_CLIENT_SECRET\`.`;
                    } else {
                        msg = `${emojis.error} **Spotify API error.**\n-# Details: \`${err.message}\``;
                    }
                    const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(msg));
                    return modalSubmit.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }

                const record = {
                    userId: user.id,
                    spotifyUserId: userData.id,
                    displayName: userData.display_name || userData.id,
                    imageUrl: userData.images?.[0]?.url ?? null,
                    profileUrl: userData.external_urls?.spotify ?? `https://open.spotify.com/user/${userData.id}`,
                    followersCount: userData.followers?.total ?? 0,
                };
                await SpotifyProfile.upsert(record);

                let playlistCount = 0;
                try {
                    const d = await getSpotifyPlaylists(userData.id, 1, 0);
                    playlistCount = d.total ?? 0;
                } catch {}

                const savedRecord = await SpotifyProfile.findOne({ where: { userId: user.id } });
                const profileContainer = buildProfileContainer(savedRecord, playlistCount);
                const profileMsg = await modalSubmit.editReply({ components: [profileContainer], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                await setupProfileSession(profileMsg, savedRecord, user.id, client);
            });

            return;
        }

        if (sub === 'profile') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **No Spotify Linked**\nYou don't have a Spotify profile connected. Use \`/spotify login\` to link your profile.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            let playlistCount = 0;
            try {
                const d = await getSpotifyPlaylists(record.spotifyUserId, 1, 0);
                playlistCount = d.total ?? 0;
            } catch {}

            const profileMsg = await interaction.editReply({ components: [buildProfileContainer(record, playlistCount)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            await setupProfileSession(profileMsg, record, user.id, client);
            return;
        }

        if (sub === 'playlists') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} No Spotify linked. Use \`/spotify login\` first.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const { container, playlists } = await fetchAndBuildPlaylistsContainer(record, 0).catch(async () => {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Could not fetch your playlists right now.`)
                );
                await interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                return {};
            });
            if (!container) return;

            const playlistsMsg = await interaction.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            await setupProfileSession(playlistsMsg, record, user.id, client);
            return;
        }

        if (sub === 'logout') {
            const msg = await interaction.reply({
                components: [buildDisconnectConfirmContainer()],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                fetchReply: true,
            });

            const col = msg.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 60_000,
                max: 1,
            });

            col.on('collect', async (i) => {
                if (i.customId === 'sp_confirm_dc') {
                    const deleted = await SpotifyProfile.destroy({ where: { userId: user.id } });
                    const c = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            deleted
                                ? `✅ **Disconnected**\nYour Spotify profile has been unlinked`
                                : `${emojis.error} You don't have a Spotify profile linked.`
                        ));
                    await i.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                } else {
                    await i.deferUpdate();
                }
            });

            return;
        }
    },
};
