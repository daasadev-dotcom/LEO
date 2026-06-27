const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const BaseModel = require('../BaseModel');

class GuildTwentyFourSeven extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
                voiceChannelId: { type: DataTypes.STRING, allowNull: false },
                textChannelId: { type: DataTypes.STRING, allowNull: false },
                enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            },
            {
                sequelize,
                modelName: 'GuildTwentyFourSeven',
                tableName: 'guild_247',
                timestamps: true,
            }
        );
        return this;
    }
}

GuildTwentyFourSeven.init(sequelize);

module.exports = GuildTwentyFourSeven;
