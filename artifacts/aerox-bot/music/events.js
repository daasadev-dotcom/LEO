const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, ComponentType, AttachmentBuilder } = require('discord.js');
const { hexToDecimal } = require('../helpers/colorHelper');
const { MusicCard } = require('../helpers/MusicCard');
const Favorite = require('../database/models/Favorite');
const config = require('../config');
const emojis = require('../utils/emojis');


const musicCard = new MusicCard();

function setupMusicEvents(client) {
    client.poru.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) return;

        player._lastPlayedTrack = track;
        
        if (!player._autoplayHistory) {
            player._autoplayHistory = new Set();
        }
        if (track.info?.identifier) {
            player._autoplayHistory.add(track.info.identifier);
        }

        if (player.nowPlayingMessage && player.nowPlayingMessage.deletable) {
            try {
                await player.nowPlayingMessage.delete().catch(() => {});
            } catch (e) {}
            player.nowPlayingMessage = null;
        }

        if (player.updateInterval) clearInterval(player.updateInterval);

        if (player.buttonCollector) {
            try {
                player.buttonCollector.stop('newTrack');
            } catch (e) {}
            player.buttonCollector = null;
        }

        const nowPlayingText = `## ${emojis.music} Now Playing... \n[${track.info.title}](${track.info.uri}) \n\n`;

        function getFirstControlButtonRow(isPaused, disabled = false) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_pause_resume')
                    .setEmoji(isPaused ? emojis.play : emojis.pause)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_back')
                    .setEmoji(emojis.back)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setEmoji(emojis.stop)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_forward')
                    .setEmoji(emojis.seek)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_autoplay')
                    .setEmoji(emojis.autoplay)
                    .setStyle(player.autoplayEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled)
            );
        }

        function getSecondControlButtonRow(disabled = false) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_vol_up')
                    .setEmoji(emojis.volume)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_queue')
                    .setEmoji(emojis.queue)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_shuffle')
                    .setEmoji(emojis.shuffle)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_vol_down')
                    .setEmoji(emojis.volumeDown)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_favorite_add')
                    .setEmoji(emojis.favorite)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            );
        }

        function getFilterSelectRow(disabled = false) {
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('music_filter_select')
                    .setPlaceholder('🎚️ Select an audio filter...')
                    .setDisabled(disabled)
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Reset (No Filter)').setValue('reset').setEmoji('🔄'),
                        new StringSelectMenuOptionBuilder().setLabel('Nightcore').setValue('nightcore').setEmoji('🌙'),
                        new StringSelectMenuOptionBuilder().setLabel('Vaporwave').setValue('vaporwave').setEmoji('🌊'),
                        new StringSelectMenuOptionBuilder().setLabel('Bassboost').setValue('bassboost').setEmoji('🔊'),
                        new StringSelectMenuOptionBuilder().setLabel('8D').setValue('eightD').setEmoji('🔄'),
                        new StringSelectMenuOptionBuilder().setLabel('Karaoke').setValue('karaoke').setEmoji('🎤'),
                        new StringSelectMenuOptionBuilder().setLabel('Vibrato').setValue('vibrato').setEmoji('〰️'),
                        new StringSelectMenuOptionBuilder().setLabel('Tremolo').setValue('tremolo').setEmoji('〰️'),
                        new StringSelectMenuOptionBuilder().setLabel('Slowed').setValue('slowed').setEmoji('🐢'),
                        new StringSelectMenuOptionBuilder().setLabel('Distortion').setValue('distortion').setEmoji('⚡'),
                        new StringSelectMenuOptionBuilder().setLabel('Pop').setValue('pop').setEmoji('🎧'),
                        new StringSelectMenuOptionBuilder().setLabel('Soft').setValue('soft').setEmoji('💤')
                    )
            );
        }

        let firstControlButtonRow = getFirstControlButtonRow(false, false);
        let secondControlButtonRow = getSecondControlButtonRow(false);

        const container = new ContainerBuilder();
        let musicCardAttachment = null;

        
        if (config.MUSIC.ARTWORK_STYLE === 'MusicCard') {
            
            try {
                let isLiked = false;
                try {
                    const trackIdentifier = track.info?.identifier || track.identifier;
                    if (trackIdentifier && track.info.requester?.id) {
                        const favorite = await Favorite.findOne({
                            where: {
                                userId: track.info.requester.id,
                                identifier: trackIdentifier
                            }
                        });
                        isLiked = !!favorite;
                    }
                } catch (err) {}

                const guild = channel.guild;
                const guildIcon = guild?.iconURL({ extension: 'png', size: 128 });

                const imageBuffer = await musicCard.generateNowPlayingCard({
                    track: track,
                    position: player.position || 0,
                    isLiked: isLiked,
                    guildName: guild?.name || 'Discord Server',
                    guildIcon: guildIcon,
                    player: player
                });

                
                musicCardAttachment = new AttachmentBuilder(imageBuffer, { name: 'nowplaying.png' });

                
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems([new MediaGalleryItemBuilder().setURL('attachment://nowplaying.png')])
                );
            } catch (error) {
                console.error('Error generating MusicCard:', error);
            }
        } else {
            
            if (track.info.artworkUrl || track.info.image) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems([new MediaGalleryItemBuilder().setURL(track.info.artworkUrl || track.info.image)])
                );
            }
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(nowPlayingText));

        let filterSelectRow = getFilterSelectRow(false);

        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(firstControlButtonRow)
            .addActionRowComponents(secondControlButtonRow)
            .addActionRowComponents(filterSelectRow)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        try {
            const messageOptions = {
                components: [container],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
            };

            
            if (musicCardAttachment) {
                messageOptions.files = [musicCardAttachment];
            }

            const message = await channel.send(messageOptions);
            player.nowPlayingMessage = message;

            const filter = (i) => (i.isButton() || i.isStringSelectMenu()) && i.message.id === message.id && i.guildId === player.guildId && i.customId.startsWith('music_');
            const collector = message.createMessageComponentCollector({ filter });
            player.buttonCollector = collector;

            collector.on('collect', async (interaction) => {
                if (!interaction.member.voice.channelId || interaction.member.voice.channelId !== player.voiceChannel) {
                    const errorContainer = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.error} You must be in the same voice channel as the bot!`));
                    return interaction.reply({ 
                        components: [errorContainer], 
                        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                        ephemeral: true 
                    });
                }

                try {
                    switch (interaction.customId) {
                        case 'music_pause_resume': {
                            player.pause(!player.isPaused);
                            const state = player.isPaused ? `${emojis.pause} Music paused.` : `${emojis.resume} Music resumed.`;
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(state));
                            await interaction.reply({ 
                                components: [container], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            break;
                        }
                        case 'music_back': {
                            const previousTrack = player.queue?.previous;
                            if (!previousTrack) {
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.error} No previous track in history!`));
                                return interaction.reply({ 
                                    components: [container], 
                                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                    ephemeral: true 
                                });
                            }
                            if (player.currentTrack) player.queue.unshift(player.currentTrack);
                            player.queue.unshift(previousTrack);
                            player.skip();
                            const backContainer = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.back} Playing previous track: **${previousTrack.info.title}**`));
                            await interaction.reply({ 
                                components: [backContainer], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            break;
                        }
                        case 'music_stop': {
                            player.queue.clear();
                            player.destroy();
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.stop} Stopped music and cleared the queue.`));
                            await interaction.reply({ 
                                components: [container], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            break;
                        }
                        case 'music_forward': {
                            if (!player.currentTrack) {
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.error} Nothing to skip!`));
                                return interaction.reply({ 
                                    components: [container], 
                                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                    ephemeral: true 
                                });
                            }
                            player.skip();
                            const fwdContainer = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.skip} Skipped to the next track.`));
                            await interaction.reply({ 
                                components: [fwdContainer], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            break;
                        }
                        case 'music_autoplay': {
                            player.autoplayEnabled = !player.autoplayEnabled;
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.autoplay} Autoplay ${player.autoplayEnabled ? 'enabled' : 'disabled'}.`));
                            await interaction.reply({ 
                                components: [container], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            
                            break;
                        }
                        case 'music_vol_up': {
                            const currentVol = player.volume ?? 100;
                            const newVol = Math.min(currentVol + 10, 200);
                            player.setVolume(newVol);
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.volume} Volume set to **${newVol}%**`));
                            await interaction.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                            break;
                        }
                        case 'music_lyrics_unused': {
                            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                            
                            try {
                                if (!player.currentTrack) {
                                    const container = new ContainerBuilder()
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(`${emojis.error} No track is currently playing!`)
                                        );
                                    return interaction.editReply({ 
                                        components: [container], 
                                        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                                    });
                                }

                                const track = player.currentTrack;
                            let artist, titleForSearch;
                            const separators = ['-', '–', '|'];
                            let potentialSplit = null;
                            const originalTitle = track.info.title || '';

                            for (const sep of separators) {
                                if (originalTitle.includes(sep)) {
                                    potentialSplit = originalTitle.split(sep);
                                    break;
                                }
                            }

                            if (potentialSplit && potentialSplit.length >= 2) {
                                artist = potentialSplit[0].trim();
                                titleForSearch = potentialSplit.slice(1).join(' ').trim();
                            } else {
                                artist = track.info.author || '';
                                titleForSearch = originalTitle;
                            }

                            const cleanUpRegex = /official|lyric|video|audio|mv|hd|hq|ft|feat/gi;
                            artist = artist.replace(cleanUpRegex, '').trim();
                            titleForSearch = titleForSearch.replace(cleanUpRegex, '').trim();
                            titleForSearch = titleForSearch.replace(/\(.*?\)|\[.*?\]/g, '').trim();

                            let lyrics = null;
                            let foundRecord = null;
                            let embedArtist = artist;
                            let embedTitle = titleForSearch;

                            try {
                                const params = new URLSearchParams();
                                if (titleForSearch) {
                                    params.set('track_name', titleForSearch);
                                } else if (originalTitle) {
                                    params.set('q', originalTitle);
                                }

                                if (artist) params.set('artist_name', artist);

                                const headers = {
                                    'User-Agent': 'AeroX-Music Bot v1.0',
                                };

                                const lrclibUrl = `https://lrclib.net/api/search?${params.toString()}`;
                                const response = await fetch(lrclibUrl, { headers });
                                
                                if (response.status === 200) {
                                    const list = await response.json();
                                    if (Array.isArray(list) && list.length > 0) {
                                        foundRecord = list.find(record => {
                                            return (
                                                record.trackName &&
                                                record.artistName &&
                                                record.trackName.toLowerCase().includes(titleForSearch.toLowerCase()) &&
                                                record.artistName.toLowerCase().includes(artist.toLowerCase())
                                            );
                                        }) || list[0];

                                        if (foundRecord && (foundRecord.plainLyrics || foundRecord.syncedLyrics)) {
                                            lyrics = foundRecord.plainLyrics || foundRecord.syncedLyrics;
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('LRCLIB API request failed:', e);
                            }

                            if (!lyrics && artist && titleForSearch) {
                                try {
                                    const lyricsOvhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(titleForSearch)}`;
                                    const response = await fetch(lyricsOvhUrl);
                                    
                                    if (response.status === 200) {
                                        const data = await response.json();
                                        if (data && data.lyrics) {
                                            lyrics = data.lyrics;
                                            foundRecord = { source: 'lyrics.ovh' };
                                        }
                                    }
                                } catch (e) {
                                    console.error('Lyrics.ovh API request failed:', e);
                                }
                            }

                            if (!lyrics && config.GENIUS && config.GENIUS.API_KEY) {
                                try {
                                    const Genius = require('genius-lyrics');
                                    const searchQuery = `${artist} ${titleForSearch}`.trim();
                                    
                                    if (searchQuery.length > 0) {
                                        const geniusClient = new Genius.Client(config.GENIUS.API_KEY);
                                        const searches = await geniusClient.songs.search(searchQuery);
                                        
                                        if (searches && searches.length > 0) {
                                            const song = searches[0];
                                            const songLyrics = await song.lyrics();
                                            
                                            if (songLyrics) {
                                                lyrics = songLyrics;
                                                embedArtist = song.artist.name;
                                                embedTitle = song.title;
                                                foundRecord = { source: 'genius' };
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error('Genius API failed:', e.message);
                                }
                            }

                            if (!lyrics) {
                                try {
                                    const container = new ContainerBuilder()
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(`${emojis.error} Could not find lyrics for this song.`)
                                        );
                                    return await interaction.editReply({ 
                                        components: [container], 
                                        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                                    });
                                } catch (editError) {
                                    console.error('Failed to send lyrics not found message:', editError);
                                }
                            }

                            const trimmedLyrics = lyrics.length > 3900 ? lyrics.substring(0, 3897) + '...' : lyrics;

                            if (foundRecord && foundRecord.source !== 'genius') {
                                embedArtist = foundRecord.artistName || embedArtist;
                                embedTitle = foundRecord.trackName || embedTitle;
                            }

                            const lyricsSource = foundRecord?.source === 'genius' ? 'genius.com' : foundRecord?.source === 'lyrics.ovh' ? 'lyrics.ovh' : 'lrclib.net';
                            
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`## ${emojis.lyrics} ${embedArtist} - ${embedTitle}`)
                                )
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`[View on YouTube](${track.info.uri})`)
                                )
                                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(trimmedLyrics)
                                )
                                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(`Source: ${lyricsSource}`)
                                );

                            return interaction.editReply({ 
                                components: [container], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                            });
                            } catch (lyricsError) {
                                console.error('Error in lyrics button handler:', lyricsError);
                                try {
                                    const errorContainer = new ContainerBuilder()
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(`${emojis.error} An error occurred while fetching lyrics.`)
                                        );
                                    await interaction.editReply({ 
                                        components: [errorContainer], 
                                        flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                                    });
                                } catch (finalError) {
                                    console.error('Failed to send error message:', finalError);
                                }
                            }
                            break;
                        }
                        case 'music_queue': {
                            const currentPlayer = client.poru.players.get(interaction.guildId);
                            if (!currentPlayer || !currentPlayer.currentTrack) {
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.error} No music is currently playing!`));
                                return interaction.reply({ 
                                    components: [container], 
                                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                    ephemeral: true 
                                });
                            }
                            
                            const command = client.commands.get('queue');
                            if (command) {
                                await command.execute(interaction);
                            }
                            break;
                        }
                        case 'music_shuffle': {
                            if (player.queue.length === 0) {
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.error} The queue is empty!`));
                                return interaction.reply({ 
                                    components: [container], 
                                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                    ephemeral: true 
                                });
                            }
                            player.queue.shuffle();
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.shuffle} Queue shuffled.`));
                            await interaction.reply({ 
                                components: [container], 
                                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, 
                                ephemeral: true 
                            });
                            break;
                        }
                        case 'music_vol_down': {
                            const currentVol = player.volume ?? 100;
                            const newVol = Math.max(currentVol - 10, 0);
                            player.setVolume(newVol);
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.volumeDown} Volume set to **${newVol}%**`));
                            await interaction.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                            break;
                        }
                        case 'music_filter_select': {
                            const { customFilter } = require('poru');
                            const selected = interaction.values[0];
                            if (!(player.filters instanceof customFilter)) {
                                player.filters = new customFilter(player);
                            }
                            if (selected === 'reset') {
                                player.filters.clearFilters(true);
                                await player.filters.updateFilters();
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.success} All filters have been reset!`));
                                return interaction.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                            }
                            switch (selected) {
                                case 'nightcore':   player.filters.setNightcore(true); break;
                                case 'vaporwave':   player.filters.setVaporwave(true); break;
                                case 'bassboost':   player.filters.setBassboost(true); break;
                                case 'eightD':      player.filters.set8D(true); break;
                                case 'karaoke':     player.filters.setKaraoke(true); break;
                                case 'vibrato':     player.filters.setVibrato(true); break;
                                case 'tremolo':     player.filters.setTremolo(true); break;
                                case 'slowed':      player.filters.setSlowmode(true); break;
                                case 'distortion':  player.filters.setDistortion(true); break;
                                case 'pop':         player.filters.setEqualizer([{ band: 0, gain: 0.65 }, { band: 1, gain: 0.45 }, { band: 2, gain: -0.45 }, { band: 3, gain: -0.65 }, { band: 4, gain: -0.35 }, { band: 5, gain: 0.45 }, { band: 6, gain: 0.55 }, { band: 7, gain: 0.6 }, { band: 8, gain: 0.6 }, { band: 9, gain: 0.6 }, { band: 10, gain: 0 }, { band: 11, gain: 0 }, { band: 12, gain: 0 }, { band: 13, gain: 0 }]); break;
                                case 'soft':        player.filters.setEqualizer([{ band: 0, gain: 0 }, { band: 1, gain: 0 }, { band: 2, gain: 0 }, { band: 3, gain: 0 }, { band: 4, gain: 0 }, { band: 5, gain: 0 }, { band: 6, gain: 0 }, { band: 7, gain: 0 }, { band: 8, gain: -0.25 }, { band: 9, gain: -0.25 }, { band: 10, gain: -0.25 }, { band: 11, gain: -0.25 }, { band: 12, gain: -0.25 }, { band: 13, gain: -0.25 }]); break;
                                default: return interaction.reply({ content: 'Unknown filter.', ephemeral: true });
                            }
                            await player.filters.updateFilters();
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.success} Applied **${selected}** filter!`));
                            return interaction.reply({ components: [container], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                        }
                        case 'music_favorite_add': {
                            const favoriteAddCommand = client.commands.get('favoriteadd');
                            if (favoriteAddCommand) {
                                await favoriteAddCommand.execute(interaction);
                            }
                            break;
                        }
                    }
                } catch (error) {
                    console.error('Button interaction error:', error);
                }
            });

            
            player.updateInterval = setInterval(async () => {
                    if (!player.currentTrack || !player.nowPlayingMessage?.editable) {
                        clearInterval(player.updateInterval);
                        return;
                    }

                    const updatedFirstControlButtonRow = getFirstControlButtonRow(player.isPaused, false);
                    const updatedSecondControlButtonRow = getSecondControlButtonRow(false);

                    const updatedContainer = new ContainerBuilder();

                    let updatedMusicCardAttachment = null;

                    
                    if (config.MUSIC.ARTWORK_STYLE === 'MusicCard') {
                        
                        try {
                            let isLiked = false;
                            try {
                                const trackIdentifier = track.info?.identifier || track.identifier;
                                if (trackIdentifier && track.info.requester?.id) {
                                    const favorite = await Favorite.findOne({
                                        where: {
                                            userId: track.info.requester.id,
                                            identifier: trackIdentifier
                                        }
                                    });
                                    isLiked = !!favorite;
                                }
                            } catch (err) {}

                            const guild = channel.guild;
                            const guildIcon = guild?.iconURL({ extension: 'png', size: 128 });

                            const imageBuffer = await musicCard.generateNowPlayingCard({
                                track: track,
                                position: player.position || 0,
                                isLiked: isLiked,
                                guildName: guild?.name || 'Discord Server',
                                guildIcon: guildIcon,
                                player: player
                            });

                            
                            updatedMusicCardAttachment = new AttachmentBuilder(imageBuffer, { name: 'nowplaying.png' });

                            updatedContainer.addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems([new MediaGalleryItemBuilder().setURL('attachment://nowplaying.png')])
                            );
                        } catch (error) {
                            console.error('Error updating MusicCard:', error);
                        }
                    } else {
                        
                        if (track.info.artworkUrl || track.info.image) {
                            updatedContainer.addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems([new MediaGalleryItemBuilder().setURL(track.info.artworkUrl || track.info.image)])
                            );
                        }
                    }
                    updatedContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(nowPlayingText));

                    updatedContainer
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addActionRowComponents(updatedFirstControlButtonRow)
                        .addActionRowComponents(updatedSecondControlButtonRow)
                        .addActionRowComponents(getFilterSelectRow(false))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

                    try {
                        const editOptions = {
                            components: [updatedContainer],
                            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                        };

                        
                        if (updatedMusicCardAttachment) {
                            editOptions.files = [updatedMusicCardAttachment];
                        }

                        await player.nowPlayingMessage.edit(editOptions);
                    } catch (e) {
                        clearInterval(player.updateInterval);
                    }
                }, 5000);
        } catch (e) {
            console.error('Error sending now playing message:', e);
        }
    });

    client.poru.on('trackEnd', async (player, track, data) => {
        if (player.updateInterval) clearInterval(player.updateInterval);
    });

    client.poru.on('queueEnd', async (player) => {
        if (player.updateInterval) clearInterval(player.updateInterval);
        
        if (!player.autoplayEnabled) return;

        const lastTrack = player._lastPlayedTrack || player.currentTrack;
        
        if (!lastTrack || !lastTrack.info) return;

        try {
            const channel = client.channels.cache.get(player.textChannel);
            if (!channel) return;

            const trackTitle = lastTrack.info.title || '';
            const trackArtist = lastTrack.info.author || '';
            const trackUri = lastTrack.info.uri || '';
            
            let resolve;
            
            if (trackUri && trackUri.includes('youtube.com')) {
                resolve = await client.poru.resolve({ 
                    query: `https://music.youtube.com/watch?v=${lastTrack.info.identifier}&list=RD${lastTrack.info.identifier}`,
                    source: 'ytmsearch',
                    requester: lastTrack.info.requester 
                });
            }
            
            if (!resolve || !resolve.tracks || resolve.tracks.length === 0) {
                const searchQuery = `${trackTitle} ${trackArtist}`.trim();
                resolve = await client.poru.resolve({ 
                    query: searchQuery,
                    source: 'ytmsearch',
                    requester: lastTrack.info.requester 
                });
            }
            
            if (!resolve || !resolve.tracks || resolve.tracks.length === 0) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.autoplay} Autoplay couldn't find related tracks. Use \`/play\` to add more songs!`)
                    );
                await channel.send({ 
                    components: [container], 
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                }).catch(() => {});
                return;
            }

            const maxAutoplayTracks = 6;
            const addedTracks = [];
            const seenTracks = new Set();
            
            const normalizeTitle = (title) => {
                return title.toLowerCase()
                    .replace(/\s*\(.*?\)\s*/g, '')
                    .replace(/\s*\[.*?\]\s*/g, '')
                    .replace(/[^\w\s]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            
            const lastTrackNormalized = normalizeTitle(trackTitle);
            seenTracks.add(lastTrackNormalized);
            
            if (!player._autoplayHistory) {
                player._autoplayHistory = new Set();
            }
            
            for (const track of resolve.tracks) {
                if (addedTracks.length >= maxAutoplayTracks) break;
                
                const currentTitle = normalizeTitle(track.info?.title || '');
                const trackId = track.info?.identifier;
                
                if (trackId && player._autoplayHistory.has(trackId)) {
                    continue;
                }
                
                if (!seenTracks.has(currentTitle) && currentTitle && track.info?.author) {
                    addedTracks.push(track);
                    seenTracks.add(currentTitle);
                }
            }
            
            if (addedTracks.length === 0) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.autoplay} Autoplay found only duplicates. Use \`/play\` to add more songs!`)
                    );
                await channel.send({ 
                    components: [container], 
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                }).catch(() => {});
                return;
            }

            for (const track of addedTracks) {
                player.queue.add(track);
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emojis.autoplay} **Autoplay Active**\n\n` +
                        `Added ${addedTracks.length} similar track${addedTracks.length > 1 ? 's' : ''} to queue\n` +
                        `Based on: **${trackTitle}**`
                    )
                );
            await channel.send({ 
                components: [container], 
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
            }).catch(() => {});
            
            if (player.isConnected && !player.isPlaying) {
                try {
                    player.play();
                } catch (err) {
                    console.error('[Autoplay] Error starting playback:', err);
                }
            }
            
        } catch (error) {
            console.error('[Autoplay] Error:', error);
            const channel = client.channels.cache.get(player.textChannel);
            if (channel) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Autoplay encountered an error. Use \`/play\` to continue!`)
                    );
                await channel.send({ 
                    components: [container], 
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
                }).catch(() => {});
            }
        }
    });

    client.poru.on('playerDestroy', (player) => {
        if (player.updateInterval) clearInterval(player.updateInterval);
        if (player.buttonCollector) {
            try {
                player.buttonCollector.stop();
            } catch (e) {}
        }
        if (player._autoplayHistory) {
            player._autoplayHistory.clear();
        }
    });
}

module.exports = { setupMusicEvents };

/*
: ! Aegis !
    + Discord: itsfizys
    + Portfolio: https://itsfiizys.com
    + Community: https://discord.gg/8wfT8SfB5Z  (AeroX Development )
    + for any queries reach out Community or DM me.
*/
