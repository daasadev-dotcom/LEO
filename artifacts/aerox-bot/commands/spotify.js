const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const emojis = require('../utils/emojis');
const SpotifyProfile = require('../database/models/SpotifyProfile');
const SpotifyUserPlaylist = require('../database/models/SpotifyUserPlaylist');
const { getSpotifyPlaylist, extractSpotifyUserId, extractPlaylistId } = require('../helpers/spotifyHelper');

const MAX_SELECT = 25;

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
    const info = `## 🎵 Spotify Profile\n**${record.displayName}**\n${playlistCount} saved playlist${playlistCount !== 1 ? 's' : ''}`;
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
                    .setLabel('My Playlists')
                    .setEmoji('🎵')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('sp_add_playlist')
                    .setLabel('Add Playlist')
                    .setEmoji('➕')
                    .setStyle(ButtonStyle.Success),
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

function buildPlaylistsContainer(playlists, displayName) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🎵 ${displayName}'s Playlists\n${playlists.length} saved playlist${playlists.length !== 1 ? 's' : ''}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (playlists.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('No playlists saved yet.\nClick **Add Playlist** and paste a Spotify playlist URL to get started.')
        );
    } else {
        const shown = playlists.slice(0, MAX_SELECT);
        for (let i = 0; i < shown.length; i++) {
            const pl = shown[i];
            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${i + 1}.** ${pl.name}`)
            );
            if (pl.imageUrl) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(pl.imageUrl));
            container.addSectionComponents(section);
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('sp_select_playlist')
            .setPlaceholder('Select a playlist to view/play');

        for (let i = 0; i < shown.length; i++) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(shown[i].name.slice(0, 100))
                    .setValue(String(i))
            );
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sp_add_playlist')
                .setLabel('Add Playlist')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('sp_back_to_profile')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return { container, playlists: playlists.slice(0, MAX_SELECT) };
}

function buildPlaylistDetailContainer(pl) {
    const imgUrl = pl.imageUrl ?? pl.images?.[0]?.url;
    const info = `## ${pl.name}`;
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
                    .setURL(pl.spotifyUrl ?? pl.external_urls?.spotify ?? 'https://open.spotify.com'),
                new ButtonBuilder()
                    .setCustomId('sp_remove_playlist')
                    .setLabel('Remove')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('sp_back_to_list')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return container;
}

function buildDisconnectConfirmContainer() {
    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`🎵 **Disconnect Spotify**\nAre you sure you want to unlink your Spotify profile and remove all saved playlists?`)
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

function addPlaylistModal() {
    return new ModalBuilder()
        .setCustomId('sp_add_playlist_modal')
        .setTitle('Add Spotify Playlist')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('sp_playlist_url')
                    .setLabel('Spotify Playlist URL')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://open.spotify.com/playlist/...')
                    .setRequired(true)
            )
        );
}

