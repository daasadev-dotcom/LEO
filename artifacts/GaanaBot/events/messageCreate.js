
const {
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorSpacingSize,
} = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    
    if (!message.mentions.users.has(client.user.id)) return;
    if (message.type === 19) return; 
    
    const container = new ContainerBuilder();
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# <:aerox:1430794772091768882> Hey there!\n\n<:dots:1430796944258895913> I'm **${client.user.username}** - Your music companion\n<:dots:1430796944258895913> Use \`/help\` to explore all my commands\n<:dots:1430796944258895913> Need support? Join our [server](https://discord.gg/8wfT8SfB5Z)`
      )
    );
    
    container.addSeparatorComponents(new SeparatorBuilder());
    
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(
          "https://cdn.discordapp.com/attachments/1414256332592254986/1430798331524808724/standard_2.gif"
        )
      )
    );
    
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    
    await message.reply({
      components: [container],
      flags: MessageFlags.IsPersistent | MessageFlags.IsComponentsV2,
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
