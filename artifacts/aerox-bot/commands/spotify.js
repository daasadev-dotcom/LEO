const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags
} = require('discord.js');
const emojis = require('../utils/emojis');
const SpotifyProfile = require('../database/models/SpotifyProfile');
const SpotifyAuthState = require('../database/models/SpotifyAuthState');
const {
    buildAuthUrl, generateState, getSpotifyPlaylists,
    extractSpotifyUserId, fetchPublicUserProfile,
} = require('../helpers/spotifyHelper');

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
    const plText = `${playlistCount} playlist${playlistCount !== 1 ? 's' : ''}`;
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

async function fetchAndBuildPlaylistsContainer(userId, record, offset) {
    const name = displayName(record);
    const data = await getSpotifyPlaylists(userId, PAGE, offset);
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
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No playlists found.'));
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
    if (offset > 0) navRow.addComponents(
        new ButtonBuilder().setCustomId('sp_prev_page').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary)
    );
    if (offset + playlists.length < total) navRow.addComponents(
        new ButtonBuilder().setCustomId('sp_next_page').setLabel('Next ▶').setStyle(ButtonStyle.Secondary)
    );
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
                const r = await SpotifyProfile.findOne({ where: { userId } }) ?? record;
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(userId, r, 0);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_next_page') {
                await i.deferUpdate();
                const r = await SpotifyProfile.findOne({ where: { userId } }) ?? record;
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(userId, r, currentOffset + PAGE);
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_prev_page') {
                await i.deferUpdate();
                const r = await SpotifyProfile.findOne({ where: { userId } }) ?? record;
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(userId, r, Math.max(0, currentOffset - PAGE));
                currentPlaylists = playlists;
                currentOffset = offset;
                await i.editReply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_profile') {
                await i.deferUpdate();
                const r = await SpotifyProfile.findOne({ where: { userId } }) ?? record;
                let count = 0;
                try { const d = await getSpotifyPlaylists(userId, 1, 0); count = d.total ?? 0; } catch {}
                await i.editReply({ components: [buildProfileContainer(r, count)], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_select_playlist') {
                const { idx } = JSON.parse(i.values[0]);
                const pl = currentPlaylists[idx];
                if (!pl) return i.deferUpdate();
                currentPlaylist = pl;
                await i.update({ components: [buildPlaylistDetailContainer(pl, displayName(record))], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });

            } else if (i.customId === 'sp_back_to_list') {
                await i.deferUpdate();
                const r = await SpotifyProfile.findOne({ where: { userId } }) ?? record;
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(userId, r, currentOffset);
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
                        requester: i.user,
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
                            `${emojis.success} Added **${tracks.length}** tracks from **${currentPlaylist.name}**${i.customId === 'sp_shuffle' ? ' (shuffled)' : ''}!`
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
                const confirmResp = await i.reply({
                    components: [buildDisconnectContainer()],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    withResponse: true,
                });
                const confirmMsg = confirmResp.resource?.message;
                if (!confirmMsg) return;
                const confirmCol = confirmMsg.createMessageComponentCollector({
                    filter: ci => ci.user.id === userId,
                    time: 60_000,
                    max: 1,
                });
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
        } catch (err) {
            console.error('[Spotify] Session error:', err.message);
            try { await i.deferUpdate(); } catch {}
        }
    });
}

