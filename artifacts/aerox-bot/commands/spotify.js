const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags
} = require('discord.js');
const emojis = require('../utils/emojis');
const SpotifyProfile = require('../database/models/SpotifyProfile');
const { fetchPublicUserProfile, extractSpotifyUserId, getSpotifyPlaylists, getPublicPlaylists } = require('../helpers/spotifyHelper');

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

function displayName(record) {
    return record?.displayName || record?.spotifyUserId || 'Spotify User';
}

function buildProfileContainer(record, playlistCount) {
    const name = displayName(record);
    const plText = `${playlistCount} public playlist${playlistCount !== 1 ? 's' : ''}`;
    const info = `## 🎵 Spotify Profile\n**${name}**\n${plText}`;

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
                    .setURL(record.profileUrl || 'https://open.spotify.com')
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
    const spotifyUserId = record.spotifyUserId;
    const name = displayName(record);
    const data = await getPublicPlaylists(spotifyUserId, PAGE, offset);
    const playlists = (data.items ?? []).filter(Boolean);
    const total = data.total ?? 0;

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🎵 ${name}'s Playlists\n${total} playlist${total !== 1 ? 's' : ''}`
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

    if (playlists.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('sp_select_playlist')
            .setPlaceholder('Select a playlist');
        for (let i = 0; i < playlists.length; i++) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(playlists[i].name.slice(0, 100))
                    .setValue(JSON.stringify({ idx: i, offset }))
            );
        }
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
    }

    const navRow = new ActionRowBuilder();
    if (offset > 0) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId('sp_prev_page').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary)
        );
    }
    if (offset + playlists.length < total) {
        navRow.addComponents(
            new ButtonBuilder().setCustomId('sp_next_page').setLabel('Next ▶').setStyle(ButtonStyle.Secondary)
        );
    }
    navRow.addComponents(
        new ButtonBuilder().setCustomId('sp_back_to_profile').setLabel('Back to Profile').setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(navRow);

    return { container, playlists, total, offset };
}

