const { Sequelize } = require('sequelize');
require('dotenv').config();

// Railway PostgreSQL configuration with better error handling
const sequelize = new Sequelize(
  process.env.DATABASE_URL || {
    database: process.env.PG_NAME || 'maraude_tracker',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
  },
  {
    dialect: 'postgres',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false,
      // Add connection timeout settings
      connectTimeout: 60000,
      socketTimeout: 60000,
      // Keep alive settings
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,          // Reduced for Railway
      min: 0,
      acquire: 60000,  // Increased timeout
      idle: 30000,     // Increased idle time
      evict: 1000,     // Add eviction interval
    },
    retry: {
      max: 3,
      match: [
        /ConnectionError/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ]
    }
  }
);

// Enhanced test connection with retries
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established successfully.');
      
      if (process.env.DATABASE_URL) {
        console.log('🚀 Connected to Railway PostgreSQL');
      } else {
        console.log('🏠 Connected to Local PostgreSQL');
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (i === retries - 1) {
        console.error('🚨 All connection attempts failed');
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Graceful connection handling
sequelize.beforeConnect((config) => {
  console.log('🔄 Attempting database connection...');
});

sequelize.afterConnect((connection, config) => {
  console.log('✅ Database connection established');
});

module.exports = { sequelize, testConnection };
