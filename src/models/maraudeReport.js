// src/models/maraudeReport.js - Simplified version without removed fields
module.exports = (sequelize, DataTypes) => {
  const MaraudeReport = sequelize.define('MaraudeReport', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    maraudeActionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'maraude_actions',
        key: 'id'
      }
    },
    reportDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: true
      }
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    beneficiariesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    volunteersCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    generalNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    difficultiesEncountered: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    positivePoints: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hasUrgentSituations: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    urgentSituationsDetails: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'validated'),
      defaultValue: 'draft'
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    emailSentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    emailRecipients: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    validatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    validationDate: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'maraude_reports'
  });

  MaraudeReport.associate = (models) => {
    MaraudeReport.belongsTo(models.MaraudeAction, {
      foreignKey: 'maraudeActionId',
      as: 'maraudeAction'
    });
    
    MaraudeReport.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });
    
    MaraudeReport.belongsTo(models.User, {
      foreignKey: 'validatedBy',
      as: 'validator'
    });
    
    MaraudeReport.hasMany(models.ReportDistribution, {
      foreignKey: 'reportId',
      as: 'distributions'
    });
    
    MaraudeReport.hasMany(models.ReportAlert, {
      foreignKey: 'reportId',
      as: 'alerts'
    });
  };

  // Instance method to calculate duration
  MaraudeReport.prototype.calculateDuration = function() {
    const start = new Date(`2000-01-01 ${this.startTime}`);
    const end = new Date(`2000-01-01 ${this.endTime}`);
    const diff = (end - start) / 1000 / 60; // in minutes
    return diff;
  };

  // Instance method to get summary
  MaraudeReport.prototype.getSummary = function() {
    return {
      date: this.reportDate,
      beneficiaries: this.beneficiariesCount,
      volunteers: this.volunteersCount,
      duration: this.calculateDuration(),
      hasAlerts: this.hasUrgentSituations
    };
  };

  return MaraudeReport;
};