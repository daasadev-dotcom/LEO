const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const BaseModel = require('../BaseModel');

class SpotifyAuthState extends BaseModel {
    static init(sequelize) {
        super.init(
            {
                state: { type: DataTypes.STRING, primaryKey: true },
                userId: { type: DataTypes.STRING, allowNull: false },
                expiresAt: { type: DataTypes.BIGINT, allowNull: false },
            },
            {
                sequelize,
                modelName: 'SpotifyAuthState',
                tableName: 'spotify_auth_states',
                timestamps: false,
            }
        );
        return this;
    }
}

SpotifyAuthState.init(sequelize);
module.exports = SpotifyAuthState;
