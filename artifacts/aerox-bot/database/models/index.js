const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const Favorite = require('./Favorite');
const Playlist = require('./Playlist');
const PlaylistTrack = require('./PlaylistTrack');
const NoPrefix = require('./NoPrefix');
const GuildPrefix = require('./GuildPrefix');
const GuildTwentyFourSeven = require('./GuildTwentyFourSeven');
const SpotifyProfile = require('./SpotifyProfile');
const SpotifyAuthState = require('./SpotifyAuthState');
const SpotifyUserPlaylist = require('./SpotifyUserPlaylist');

const models = {
    Favorite,
    Playlist,
    PlaylistTrack,
    NoPrefix,
    GuildPrefix,
    GuildTwentyFourSeven,
    SpotifyProfile,
    SpotifyAuthState,
    SpotifyUserPlaylist,
    sequelize
};

Object.values(models).forEach(model => {
    if (model.associate && typeof model.associate === 'function') {
        model.associate(models);
    }
});

async function runMigrations() {
    const qi = sequelize.getQueryInterface();
    try {
        const tables = await qi.showAllTables();
        if (tables.includes('spotify_profiles')) {
            const desc = await qi.describeTable('spotify_profiles');
            if (!desc.accessToken) await qi.addColumn('spotify_profiles', 'accessToken', { type: DataTypes.TEXT, allowNull: true });
            if (!desc.refreshToken) await qi.addColumn('spotify_profiles', 'refreshToken', { type: DataTypes.TEXT, allowNull: true });
            if (!desc.tokenExpiry) await qi.addColumn('spotify_profiles', 'tokenExpiry', { type: DataTypes.BIGINT, allowNull: true });
        }
    } catch (e) {
        console.warn('[DB] Migration warning:', e.message);
    }
}

sequelize.sync({ alter: false })
    .then(() => runMigrations())
    .catch(() => {});

module.exports = models;
