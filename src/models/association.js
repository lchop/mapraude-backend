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
        isEmail: true,
        notEmpty: true
      }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,  // ✅ Optionnel
      validate: {
        len: {
          args: [10, 20],
          msg: 'Phone must be between 10 and 20 characters'
        },
        // ✅ Validation conditionnelle : valider seulement si rempli
        isValidPhone(value) {
          if (value && value.trim() !== '' && value.length < 10) {
            throw new Error('Phone must be at least 10 characters');
          }
        }
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true  // ✅ Optionnel
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,  // ✅ Optionnel
      validate: {
        // ✅ Validation conditionnelle : valider seulement si rempli
        isValidUrl(value) {
          if (value && value.trim() !== '') {
            const urlPattern = /^https?:\/\/.+\..+/i;
            if (!urlPattern.test(value)) {
              throw new Error('Website must be a valid URL (http:// or https://)');
            }
          }
        }
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
