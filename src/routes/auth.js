const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Association } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Small helper to fail fast if a required env var is missing
const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) {
    // Make the error explicit in logs so you see it in Railway logs
    console.error(`Missing required environment variable: ${name}`);
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
};

// Centralized JWT options so prod/staging can override
const getJwtConfig = () => ({
  secret: requireEnv('JWT_SECRET'),
  expiresIn: process.env.JWT_EXPIRE || process.env.JWT_EXPIRES_IN || '24h',
  issuer: process.env.JWT_ISSUER || 'maraude-tracker',
  audience: process.env.JWT_AUDIENCE || 'maraude-tracker-users',
});

// Generate JWT token
const generateToken = (userId) => {
  const { secret, expiresIn, issuer, audience } = getJwtConfig();
  const payload = { userId };
  return jwt.sign(payload, secret, { expiresIn, issuer, audience });
};

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, associationId, role = 'volunteer' } = req.body;

    if (!firstName || !lastName || !email || !password || !associationId) {
      return res.status(400).json({
        error: 'All fields are required',
        required: ['firstName', 'lastName', 'email', 'password', 'associationId']
      });
    }

    // Normalize email
    const normalizedEmail = String(email).toLowerCase().trim();

    // Check if association exists
    const association = await Association.findByPk(associationId);
    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }
    if (!association.isActive) {
      return res.status(400).json({ error: 'Association is not active' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password,
      role,
      associationId
    });

    // Generate token
    const token = generateToken(user.id);

    // Return user data (without password) and token
    const userData = await User.findByPk(user.id, {
      include: [{
        model: Association,
        as: 'association',
        attributes: ['id', 'name', 'isActive']
      }],
      attributes: { exclude: ['password'] }
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Find user with association
    const user = await User.findOne({
      where: { email: normalizedEmail },
      include: [{
        model: Association,
        as: 'association',
        attributes: ['id', 'name', 'isActive']
      }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is inactive' });
    }
    if (!user.association?.isActive) {
      return res.status(401).json({ error: 'Association is inactive' });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id);

    // Return user data (without password) and token
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// POST /api/auth/refresh - Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(400).json({ error: 'Invalid token payload' });

    const newToken = generateToken(userId);

    res.json({
      message: 'Token refreshed',
      token: newToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Failed to refresh token',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

module.exports = router;
