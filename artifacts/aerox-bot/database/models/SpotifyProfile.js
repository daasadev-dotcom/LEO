const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const BaseModel = require('../BaseModel');

class SpotifyProfile extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                userId: { type: DataTypes.STRING, allowNull: false, unique: true },
                spotifyUserId: { type: DataTypes.STRING, allowNull: false },
                displayName: { type: DataTypes.STRING, allowNull: true },
                imageUrl: { type: DataTypes.STRING, allowNull: true },
                profileUrl: { type: DataTypes.STRING, allowNull: false },
                followersCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
            },
            {
                sequelize,
                modelName: 'SpotifyProfile',
                tableName: 'spotify_profiles',
                timestamps: true,
            }
        );
        return this;
    }
}

SpotifyProfile.init(sequelize);

module.exports = SpotifyProfile;
