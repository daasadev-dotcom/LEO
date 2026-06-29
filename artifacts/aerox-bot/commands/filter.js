const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, ComponentType } = require('discord.js');
const { customFilter } = require('poru');
const emojis = require('../utils/emojis');

const parseEmoji = (str) => {
    if (!str) return null;
    const match = str.trim().match(/^<(a)?:(\w+):(\d+)>$/);
    if (!match) return null;
    return { animated: !!match[1], name: match[2], id: match[3] };
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Apply audio filter (equalizer)'),

    async execute(interaction) {
        const { client, member, guild } = interaction;

        if (!member.voice.channel) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} You need to be in a voice channel!`)
                );
            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                ephemeral: true
            });
        }

        const player = client.poru.players.get(guild.id);
        if (!player) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} No music is currently playing!`)
                );
            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                ephemeral: true
            });
        }

        if (!(player.filters instanceof customFilter)) {
            player.filters = new customFilter(player);
        }

        const filterList = [
            { id: 'reset',      label: 'Reset (No Filter)', emoji: emojis.filter,     description: 'Remove all active filters' },
            { id: 'nightcore',  label: 'Nightcore',         emoji: emojis.nightcore,  description: 'Speeds up the audio with higher pitch' },
            { id: 'vaporwave',  label: 'Vaporwave',         emoji: emojis.vaporwave,  description: 'Slows down the audio with lower pitch' },
            { id: 'bassboost',  label: 'Bassboost',         emoji: emojis.bassboost,  description: 'Boosts the bass frequencies' },
            { id: 'eightD',     label: '8D',                emoji: emojis.eightD,     description: 'Rotating 8D audio effect' },
            { id: 'karaoke',    label: 'Karaoke',           emoji: emojis.karaoke,    description: 'Removes vocals from the track' },
            { id: 'vibrato',    label: 'Vibrato',           emoji: emojis.vibrato,    description: 'Adds a vibrato effect' },
            { id: 'tremolo',    label: 'Tremolo',           emoji: emojis.tremolo,    description: 'Adds a tremolo effect' },
            { id: 'slowed',     label: 'Slowed',            emoji: emojis.slowed,     description: 'Slows down the audio' },
            { id: 'distortion', label: 'Distortion',        emoji: emojis.distortion, description: 'Adds distortion to the audio' },
            { id: 'pop',        label: 'Pop',               emoji: emojis.pop,        description: 'Pop equalizer preset' },
            { id: 'soft',       label: 'Soft',              emoji: emojis.soft,       description: 'Soft equalizer preset' },
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('filter_select')
            .setPlaceholder(`${emojis.filter} Select an audio filter...`);

        for (const filter of filterList) {
            const option = new StringSelectMenuOptionBuilder()
                .setValue(filter.id)
                .setLabel(filter.label)
                .setDescription(filter.description);
            const parsed = parseEmoji(filter.emoji);
            if (parsed) option.setEmoji(parsed);
            selectMenu.addOptions(option);
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${emojis.filter} Audio Filters\nSelect a filter to apply to the music:`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(row)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`Powered by AeroX Development`)
            );

        const filterMsg = await interaction.reply({
            components: [container],
            fetchReply: true,
            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
        });

        if (player.filterCollector) player.filterCollector.stop();
        const collector = filterMsg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 0,
        });
        player.filterCollector = collector;

        collector.on('collect', async (selectInt) => {
            if (selectInt.user.id !== interaction.user.id) {
                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Only the command user can use this menu!`)
                    );
                return selectInt.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }

            if (!(player.filters instanceof customFilter)) {
                player.filters = new customFilter(player);
            }

            const filterId = selectInt.values[0];

            if (filterId === 'reset') {
                player.filters.clearFilters(true);
                await player.filters.updateFilters();
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.success} All filters have been reset!`)
                    );
                return selectInt.reply({
                    components: [container],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }

            let applied = false;

            switch (filterId) {
                case 'nightcore':
                    player.filters.setNightcore(true);
                    applied = true;
                    break;
                case 'vaporwave':
                    player.filters.setVaporwave(true);
                    applied = true;
                    break;
                case 'bassboost':
                    player.filters.setBassboost(true);
                    applied = true;
                    break;
                case 'eightD':
                    player.filters.set8D(true);
                    applied = true;
                    break;
                case 'karaoke':
                    player.filters.setKaraoke(true);
                    applied = true;
                    break;
                case 'vibrato':
                    player.filters.setVibrato(true);
                    applied = true;
                    break;
                case 'tremolo':
                    player.filters.setTremolo(true);
                    applied = true;
                    break;
                case 'slowed':
                    player.filters.setSlowmode(true);
                    applied = true;
                    break;
                case 'distortion':
                    player.filters.setDistortion(true);
                    applied = true;
                    break;
                case 'pop':
                    player.filters.setEqualizer([
                        { band: 1, gain: 0.35 },
                        { band: 2, gain: 0.25 },
                        { band: 3, gain: 0.0 },
                        { band: 4, gain: -0.25 },
                        { band: 5, gain: -0.3 },
                        { band: 6, gain: -0.2 },
                        { band: 7, gain: -0.1 },
                        { band: 8, gain: 0.15 },
                        { band: 9, gain: 0.25 },
                    ]);
                    applied = true;
                    break;
                case 'soft':
                    player.filters.setEqualizer([
                        { band: 0, gain: 0 },
                        { band: 1, gain: 0 },
                        { band: 2, gain: 0 },
                        { band: 3, gain: 0 },
                        { band: 4, gain: 0 },
                        { band: 5, gain: 0 },
                        { band: 6, gain: 0 },
                        { band: 7, gain: 0 },
                        { band: 8, gain: -0.25 },
                        { band: 9, gain: -0.25 },
                        { band: 10, gain: -0.25 },
                        { band: 11, gain: -0.25 },
                        { band: 12, gain: -0.25 },
                        { band: 13, gain: -0.25 },
                    ]);
                    applied = true;
                    break;
            }

            if (applied) {
                await player.filters.updateFilters();
                const filterName = filterList.find(f => f.id === filterId)?.label || filterId;
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.success} Applied **${filterName}** filter!`)
                    );
                await selectInt.reply({
                    components: [container],
                    flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }
        });

        player.on('destroy', () => {
            if (player.filterCollector) player.filterCollector.stop();
            player.filterCollector = null;
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
