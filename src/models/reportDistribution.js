module.exports = (sequelize, DataTypes) => {
  const ReportDistribution = sequelize.define('ReportDistribution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'maraude_reports',
        key: 'id'
      }
    },
    distributionTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'distribution_types',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'report_distributions',
    updatedAt: false
  });

  ReportDistribution.associate = (models) => {
    ReportDistribution.belongsTo(models.MaraudeReport, {
      foreignKey: 'reportId',
      as: 'report'
    });
    
    ReportDistribution.belongsTo(models.DistributionType, {
      foreignKey: 'distributionTypeId',
      as: 'distributionType'
    });
  };

  return ReportDistribution;
};
