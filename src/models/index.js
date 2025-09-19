const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/connection');

// Import models
const Association = require('./association');
const User = require('./user');
const MaraudeAction = require('./maraudeAction');
const Merchant = require('./merchant');
const DistributionType = require('./distributionType');
const MaraudeReport = require('./maraudeReport');
const ReportDistribution = require('./reportDistribution');
const ReportAlert = require('./reportAlert');

// Initialize models
const models = {
  Association: Association(sequelize, DataTypes),
  User: User(sequelize, DataTypes),
  MaraudeAction: MaraudeAction(sequelize, DataTypes),
  Merchant: Merchant(sequelize, DataTypes),
  DistributionType: DistributionType(sequelize, DataTypes),
  MaraudeReport: MaraudeReport(sequelize, DataTypes),
  ReportDistribution: ReportDistribution(sequelize, DataTypes),
  ReportAlert: ReportAlert(sequelize, DataTypes)
};

// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

models.sequelize = sequelize;
models.Sequelize = Sequelize;

module.exports = models;