async function setupProfileSession(msg, record, userId, client) {
    let currentPlaylists = [];
    let currentPlaylist = null;

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 600_000,
    });

    async function refreshPlaylists() {
        const rows = await SpotifyUserPlaylist.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
        return rows.map(r => r.dataValues);
    }

    collector.on('collect', async (i) => {
        try {
            if (i.customId === 'sp_view_playlists') {
                const rows = await refreshPlaylists();
                const { container, playlists } = buildPlaylistsContainer(rows, record.displayName);
                currentPlaylists = playlists;
                await i.update({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_profile') {
                const count = await SpotifyUserPlaylist.count({ where: { userId } });
                await i.update({ components: [buildProfileContainer(record, count)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_select_playlist') {
                const idx = parseInt(i.values[0], 10);
                const pl = currentPlaylists[idx];
                if (!pl) return i.deferUpdate();
                currentPlaylist = pl;
                await i.update({ components: [buildPlaylistDetailContainer(pl)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_list') {
                const rows = await refreshPlaylists();
                const { container, playlists } = buildPlaylistsContainer(rows, record.displayName);
                currentPlaylists = playlists;
                await i.update({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_add_playlist') {
                await i.showModal(addPlaylistModal());

                let modalSubmit;
                try {
                    modalSubmit = await i.awaitModalSubmit({ time: 120_000 });
                } catch {
                    return;
                }

                const rawUrl = modalSubmit.fields.getTextInputValue('sp_playlist_url').trim();
                const playlistId = extractPlaylistId(rawUrl);

                if (!playlistId) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Invalid Spotify playlist URL.\nPaste a URL like: \`https://open.spotify.com/playlist/...\``)
                    );
                    return modalSubmit.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }

                let playlistData;
                try {
                    playlistData = await getSpotifyPlaylist(playlistId);
                } catch (err) {
                    console.error('[Spotify] getSpotifyPlaylist failed:', err.message);
                    const msg2 = err.message.startsWith('SPOTIFY_PLAYLIST_NOT_FOUND')
                        ? `${emojis.error} **Playlist not found.**\nMake sure it's a public playlist and the URL is correct.`
                        : `${emojis.error} **Could not fetch playlist.**\n-# \`${err.message}\``;
                    const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(msg2));
                    return modalSubmit.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }

                await SpotifyUserPlaylist.upsert({
                    userId,
                    spotifyPlaylistId: playlistData.id,
                    name: playlistData.name,
                    imageUrl: playlistData.images?.[0]?.url ?? null,
                    spotifyUrl: playlistData.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistData.id}`,
                });

                const rows = await refreshPlaylists();
                const { container, playlists } = buildPlaylistsContainer(rows, record.displayName);
                currentPlaylists = playlists;
                await modalSubmit.update({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_remove_playlist') {
                if (!currentPlaylist) return i.deferUpdate();
                await SpotifyUserPlaylist.destroy({ where: { userId, spotifyPlaylistId: currentPlaylist.spotifyPlaylistId } });
                const rows = await refreshPlaylists();
                const { container, playlists } = buildPlaylistsContainer(rows, record.displayName);
                currentPlaylists = playlists;
                currentPlaylist = null;
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
                        query: currentPlaylist.spotifyUrl,
                        source: 'spotify',
                        requester: i.user
                    });
                    if (!result?.tracks?.length) throw new Error('No tracks');
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
                        new TextDisplayBuilder().setContent(`${emojis.error} Could not load this playlist. Make sure your LavaLink has Spotify support.`)
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
                    max: 1,
                });
                confirmCol.on('collect', async (ci) => {
                    if (ci.customId === 'sp_confirm_dc') {
                        await SpotifyProfile.destroy({ where: { userId } });
                        await SpotifyUserPlaylist.destroy({ where: { userId } });
                        const c = new ContainerBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ **Disconnected**\nYour Spotify profile and saved playlists have been removed.`));
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
        .addSubcommand(sub => sub.setName('playlists').setDescription('Browse your saved Spotify playlists'))
        .addSubcommand(sub => sub.setName('logout').setDescription('Disconnect your Spotify profile')),

    async execute(interaction) {
        const { user, client } = interaction;

        if (typeof interaction.options?.getSubcommand !== 'function') {
            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`🎵 Use \`/spotify login\`, \`/spotify profile\`, \`/spotify playlists\`, or \`/spotify logout\`.`)
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
                        `ℹ️ **Already Connected**\nYou already have a Spotify profile linked as **${existing.displayName}**.\nUse \`/spotify logout\` to disconnect first.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            const connectContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`🎵 **Connect Spotify**\nClick the button below to link your Spotify profile.`)
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
                                .setCustomId('sp_display_name')
                                .setLabel('Your Display Name')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('e.g. John')
                                .setRequired(true)
                                .setMaxLength(50)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('sp_url_input')
                                .setLabel('Spotify Profile URL')
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

                const displayName = modalSubmit.fields.getTextInputValue('sp_display_name').trim();
                const rawInput = modalSubmit.fields.getTextInputValue('sp_url_input').trim();
                const spotifyUserId = extractSpotifyUserId(rawInput) || rawInput.replace(/^@/, '').split('/').pop().split('?')[0];

                if (!spotifyUserId) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Invalid Spotify URL.\nPaste your full profile URL: \`https://open.spotify.com/user/your_id\``)
                    );
                    return modalSubmit.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                }

                const record = {
                    userId: user.id,
                    spotifyUserId,
                    displayName,
                    imageUrl: null,
                    profileUrl: `https://open.spotify.com/user/${encodeURIComponent(spotifyUserId)}`,
                    followersCount: 0,
                };
                await SpotifyProfile.upsert(record);

                const savedRecord = await SpotifyProfile.findOne({ where: { userId: user.id } });
                const profileContainer = buildProfileContainer(savedRecord, 0);
                const profileMsg = await modalSubmit.reply({
                    components: [profileContainer],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    fetchReply: true,
                });
                await setupProfileSession(profileMsg, savedRecord, user.id, client);
            });

            return;
        }

        if (sub === 'profile') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **No Spotify Linked**\nUse \`/spotify login\` to link your profile.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            const count = await SpotifyUserPlaylist.count({ where: { userId: user.id } });
            const profileMsg = await interaction.reply({
                components: [buildProfileContainer(record, count)],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                fetchReply: true,
            });
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

            const rows = await SpotifyUserPlaylist.findAll({ where: { userId: user.id }, order: [['createdAt', 'ASC']] });
            const { container, playlists } = buildPlaylistsContainer(rows.map(r => r.dataValues), record.displayName);
            const playlistsMsg = await interaction.reply({
                components: [container],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                fetchReply: true,
            });
            await setupProfileSession(playlistsMsg, record, user.id, client);
            return;
        }

        if (sub === 'logout') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} You don't have a Spotify profile linked.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

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
                    await SpotifyProfile.destroy({ where: { userId: user.id } });
                    await SpotifyUserPlaylist.destroy({ where: { userId: user.id } });
                    const c = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`✅ **Disconnected**\nYour Spotify profile and saved playlists have been removed.`));
                    await i.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                } else {
                    await i.deferUpdate();
                }
            });
        }
    },
};
