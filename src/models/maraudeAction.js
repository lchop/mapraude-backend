module.exports = (sequelize, DataTypes) => {
  const MaraudeAction = sequelize.define('MaraudeAction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [3, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
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
      allowNull: true
    },
    // NEW: Day of week (1=Monday, 2=Tuesday, ..., 7=Sunday)
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 7
      }
    },
    // NEW: Whether this is a recurring weekly maraude
    isRecurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    // MODIFIED: Now optional - only for one-time events
    scheduledDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('planned', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'planned'
    },
    participantsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    beneficiariesHelped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    materialsDistributed: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // NEW: Enable/disable recurring maraudes
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    associationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'associations',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    tableName: 'maraude_actions',
    indexes: [
      {
        fields: ['dayOfWeek']
      },
      {
        fields: ['isRecurring', 'isActive']
      },
      {
        fields: ['status']
      },
      {
        fields: ['latitude', 'longitude']
      }
    ]
  });

  // Instance method to get French day name
  MaraudeAction.prototype.getDayName = function() {
    const days = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    return this.dayOfWeek ? days[this.dayOfWeek] : 'Ponctuel';
  };

  // Instance method to check if happening today
  MaraudeAction.prototype.isHappeningToday = function() {
    if (!this.isRecurring || !this.isActive) {
      if (this.scheduledDate) {
        const today = new Date().toISOString().split('T')[0];
        return this.scheduledDate === today;
      }
      return false;
    }
    
    const today = new Date();
    // Convert JavaScript day (0=Sunday) to ISO day (1=Monday)
    const todayISO = today.getDay() === 0 ? 7 : today.getDay();
    return todayISO === this.dayOfWeek;
  };

  // Instance method to get next occurrence date
  MaraudeAction.prototype.getNextOccurrence = function() {
    if (!this.isRecurring || !this.isActive) {
      return this.scheduledDate;
    }

    const today = new Date();
    const todayISO = today.getDay() === 0 ? 7 : today.getDay();
    const targetDay = this.dayOfWeek;
    
    let daysUntilNext = targetDay - todayISO;
    if (daysUntilNext < 0) {
      daysUntilNext += 7;
    }
    
    // If it's today but time has passed, get next week
    if (daysUntilNext === 0) {
      const [hours, minutes] = this.startTime.split(':').map(Number);
      const startTimeToday = new Date();
      startTimeToday.setHours(hours, minutes, 0, 0);
      
      if (today > startTimeToday) {
        daysUntilNext = 7;
      }
    }
    
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilNext);
    return nextDate.toISOString().split('T')[0];
  };

  MaraudeAction.associate = (models) => {
    MaraudeAction.belongsTo(models.Association, {
      foreignKey: 'associationId',
      as: 'association'
    });
    
    MaraudeAction.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });
  };

  return MaraudeAction;
};
