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

// 🔧 FIXED: Updated Security middleware for Angular
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - Updated for integrated setup
app.use(cors({
  origin: [
    'http://localhost:4200',  // Local development
    'http://localhost:3000',  // Same origin (integrated)
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 FIXED: Enhanced static file serving with proper headers
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'Maraude Tracker API is running',
    frontend: 'Integrated Angular App'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Maraude Tracker API - Weekly Recurring Maraudes',
    version: '2.0.0',
    features: ['Weekly recurring schedules', 'Bordeaux locations', 'Real-time status', 'Integrated Frontend'],
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

// 🔧 FIXED: Handle Angular routing with better error handling
app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = path.join(__dirname, '..', 'public', 'index.html');

  console.log('🔍 Serving frontend for:', req.originalUrl);
  console.log('📁 Looking for index.html at:', indexPath);

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ Error serving index.html:', err);
      res.status(500).json({ 
        error: 'Frontend not found',
        message: 'Please build and copy your Angular app to the public folder',
        indexPath: indexPath,
        instructions: [
          '1. ng build --configuration=production --base-href=/',
          '2. cp -r dist/your-app-name/* public/',
          '3. Restart the server'
        ]
      });
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);

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

// 🔍 Debug function to check file system (temporary)
async function checkFileSystem() {
  const fs = require('fs');
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  console.log('🔍 File system check:');
  console.log('📂 Current __dirname:', __dirname);
  console.log('📁 Public directory path:', publicDir);
  console.log('📄 Index file path:', indexPath);
  console.log('📁 Public dir exists:', fs.existsSync(publicDir));
  console.log('📄 Index.html exists:', fs.existsSync(indexPath));

  if (fs.existsSync(publicDir)) {
    try {
      const files = fs.readdirSync(publicDir);
      console.log('📋 Files in public/:', files.slice(0, 10)); // Show first 10 files
      
      // Check for specific Angular files
      const cssFiles = files.filter(f => f.endsWith('.css'));
      const jsFiles = files.filter(f => f.endsWith('.js'));
      console.log('🎨 CSS files:', cssFiles);
      console.log('📜 JS files:', jsFiles);
      
    } catch (error) {
      console.log('❌ Error reading public directory:', error.message);
    }
  }

  console.log('==========================================');
}

// Start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();

    // Just authenticate to ensure connection works
    await sequelize.authenticate();
    console.log('✅ Database connection verified');
    console.log('📊 Using manually created schema with weekly maraudes');

    // 🔍 Debug: Check file system
    await checkFileSystem();

    app.listen(PORT, () => {
      console.log(`🚀 Maraude Tracker Full Stack Server Started`);
      console.log(`📍 Server running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗺️  Bordeaux Weekly Maraudes System - Integrated Frontend + Backend`);
      console.log(`📱 Frontend: http://localhost:${PORT}/`);
      console.log(`🔗 API Test endpoints:`);
      console.log(`   - http://localhost:${PORT}/api`);
      console.log(`   - http://localhost:${PORT}/api/associations`);
      console.log(`   - http://localhost:${PORT}/api/maraudes/today/active`);
      console.log(`   - http://localhost:${PORT}/api/maraudes/weekly-schedule`);
      console.log(`   - http://localhost:${PORT}/api/merchants`);
      console.log('==================================================');
      console.log(`💡 Frontend files should be in: ${path.join(__dirname, '..', 'public')}`);
      console.log(`🔧 If styles are not loading, check:`);
      console.log(`   1. Angular build completed successfully`);
      console.log(`   2. All files copied to public/ folder`);
      console.log(`   3. CSS files have .css extension`);
      console.log(`   4. No CSP errors in browser console`);
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
