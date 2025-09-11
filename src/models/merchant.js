module.exports = (sequelize, DataTypes) => {
  const Merchant = sequelize.define('Merchant', {
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
    category: {
      type: DataTypes.ENUM(
        'restaurant', 'cafe', 'bakery', 'pharmacy', 'clothing_store', 
        'supermarket', 'laundromat', 'health_center', 'other'
      ),
      allowNull: false
    },
    services: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
      // Example: ["free_coffee", "shower", "wifi", "phone_charging", "restroom", "meal", "clothing_donation"]
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false,
      validate: {
        min: -90,
        max: 90
      }
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false,
      validate: {
        min: -180,
        max: 180
      }
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [10, 20]
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
      }
    },
    openingHours: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
      // Example: { "monday": "09:00-18:00", "tuesday": "09:00-18:00", ... }
    },
    specialInstructions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    contactPerson: {
      type: DataTypes.STRING,
      allowNull: true
    },
    addedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    tableName: 'merchants',
    indexes: [
      {
        fields: ['category']
      },
      {
        fields: ['isActive', 'isVerified']
      },
      {
        fields: ['latitude', 'longitude']
      }
    ]
  });

  Merchant.associate = (models) => {
    // A merchant can be added by a user (optional)
    Merchant.belongsTo(models.User, {
      foreignKey: 'addedBy',
      as: 'addedByUser',
      allowNull: true
    });
  };

  return Merchant;
};