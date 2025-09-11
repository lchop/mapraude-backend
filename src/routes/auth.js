const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Association } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, associationId, role = 'volunteer' } = req.body;

    // Check if association exists
    const association = await Association.findByPk(associationId);
    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }

    if (!association.isActive) {
      return res.status(400).json({ error: 'Association is not active' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
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
      details: error.message 
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

    // Find user with association
    const user = await User.findOne({
      where: { email },
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

    if (!user.association.isActive) {
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
      details: error.message 
    });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user info',
      details: error.message 
    });
  }
});

// POST /api/auth/refresh - Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const newToken = generateToken(req.user.id);
    
    res.json({
      message: 'Token refreshed',
      token: newToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      details: error.message 
    });
  }
});

module.exports = router;