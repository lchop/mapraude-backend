module.exports = (sequelize, DataTypes) => {
  const DistributionType = sequelize.define('DistributionType', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    category: {
      type: DataTypes.ENUM('meal', 'hygiene', 'clothing', 'medical', 'other'),
      allowNull: false
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
      validate: {
        is: /^#[0-9A-Fa-f]{6}$/
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true,
    tableName: 'distribution_types'
  });

  DistributionType.associate = (models) => {
    DistributionType.hasMany(models.ReportDistribution, {
      foreignKey: 'distributionTypeId',
      as: 'reportDistributions'
    });
  };

  return DistributionType;
};