function buildPlaylistDetailContainer(pl, ownerName) {
    const imgUrl = pl.images?.[0]?.url;
    const trackCount = pl.tracks?.total ?? 0;
    const owner = pl.owner?.display_name || pl.owner?.id || ownerName || 'Unknown';
    const info = `## ${pl.name}\nby ${owner}\n${trackCount} track${trackCount !== 1 ? 's' : ''}`;

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
                new ButtonBuilder().setCustomId('sp_play').setLabel(' ').setEmoji('▶️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('sp_shuffle').setLabel(' ').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setLabel('Open').setEmoji('↗️').setStyle(ButtonStyle.Link)
                    .setURL(pl.external_urls?.spotify ?? 'https://open.spotify.com'),
                new ButtonBuilder().setCustomId('sp_back_to_list').setLabel('Back to List').setStyle(ButtonStyle.Secondary)
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
                new ButtonBuilder().setCustomId('sp_confirm_dc').setLabel('Disconnect').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('sp_cancel_dc').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
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
                await i.deferUpdate();
                const freshRecord = await SpotifyProfile.findOne({ where: { userId } });
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(freshRecord ?? record, 0);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_next_page') {
                await i.deferUpdate();
                const freshRecord = await SpotifyProfile.findOne({ where: { userId } });
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(freshRecord ?? record, currentOffset + PAGE);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_prev_page') {
                await i.deferUpdate();
                const freshRecord = await SpotifyProfile.findOne({ where: { userId } });
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(freshRecord ?? record, Math.max(0, currentOffset - PAGE));
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_profile') {
                await i.deferUpdate();
                const freshRecord = await SpotifyProfile.findOne({ where: { userId } });
                const r = freshRecord ?? record;
                let count = 0;
                try { const d = await getPublicPlaylists(r.spotifyUserId, 1, 0); count = d.total ?? 0; } catch {}
                await i.editReply({ components: [buildProfileContainer(r, count)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_select_playlist') {
                const { idx } = JSON.parse(i.values[0]);
                const pl = currentPlaylists[idx];
                if (!pl) return i.deferUpdate();
                currentPlaylist = pl;
                await i.update({ components: [buildPlaylistDetailContainer(pl, displayName(record))], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_list') {
                await i.deferUpdate();
                const freshRecord = await SpotifyProfile.findOne({ where: { userId } });
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(freshRecord ?? record, currentOffset);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_play' || i.customId === 'sp_shuffle') {
                if (!currentPlaylist) return i.deferUpdate();
                const guild = client.guilds.cache.get(i.guildId);
                const member = guild?.members.cache.get(i.user.id);
                if (!member?.voice?.channelId) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Join a voice channel first!`)
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
                        new TextDisplayBuilder().setContent(`${emojis.error} Could not load this playlist. Make sure LavaLink has Spotify support.`)
                    );
                    await i.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }

            } else if (i.customId === 'sp_disconnect') {
                const confirmMsg = await i.reply({
                    components: [buildDisconnectConfirmContainer()],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    withResponse: true,
                });
                const confirmCol = confirmMsg.resource?.message?.createMessageComponentCollector({
                    filter: ci => ci.user.id === userId,
                    time: 60_000,
                    max: 1,
                });
                if (confirmCol) {
                    confirmCol.on('collect', async (ci) => {
                        if (ci.customId === 'sp_confirm_dc') {
                            await SpotifyProfile.destroy({ where: { userId } });
                            const c = new ContainerBuilder().addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`✅ **Disconnected**\nYour Spotify profile has been unlinked.`)
                            );
                            await ci.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                            collector.stop();
                        } else {
                            await ci.deferUpdate();
                        }
                    });
                }
            }
        } catch (err) {
            console.error('[Spotify] Session error:', err.message);
            try { await i.deferUpdate(); } catch {}
        }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Spotify profile integration')
        .addSubcommand(sub => sub.setName('login').setDescription('Connect your Spotify account'))
        .addSubcommand(sub => sub.setName('profile').setDescription('View your linked Spotify profile'))
        .addSubcommand(sub => sub.setName('playlists').setDescription('Browse your Spotify playlists'))
        .addSubcommand(sub => sub.setName('logout').setDescription('Disconnect your Spotify account')),

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
            return interaction.reply({ components: [noCredsContainer()], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
        }

        // ─── LOGIN ────────────────────────────────────────────────────────────
        if (sub === 'login') {
            const existing = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (existing?.spotifyUserId) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **Already Connected**\nYou already have a Spotify profile linked as **${displayName(existing)}**. Use \`/spotify logout\` to disconnect first.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            // Show connect card with "Enter Spotify URL" button
            const connectContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🎵 Connect Spotify\nClick the button below to link your Spotify profile`
                    )
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
                withResponse: true,
            });

            const replyMsg = msg.resource?.message;
            if (!replyMsg) return;

            const btnCollector = replyMsg.createMessageComponentCollector({
                filter: i => i.user.id === user.id && i.customId === 'sp_enter_url',
                time: 600_000,
                max: 5,
            });

            btnCollector.on('collect', async (btnI) => {
                // Show modal
                const modal = new ModalBuilder()
                    .setCustomId('sp_url_modal')
                    .setTitle('Connect Spotify')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('spotify_url')
                                .setLabel('Spotify Profile URL or Username')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('https://open.spotify.com/user/...')
                                .setRequired(true)
                        )
                    );

                await btnI.showModal(modal);

                try {
                    const submitted = await btnI.awaitModalSubmit({ time: 120_000 });
                    const input = submitted.fields.getTextInputValue('spotify_url').trim();
                    const spotifyUserId = extractSpotifyUserId(input);

                    if (!spotifyUserId) {
                        await submitted.reply({
                            content: `${emojis.error} Invalid Spotify URL. Use the format: \`https://open.spotify.com/user/YOUR_ID\``,
                            ephemeral: true,
                        });
                        return;
                    }

                    await submitted.deferUpdate();

                    // Store profile using just the URL — no API call needed.
                    // Spotify restricts GET /v1/users/{id} for client credentials on many accounts.
                    // We use the extracted user ID as the display name (same as reference bots).
                    const profileUrl = `https://open.spotify.com/user/${spotifyUserId}`;

                    // Try to fetch display name and avatar from public profile — optional, ignore errors
                    let dName = spotifyUserId;
                    let imageUrl = null;
                    let followersCount = 0;
                    try {
                        const profile = await fetchPublicUserProfile(spotifyUserId);
                        dName = profile.display_name || profile.id || spotifyUserId;
                        imageUrl = profile.images?.[0]?.url ?? null;
                        followersCount = profile.followers?.total ?? 0;
                    } catch {
                        // 403 or not found — just use the user ID as the name, that's fine
                    }

                    // Store in DB
                    await SpotifyProfile.upsert({
                        userId: user.id,
                        spotifyUserId,
                        displayName: dName,
                        imageUrl,
                        profileUrl,
                        followersCount,
                        accessToken: null,
                        refreshToken: null,
                        tokenExpiry: 0,
                    });

                    btnCollector.stop();

                    // Fetch playlist count and show profile
                    let count = 0;
                    try { const d = await getPublicPlaylists(profile.id, 1, 0); count = d.total ?? 0; } catch {}

                    const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
                    const profileMsg = await submitted.editReply({
                        components: [buildProfileContainer(record, count)],
                        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    });

                    await setupProfileSession(profileMsg, record, user.id, client);
                } catch (err) {
                    if (err.message?.includes('time')) return; // modal timed out
                    console.error('[Spotify] Modal error:', err.message);
                }
            });

            return;
        }

        // ─── PROFILE ─────────────────────────────────────────────────────────
        if (sub === 'profile') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record?.spotifyUserId) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`ℹ️ **No Spotify Linked**\nUse \`/spotify login\` to connect your account.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }
            let count = 0;
            try { const d = await getPublicPlaylists(record.spotifyUserId, 1, 0); count = d.total ?? 0; } catch {}
            const profileMsg = await interaction.reply({
                components: [buildProfileContainer(record, count)],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                withResponse: true,
            });
            await setupProfileSession(profileMsg.resource?.message, record, user.id, client);
            return;
        }

        // ─── PLAYLISTS ────────────────────────────────────────────────────────
        if (sub === 'playlists') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record?.spotifyUserId) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} No Spotify linked. Use \`/spotify login\` first.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }
            await interaction.deferReply();
            try {
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(record, 0);
                const playlistsMsg = await interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                });
                await setupProfileSession(playlistsMsg, record, user.id, client);
            } catch (err) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Could not fetch playlists.\n-# \`${err.message}\``)
                );
                await interaction.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
            }
            return;
        }

        // ─── LOGOUT ───────────────────────────────────────────────────────────
        if (sub === 'logout') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record?.spotifyUserId) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`ℹ️ You don't have a Spotify profile linked.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            const logoutContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `🎵 **Disconnect Spotify**\nAre you sure you want to unlink **${displayName(record)}**?`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('sp_confirm_logout').setLabel('Disconnect').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('sp_cancel_logout').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                    )
                );

            const logoutResp = await interaction.reply({
                components: [logoutContainer],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                withResponse: true,
            });

            const logoutMsg = logoutResp.resource?.message;
            if (!logoutMsg) return;

            const logoutCol = logoutMsg.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 60_000,
                max: 1,
            });

            logoutCol.on('collect', async (i) => {
                if (i.customId === 'sp_confirm_logout') {
                    await SpotifyProfile.destroy({ where: { userId: user.id } });
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`✅ **Disconnected**\nYour Spotify profile has been unlinked.`)
                    );
                    await i.update({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                } else {
                    await i.deferUpdate();
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`ℹ️ Cancelled. Your Spotify profile is still linked.`)
                    );
                    await i.editReply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                }
            });
            return;
        }
    },
};
