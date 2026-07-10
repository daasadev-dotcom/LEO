const { Model } = require('sequelize');

class BaseModel extends Model {
    static setupParentTouch(foreignKey, ParentModel, parentField = 'updatedAt') {
        const updateParent = async (instance) => {
            if (instance[foreignKey]) {
                await ParentModel.update(
                    { [parentField]: new Date() },
                    { where: { id: instance[foreignKey] } }
                );
            }
        };

        this.addHook('afterCreate', 'updateParentTimestamp', updateParent);
        this.addHook('afterUpdate', 'updateParentTimestamp', updateParent);
        this.addHook('afterDestroy', 'updateParentTimestamp', updateParent);
    }

    static CACHE_KEYS = [];
}

module.exports = BaseModel;

/*
: ! Aegis !
    + Discord: itsfizys
    + Portfolio: https://itsfiizys.com
    + Community: https://discord.gg/8wfT8SfB5Z  (AeroX Development )
    + for any queries reach out Community or DM me.
*/
