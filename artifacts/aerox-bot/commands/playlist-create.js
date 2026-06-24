const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const Playlist = require('../database/models/Playlist');
const config = require('../config');
const emojis = require('../utils/emojis');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlistcreate')
        .setDescription('Create a new empty playlist')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The name for your new playlist')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const playlistName = interaction.options.getString('name');
        const userId = interaction.user.id;

        const playlistCount = await Playlist.count({ where: { userId } });

        if (playlistCount >= config.MUSIC.PLAYLIST_LIMIT) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emojis.error} You have reached the maximum playlist limit (**${config.MUSIC.PLAYLIST_LIMIT}** playlists)!`
                    )
                );
            return interaction.editReply({ 
                components: [container], 
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
            });
        }

        const existing = await Playlist.findOne({ where: { userId, name: playlistName } });
        if (existing) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emojis.error} You already have a playlist named **${playlistName}**!`
                    )
                );
            return interaction.editReply({ 
                components: [container], 
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
            });
        }

        await Playlist.create({ userId, name: playlistName });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${emojis.success} Created empty playlist **${playlistName}**!\nUse \`/playlisttrackadd\` to add songs to it.`
                )
            );
        
        return interaction.editReply({ 
            components: [container], 
            flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
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
