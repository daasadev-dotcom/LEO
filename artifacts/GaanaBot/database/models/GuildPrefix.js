const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const BaseModel = require('../BaseModel');

class GuildPrefix extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
                prefix: { type: DataTypes.STRING, allowNull: false, defaultValue: ',' },
            },
            {
                sequelize,
                modelName: 'GuildPrefix',
                tableName: 'guild_prefix',
                timestamps: true,
            }
        );
        return this;
    }

    static async getPrefix(guildId) {
        const record = await this.findOne({ where: { guildId } });
        return record ? record.prefix : ',';
    }

    static async setPrefix(guildId, prefix) {
        const [record] = await this.findOrCreate({ where: { guildId }, defaults: { prefix } });
        if (record.prefix !== prefix) {
            record.prefix = prefix;
            await record.save();
        }
        return record;
    }

    static async resetPrefix(guildId) {
        await this.destroy({ where: { guildId } });
    }
}

GuildPrefix.init(sequelize);

module.exports = GuildPrefix;
