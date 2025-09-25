const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { testConnection, sequelize } = require('./config/connection');
const models = require('./models');

// Import routes
const authRoutes = require('./routes/auth');
const associationRoutes = require('./routes/associations');
const maraudeRoutes = require('./routes/maraudes');
const merchantRoutes = require('./routes/merchants');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration - Updated for separate frontend service
app.use(cors({
  origin: [
    'http://localhost:4200',  // Local development
    'https://your-frontend-service.railway.app',  // 👈 Replace with your actual frontend Railway URL
    process.env.FRONTEND_URL
  ].filter(Boolean), // Remove any undefined values
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'Maraude Tracker API is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Maraude Tracker API - Weekly Recurring Maraudes',
    version: '2.0.0',
    features: ['Weekly recurring schedules', 'Bordeaux locations', 'Real-time status'],
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      associations: '/api/associations',
      maraudes: '/api/maraudes',
      weeklySchedule: '/api/maraudes/weekly-schedule',
      todayActive: '/api/maraudes/today/active',
      merchants: '/api/merchants',
      users: '/api/users'
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/associations', associationRoutes);
app.use('/api/maraudes', maraudeRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

// REMOVED: Static file serving (since we'll have separate frontend service)
// app.use(express.static(path.join(__dirname, 'public')));
// app.get('*', (req, res) => {
//   if (req.path.startsWith('/api/')) {
//     return res.status(404).json({ error: 'API endpoint not found' });
//   }
//   res.sendFile(path.join(__dirname, 'public/index.html'));
// });

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      '/api/associations',
      '/api/maraudes',
      '/api/maraudes/today/active',
      '/api/maraudes/weekly-schedule',
      '/api/merchants',
      '/api/users',
      '/api/auth'
    ]
  });
});

// Catch all non-API routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'This is an API server. Frontend should be accessed separately.',
    message: 'Visit your frontend Railway service URL to access the application',
    api: {
      health: '/health',
      docs: '/',
      endpoints: '/api/*'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Resource already exists',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Internal server error'
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();

    // Just authenticate to ensure connection works
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
    console.log('📊 Using manually created schema with weekly maraudes');

    app.listen(PORT, () => {
      console.log(`🚀 Maraude Tracker API Server Started`);
      console.log(`📍 Server running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗺️  Bordeaux Weekly Maraudes System - Backend Only`);
      console.log(`📱 Frontend should be deployed as separate Railway service`);
      console.log(`🔗 API Test endpoints:`);
      console.log(`   - http://localhost:${PORT}/api/associations`);
      console.log(`   - http://localhost:${PORT}/api/maraudes/today/active`);
      console.log(`   - http://localhost:${PORT}/api/maraudes/weekly-schedule`);
      console.log(`   - http://localhost:${PORT}/api/merchants`);
      console.log('==================================================');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await sequelize.close();
  process.exit(0);
});

startServer();