function buildDisconnectContainer() {
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
            if (existing?.accessToken) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `ℹ️ **Already Connected**\nLinked as **${displayName(existing)}**. Use \`/spotify logout\` to disconnect first.`
                    )
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }

            // Clear any old auth state for this user
            await SpotifyAuthState.destroy({ where: { userId: user.id } }).catch(() => {});

            const state = generateState();
            await SpotifyAuthState.create({
                state,
                userId: user.id,
                expiresAt: Date.now() + 10 * 60 * 1000,
            });

            const { url: authUrl } = buildAuthUrl(state);

            const connectContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## 🎵 Connect Spotify\n` +
                        `Click **Login with Spotify**, authorize in your browser, then come back.\n` +
                        `This message will update automatically — no extra steps needed.`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Login with Spotify')
                            .setEmoji('🎵')
                            .setStyle(ButtonStyle.Link)
                            .setURL(authUrl),
                        new ButtonBuilder()
                            .setCustomId('sp_use_url')
                            .setLabel('Use URL instead')
                            .setStyle(ButtonStyle.Secondary)
                    )
                );

            await interaction.reply({
                components: [connectContainer],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
            });

            // Start polling — auto-update when OAuth completes
            const maxWait = 5 * 60 * 1000;
            const pollMs = 3000;
            const start = Date.now();
            let resolved = false;

            // Also handle "Use URL instead" button
            const urlBtnTimeout = setTimeout(() => {}, 0);
            const urlBtnListener = async () => {};

            const checkLoop = (async () => {
                while (Date.now() - start < maxWait && !resolved) {
                    await new Promise(r => setTimeout(r, pollMs));
                    const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
                    if (!record?.accessToken) continue;

                    resolved = true;
                    let count = 0;
                    try { const d = await getSpotifyPlaylists(user.id, 1, 0); count = d.total ?? 0; } catch {}

                    try {
                        const profileMsg = await interaction.editReply({
                            components: [buildProfileContainer(record, count)],
                            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                        });
                        await setupProfileSession(profileMsg, record, user.id, client);
                    } catch {}
                    return;
                }

                if (!resolved) {
                    try {
                        const expired = new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`⏰ **Login Expired**\nThe session timed out. Run \`/spotify login\` again.`)
                        );
                        await interaction.editReply({ components: [expired], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 });
                    } catch {}
                }
            })();

            // Handle "Use URL instead" button via awaitMessageComponent
            interaction.fetchReply().then(msg => {
                if (!msg?.createMessageComponentCollector) return;
                const col = msg.createMessageComponentCollector({
                    filter: i => i.user.id === user.id && i.customId === 'sp_use_url',
                    time: maxWait,
                    max: 1,
                });
                col.on('collect', async (btnI) => {
                    if (resolved) return btnI.deferUpdate().catch(() => {});
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
                            await submitted.reply({ content: `${emojis.error} Invalid URL.`, ephemeral: true });
                            return;
                        }
                        await submitted.deferUpdate();
                        resolved = true;

                        let dName = spotifyUserId;
                        let imageUrl = null;
                        let followersCount = 0;
                        try {
                            const p = await fetchPublicUserProfile(spotifyUserId);
                            dName = p.display_name || p.id || spotifyUserId;
                            imageUrl = p.images?.[0]?.url ?? null;
                            followersCount = p.followers?.total ?? 0;
                        } catch {}

                        await SpotifyProfile.upsert({
                            userId: user.id,
                            spotifyUserId,
                            displayName: dName,
                            imageUrl,
                            profileUrl: `https://open.spotify.com/user/${spotifyUserId}`,
                            followersCount,
                            accessToken: null,
                            refreshToken: null,
                            tokenExpiry: 0,
                        });

                        // Clean up the OAuth state since we're using URL instead
                        await SpotifyAuthState.destroy({ where: { userId: user.id } }).catch(() => {});

                        let count = 0;
                        try { const d = await getSpotifyPlaylists(user.id, 1, 0); count = d.total ?? 0; } catch {}

                        const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
                        const profileMsg = await submitted.editReply({
                            components: [buildProfileContainer(record, count)],
                            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                        });
                        await setupProfileSession(profileMsg, record, user.id, client);
                    } catch (err) {
                        if (!err.message?.includes('time')) console.error('[Spotify] URL modal error:', err.message);
                    }
                });
            }).catch(() => {});

            return;
        }

        // ─── PROFILE ─────────────────────────────────────────────────────────
        if (sub === 'profile') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record?.spotifyUserId && !record?.accessToken) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`ℹ️ **No Spotify Linked**\nUse \`/spotify login\` to connect your account.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }
            let count = 0;
            try { const d = await getSpotifyPlaylists(user.id, 1, 0); count = d.total ?? 0; } catch {}
            const resp = await interaction.reply({
                components: [buildProfileContainer(record, count)],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                withResponse: true,
            });
            await setupProfileSession(resp.resource?.message, record, user.id, client);
            return;
        }

        // ─── PLAYLISTS ────────────────────────────────────────────────────────
        if (sub === 'playlists') {
            const record = await SpotifyProfile.findOne({ where: { userId: user.id } });
            if (!record?.spotifyUserId && !record?.accessToken) {
                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} No Spotify linked. Use \`/spotify login\` first.`)
                );
                return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
            }
            await interaction.deferReply();
            try {
                const { container, playlists, offset } = await fetchAndBuildPlaylistsContainer(user.id, record, 0);
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
            if (!record?.spotifyUserId && !record?.accessToken) {
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

            const resp = await interaction.reply({
                components: [logoutContainer],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                withResponse: true,
            });
            const logoutMsg = resp.resource?.message;
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
