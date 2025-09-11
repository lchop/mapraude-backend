module.exports = (sequelize, DataTypes) => {
  const Association = sequelize.define('Association', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [10, 20]
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true,
    tableName: 'associations'
  });

  Association.associate = (models) => {
    // An association has many users
    Association.hasMany(models.User, {
      foreignKey: 'associationId',
      as: 'users'
    });
    
    // An association has many maraude actions
    Association.hasMany(models.MaraudeAction, {
      foreignKey: 'associationId',
      as: 'maraudeActions'
    });
  };

  return Association;
};