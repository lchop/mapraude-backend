const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/connection');

// Import models
const Association = require('./Association');
const User = require('./User');
const MaraudeAction = require('./MaraudeAction');
const Merchant = require('./Merchant');

// Initialize models
const models = {
  Association: Association(sequelize, DataTypes),
  User: User(sequelize, DataTypes),
  MaraudeAction: MaraudeAction(sequelize, DataTypes),
  Merchant: Merchant(sequelize, DataTypes)
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