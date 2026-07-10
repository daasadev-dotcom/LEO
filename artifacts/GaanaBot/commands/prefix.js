const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } = require('discord.js');
const emojis = require('../utils/emojis');
const GuildPrefix = require('../database/models/GuildPrefix');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('View or set the bot prefix for this server')
        .addStringOption(option =>
            option.setName('new_prefix')
                .setDescription('The new prefix to set (leave empty to view current prefix)')
                .setRequired(false)
                .setMaxLength(10)
        ),

    async execute(interaction) {
        const newPrefix = interaction.options.getString('new_prefix');

        if (!newPrefix) {
            const current = await GuildPrefix.getPrefix(interaction.guildId);
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.info} **Server Prefix**\nCurrent prefix: \`${current}\`\nUse \`${current}play\`, \`${current}skip\`, etc. — or use slash commands directly.`)
                );
            return interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} You need the **Manage Server** permission to change the prefix.`)
                );
            return interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container], ephemeral: true });
        }

        if (newPrefix.length > 10) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Prefix must be 10 characters or fewer.`)
                );
            return interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container], ephemeral: true });
        }

        await GuildPrefix.setPrefix(interaction.guildId, newPrefix);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${emojis.success} Server prefix updated to \`${newPrefix}\`\nYou can now use \`${newPrefix}play\`, \`${newPrefix}skip\`, etc.`)
            );
        return interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
    },
};
