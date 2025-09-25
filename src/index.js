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

// 🔧 FIXED: Complete CSP configuration for Angular
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"], // 🔥 This fixes the inline event handler error
      scriptSrcElem: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"], // For Angular service workers
      manifestSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Alternative: Disable CSP entirely for development (uncomment if needed for testing)
// if (process.env.NODE_ENV === 'development') {
//   app.use(helmet({
//     contentSecurityPolicy: false,
//   }));
// }

// CORS configuration - Updated for integrated setup
app.use(cors({
  origin: [
    'http://localhost:4200',  // Local development
    'http://localhost:3000',  // Same origin (integrated)
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  exposedHeaders: ['Authorization']
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 Debug middleware (temporary - remove in production)
if (process.env.NODE_ENV === 'development') {
  app.use('/', (req, res, next) => {
    if (!req.originalUrl.startsWith('/api/')) {
      console.log(`🔍 Frontend Request: ${req.method} ${req.originalUrl}`);
    }
    next();
  });
}

// 🔧 FIXED: Enhanced static file serving with proper headers
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: false,
  index: false, // Don't serve index.html automatically - we'll handle routing
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
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

// 🔧 Add token validation endpoint for debugging
app.get('/api/auth/validate', (req, res) => {
  const token = req.headers.authorization;
  console.log('🔍 Token validation request:', {
    hasAuthHeader: !!req.headers.authorization,
    token: token ? `${token.substring(0, 20)}...` : 'none'
  });
  
  res.json({
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 20)}...` : null,
    headers: Object.keys(req.headers)
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
    method: req.method,
    availableEndpoints: [
      'GET /api',
      'POST /api/auth/login',
      'GET /api/auth/validate',
      'GET /api/associations',
      'GET /api/maraudes',
      'GET /api/maraudes/today/active',
      'GET /api/maraudes/weekly-schedule',
      'GET /api/merchants',
      'GET /api/users'
    ]
  });
});

// 🔧 FIXED: Handle Angular routing with comprehensive error handling
app.get('*', (req, res) => {
  // Skip API routes
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  const fs = require('fs');

  console.log('🔍 Serving Angular app for:', req.originalUrl);

  // Check if index.html exists
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found at:', indexPath);
    return res.status(500).json({ 
      error: 'Frontend not properly built',
      message: 'Angular app not found. Please build your Angular application.',
      indexPath: indexPath,
      instructions: [
        '1. cd to your Angular project directory',
        '2. ng build --configuration=production --base-href=/',
        '3. cp -r dist/your-app-name/* public/ (or dist/browser/* for newer Angular)',
        '4. Restart the server',
        '5. Verify index.html exists in public folder'
      ]
    });
  }

  // Set proper headers for Angular SPA
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ Error serving index.html:', err);
      res.status(500).json({ 
        error: 'Failed to serve frontend',
        details: err.message
      });
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

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
      : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 🔍 Enhanced debug function
async function checkFileSystem() {
  const fs = require('fs');
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  console.log('\n🔍 File System Check:');
  console.log('==========================================');
  console.log('📂 Current __dirname:', __dirname);
  console.log('📁 Public directory path:', publicDir);
  console.log('📄 Index file path:', indexPath);
  console.log('📁 Public dir exists:', fs.existsSync(publicDir));
  console.log('📄 Index.html exists:', fs.existsSync(indexPath));

  if (fs.existsSync(publicDir)) {
    try {
      const files = fs.readdirSync(publicDir);
      console.log('📋 Total files in public/:', files.length);
      
      // Check for specific Angular files
      const cssFiles = files.filter(f => f.endsWith('.css'));
      const jsFiles = files.filter(f => f.endsWith('.js'));
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      
      console.log('🎨 CSS files:', cssFiles.length > 0 ? cssFiles : '❌ No CSS files found');
      console.log('📜 JS files:', jsFiles.length > 0 ? jsFiles.slice(0, 3) + '...' : '❌ No JS files found');
      console.log('📄 HTML files:', htmlFiles);
      
      // Check if index.html contains Angular app-root
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        const hasAppRoot = indexContent.includes('<app-root>');
        const hasBaseHref = indexContent.includes('base href');
        console.log('🔍 Index.html analysis:');
        console.log('   - Contains <app-root>:', hasAppRoot);
        console.log('   - Has base href:', hasBaseHref);
        console.log('   - File size:', (indexContent.length / 1024).toFixed(2) + 'KB');
      }
      
    } catch (error) {
      console.log('❌ Error reading public directory:', error.message);
    }
  } else {
    console.log('❌ Public directory does not exist!');
    console.log('💡 Create it with: mkdir -p ' + publicDir);
  }

  console.log('==========================================\n');
}

// Start server
async function startServer() {
  try {
    // Test database connection
    await testConnection();

    // Just authenticate to ensure connection works
    await sequelize.authenticate();
    console.log('✅ Database connection verified');

    // 🔍 Debug: Check file system
    await checkFileSystem();

    app.listen(PORT, () => {
      console.log('\n🚀 MARAUDE TRACKER FULL STACK SERVER');
      console.log('==========================================');
      console.log(`📍 Server: http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗺️  Frontend: http://localhost:${PORT}/`);
      console.log(`🔗 API Base: http://localhost:${PORT}/api`);
      console.log('');
      console.log('📡 Available API endpoints:');
      console.log('   GET  /api - API information');
      console.log('   GET  /api/auth/validate - Token validation');
      console.log('   POST /api/auth/login - Authentication');
      console.log('   GET  /api/associations - List associations');
      console.log('   GET  /api/maraudes/today/active - Active maraudes');
      console.log('   GET  /api/maraudes/weekly-schedule - Weekly schedule');
      console.log('   GET  /api/merchants - List merchants');
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Check browser console for CSP errors');
      console.log('   2. Verify all files copied to public/ folder');
      console.log('   3. Test API: curl http://localhost:' + PORT + '/api');
      console.log('   4. Test auth: check /api/auth/validate');
      console.log('==========================================\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  try {
    await sequelize.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  try {
    await sequelize.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
