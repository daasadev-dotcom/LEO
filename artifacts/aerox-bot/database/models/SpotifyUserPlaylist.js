const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const BaseModel = require('../BaseModel');

class SpotifyUserPlaylist extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
                userId: { type: DataTypes.STRING, allowNull: false },
                spotifyPlaylistId: { type: DataTypes.STRING, allowNull: false },
                name: { type: DataTypes.STRING, allowNull: false },
                imageUrl: { type: DataTypes.STRING, allowNull: true },
                spotifyUrl: { type: DataTypes.STRING, allowNull: false },
            },
            {
                sequelize,
                modelName: 'SpotifyUserPlaylist',
                tableName: 'spotify_user_playlists',
                timestamps: true,
            }
        );
        return this;
    }
}

SpotifyUserPlaylist.init(sequelize);
module.exports = SpotifyUserPlaylist;
