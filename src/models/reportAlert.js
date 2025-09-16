module.exports = (sequelize, DataTypes) => {
  const ReportAlert = sequelize.define('ReportAlert', {
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
    alertType: {
      type: DataTypes.ENUM('medical', 'social', 'security', 'housing', 'other'),
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false
    },
    locationLatitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      validate: {
        min: -90,
        max: 90
      }
    },
    locationLongitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      validate: {
        min: -180,
        max: 180
      }
    },
    locationAddress: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    personDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    situationDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    actionTaken: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    followUpRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    followUpNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'report_alerts'
  });

  ReportAlert.associate = (models) => {
    ReportAlert.belongsTo(models.MaraudeReport, {
      foreignKey: 'reportId',
      as: 'report'
    });
  };

  // Instance method pour obtenir le label de sévérité
  ReportAlert.prototype.getSeverityLabel = function() {
    const labels = {
      low: 'Faible',
      medium: 'Moyen',
      high: 'Élevé',
      critical: 'Critique'
    };
    return labels[this.severity] || this.severity;
  };

  // Instance method pour obtenir le label du type
  ReportAlert.prototype.getTypeLabel = function() {
    const labels = {
      medical: 'Médical',
      social: 'Social',
      security: 'Sécurité',
      housing: 'Logement',
      other: 'Autre'
    };
    return labels[this.alertType] || this.alertType;
  };

  return ReportAlert;
};