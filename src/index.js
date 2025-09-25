const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
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

// 🧪 TEMPORARY: Disable CSP completely for testing
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Security-Policy');
  res.removeHeader('X-WebKit-CSP');
  next();
});

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 CRITICAL FIX: Static files MUST come BEFORE catch-all route
const publicPath = path.join(__dirname, '..', 'public');
console.log('📁 Static files path:', publicPath);

// Enhanced static file serving with detailed MIME type handling
app.use(express.static(publicPath, {
  maxAge: '0', // Disable caching during development
  etag: false,
  index: false, // Don't auto-serve index.html from static middleware
  setHeaders: (res, filePath) => {
    console.log('📄 Serving static file:', filePath);
    
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      console.log('⚡ Set JS MIME type for:', path.basename(filePath));
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      console.log('🎨 Set CSS MIME type for:', path.basename(filePath));
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    
    // Prevent caching issues
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// 🔧 SPECIFIC: Handle JS files explicitly before catch-all
app.get('*.js', (req, res, next) => {
  const jsPath = path.join(publicPath, req.path);
  console.log('🔍 JS file requested:', req.path);
  console.log('🔍 Looking for:', jsPath);
  console.log('🔍 File exists:', fs.existsSync(jsPath));
  
  if (fs.existsSync(jsPath)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(jsPath);
  } else {
    console.log('❌ JS file not found:', jsPath);
    res.status(404).send('JavaScript file not found');
  }
});

// 🔧 SPECIFIC: Handle CSS files explicitly
app.get('*.css', (req, res, next) => {
  const cssPath = path.join(publicPath, req.path);
  console.log('🎨 CSS file requested:', req.path);
  
  if (fs.existsSync(cssPath)) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.sendFile(cssPath);
  } else {
    console.log('❌ CSS file not found:', cssPath);
    res.status(404).send('CSS file not found');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'Maraude Tracker API is running'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/associations', associationRoutes);
app.use('/api/maraudes', maraudeRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Maraude Tracker API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      associations: '/api/associations',
      maraudes: '/api/maraudes',
      merchants: '/api/merchants',
      users: '/api/users',
      reports: '/api/reports'
    }
  });
});

// 🔧 CRITICAL: Catch-all for SPA routing MUST be LAST
app.get('*', (req, res) => {
  console.log('🌐 Catch-all route hit for:', req.path);
  
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    console.log('❌ API route not found:', req.path);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Don't serve index.html for asset files
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    console.log('❌ Asset file not found:', req.path);
    return res.status(404).send('Asset not found');
  }
  
  const indexPath = path.join(publicPath, 'index.html');
  console.log('📄 Serving index.html for SPA route:', req.path);
  
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(indexPath);
  } else {
    console.log('❌ index.html not found at:', indexPath);
    res.status(404).send(`
      <h1>Frontend not found</h1>
      <p>The Angular build files are missing.</p>
      <p>Expected path: ${indexPath}</p>
    `);
  }
});

// Debug function
async function checkFileSystem() {
  const indexPath = path.join(publicPath, 'index.html');

  console.log('🔍 File system check:');
  console.log('📂 Public directory:', publicPath);
  console.log('📄 Index path:', indexPath);
  console.log('📁 Public exists:', fs.existsSync(publicPath));
  console.log('📄 Index exists:', fs.existsSync(indexPath));

  if (fs.existsSync(publicPath)) {
    try {
      const files = fs.readdirSync(publicPath);
      console.log('📋 All files in public/:');
      files.forEach(file => {
        const filePath = path.join(publicPath, file);
        const stats = fs.statSync(filePath);
        console.log(`   ${file} (${stats.size} bytes)`);
      });
      
      const cssFiles = files.filter(f => f.endsWith('.css'));
      const jsFiles = files.filter(f => f.endsWith('.js'));
      console.log('🎨 CSS files:', cssFiles);
      console.log('⚡ JS files:', jsFiles);
      
    } catch (error) {
      console.log('❌ Error reading public/', error.message);
    }
  }
  console.log('==========================================');
}

// Start server
async function startServer() {
  try {
    await testConnection();
    await sequelize.authenticate();
    console.log('✅ Database connected');

    await checkFileSystem();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📱 Frontend: http://localhost:${PORT}/`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
      console.log('==================================================');
    });

  } catch (error) {
    console.error('❌ Server start failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await sequelize.close();
  process.exit(0);
});

startServer();
