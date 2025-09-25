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

// Security middleware - FIXED for Angular + Tailwind CSS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"], // Allow inline styles for Tailwind
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"], // Angular needs these
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"], // For API calls
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Disable for Angular compatibility
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

// Enhanced static file serving for Angular assets
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  etag: false,
  setHeaders: (res, filePath) => {
    // Ensure CSS files have correct MIME type
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    // Ensure JS files have correct MIME type
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    // Allow CORS for assets
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
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

// Handle Angular routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve Angular app for API routes
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = path.join(__dirname, '..', 'public', 'index.html');

  console.log('🔍 Serving frontend for:', req.originalUrl);

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ Error serving index.html:', err);
      res.status(500).json({ 
        error: 'Frontend not found',
        message: 'Please rebuild your Angular app',
        debug: {
          indexPath: indexPath,
          error: err.message
        }
      });
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

// Debug function to check file system
async function checkFileSystem() {
  const fs = require('fs');
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  console.log('🔍 File system check:');
  console.log('📁 Public directory path:', publicDir);
  console.log('📄 Index.html exists:', fs.existsSync(indexPath));

  if (fs.existsSync(publicDir)) {
    try {
      const files = fs.readdirSync(publicDir);
      console.log('📋 Files in public/:');
      files.forEach(file => {
        const filePath = path.join(publicDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${stats.isDirectory() ? '📁' : '📄'} ${file} ${stats.isFile() ? `(${Math.round(stats.size/1024)}KB)` : ''}`);
      });
      
      // Check specifically for CSS and JS files
      const cssFiles = files.filter(f => f.endsWith('.css'));
      const jsFiles = files.filter(f => f.endsWith('.js'));
      console.log(`🎨 CSS files found: ${cssFiles.length} - [${cssFiles.join(', ')}]`);
      console.log(`⚡ JS files found: ${jsFiles.length} - [${jsFiles.slice(0, 3).join(', ')}...]`);
      
      // Check if index.html has the required links
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        const hasStyleLinks = indexContent.includes('rel="stylesheet"');
        const hasScriptTags = indexContent.includes('<script') && indexContent.includes('src=');
        console.log('📄 index.html has CSS links:', hasStyleLinks);
        console.log('📄 index.html has JS script tags:', hasScriptTags);
        
        if (!hasStyleLinks || !hasScriptTags) {
          console.log('⚠️  WARNING: index.html appears to be missing CSS/JS references!');
          console.log('💡 You may need to rebuild your Angular app with: ng build --configuration=production');
        }
      }
      
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
    await sequelize.authenticate();
    console.log('✅ Database connection verified');

    // Debug: Check file system
    await checkFileSystem();

    app.listen(PORT, () => {
      console.log(`🚀 Maraude Tracker Full Stack Server Started`);
      console.log(`📍 Server running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📱 Frontend: http://localhost:${PORT}/`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
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
