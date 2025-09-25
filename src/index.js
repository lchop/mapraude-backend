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

// 🔧 FIXED: Much more permissive CSP for Angular + Tailwind
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "data:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "data:", "blob:"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"], // Fix for inline handlers
      imgSrc: ["'self'", "data:", "https:", "blob:", "*"],
      fontSrc: ["'self'", "https:", "data:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:", "*"],
      objectSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'self'", "https:"],
      childSrc: ["'self'", "https:", "blob:"],
      workerSrc: ["'self'", "https:", "data:", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

// CORS configuration - More permissive
app.use(cors({
  origin: [
    'http://localhost:4200',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    /\.railway\.app$/, // Allow all Railway domains
    /localhost/
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 ENHANCED static file serving with correct MIME types
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: false,
  setHeaders: (res, filePath) => {
    // Fix MIME types for different file types
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    if (filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    // Prevent caching issues
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

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

// 🔧 FIXED: Better SPA routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`
      <h1>Frontend not found</h1>
      <p>The Angular build files are missing.</p>
      <p>Expected path: ${indexPath}</p>
      <p>Please rebuild your Angular app and copy to public/ folder.</p>
    `);
  }
});

// Debug function
async function checkFileSystem() {
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  console.log('🔍 File system check:');
  console.log('📂 Public directory:', publicDir);
  console.log('📄 Index path:', indexPath);
  console.log('📁 Public exists:', fs.existsSync(publicDir));
  console.log('📄 Index exists:', fs.existsSync(indexPath));

  if (fs.existsSync(publicDir)) {
    try {
      const files = fs.readdirSync(publicDir);
      console.log('📋 Files in public/:', files);
      
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
