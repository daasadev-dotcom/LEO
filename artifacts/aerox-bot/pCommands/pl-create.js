const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const Playlist = require('../database/models/Playlist');
const config = require('../config');
const emojis = require('../emojis.json');

module.exports = {
    name: 'pl create',
    aliases: ['playlist-create', 'plcreate', 'pl-create'],
    description: 'Create a new empty playlist',
    
    async execute(message, args) {
        const playlistName = args.join(' ');
        
        if (!playlistName) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`${emojis.error} Please provide a name for your playlist!`)
                );
            return message.reply({ 
                components: [container], 
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2
            });
        }

        const userId = message.author.id;

        const playlistCount = await Playlist.count({ where: { userId } });

        if (playlistCount >= config.MUSIC.PLAYLIST_LIMIT) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${emojis.error} You have reached the maximum playlist limit (**${config.MUSIC.PLAYLIST_LIMIT}** playlists)!`
                    )
                );
            return message.reply({ 
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
            return message.reply({ 
                components: [container], 
                flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2 
            });
        }

        await Playlist.create({ userId, name: playlistName });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${emojis.success} Created empty playlist **${playlistName}**!\nUse \`pl track add\` to add songs to it.`
                )
            );
        
        return message.reply({ 
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
