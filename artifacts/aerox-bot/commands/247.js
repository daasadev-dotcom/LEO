const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, MessageFlags, ComponentType
} = require('discord.js');
const emojis = require('../utils/emojis');
const GuildTwentyFourSeven = require('../database/models/GuildTwentyFourSeven');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription('Keep the bot connected to a voice channel 24/7')
        .setDefaultMemberPermissions(0x20),

    async execute(interaction) {
        const { guild, member } = interaction;

        if (!member.permissions.has('ManageGuild') && !member.permissions.has('Administrator')) {
            const c = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${emojis.error} You need **Manage Server** permission to use this command.`)
            );
            return interaction.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const existing = await GuildTwentyFourSeven.findOne({ where: { guildId: guild.id } });

        const voiceChannel = existing ? guild.channels.cache.get(existing.voiceChannelId) : null;
        const textChannel = existing ? guild.channels.cache.get(existing.textChannelId) : null;
        const isEnabled = existing?.enabled ?? false;

        const voiceRow = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('247_voice_select')
                .setPlaceholder(voiceChannel ? `Voice: #${voiceChannel.name}` : 'Select a voice channel')
                .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        );

        const textRow = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('247_text_select')
                .setPlaceholder(textChannel ? `Text: #${textChannel.name}` : 'Select a text channel')
                .addChannelTypes(ChannelType.GuildText)
        );

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('247_update')
                .setLabel('Update Channels')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('247_disable')
                .setLabel('Disable')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!isEnabled)
        );

        const statusLine = isEnabled
            ? `## 📡 24/7 Mode  🟢\n-# Bot stays connected continuously`
            : `## 📡 24/7 Mode  ⚪\n-# Currently disabled — select channels and click **Update Channels** to enable`;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLine))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(voiceRow)
            .addActionRowComponents(textRow)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(buttonRow);

        const msg = await interaction.reply({
            components: [container],
            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
            fetchReply: true,
        });

        let selectedVoiceId = existing?.voiceChannelId ?? null;
        let selectedTextId = existing?.textChannelId ?? null;

        const collector = msg.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 120_000,
        });

        collector.on('collect', async (i) => {
            if (i.customId === '247_voice_select') {
                selectedVoiceId = i.values[0];
                await i.deferUpdate();
            } else if (i.customId === '247_text_select') {
                selectedTextId = i.values[0];
                await i.deferUpdate();
            } else if (i.customId === '247_update') {
                if (!selectedVoiceId || !selectedTextId) {
                    const c = new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`${emojis.error} Please select both a voice and text channel first.`)
                    );
                    return i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                }

                await GuildTwentyFourSeven.upsert({
                    guildId: guild.id,
                    voiceChannelId: selectedVoiceId,
                    textChannelId: selectedTextId,
                    enabled: true,
                });

                const vc = guild.channels.cache.get(selectedVoiceId);
                const tc = guild.channels.cache.get(selectedTextId);

                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.success} 24/7 Mode **enabled**!\nVoice: <#${selectedVoiceId}> • Text: <#${selectedTextId}>`)
                );
                await i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                collector.stop();
            } else if (i.customId === '247_disable') {
                await GuildTwentyFourSeven.destroy({ where: { guildId: guild.id } });

                const player = interaction.client.poru.players.get(guild.id);
                if (player) player.destroy();

                const c = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.success} 24/7 Mode **disabled**. The bot will now leave when the queue ends.`)
                );
                await i.reply({ components: [c], flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2, ephemeral: true });
                collector.stop();
            }
        });
    },
};
