const express = require('express');
const { Association, User, MaraudeAction } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/associations - Get all associations (public)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, active = 'true', search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (active !== 'all') {
      whereClause.isActive = active === 'true';
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: associations } = await Association.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'description', 'email', 'phone', 'address', 'website', 'isActive', 'createdAt']
    });

    res.json({
      associations,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get associations error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch associations',
      message: error.message 
    });
  }
});

// POST /api/associations - Create new association
router.post('/', async (req, res) => {
  try {
    console.log('📥 Création association - Body reçu:', req.body);

    const {
      name,
      description,
      email,
      phone,
      address,
      website
    } = req.body;

    // Validation des champs requis
    if (!name || !email) {
      console.log('❌ Champs requis manquants:', { name, email });
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Name and email are required',
        details: {
          name: !name ? 'Name is required' : null,
          email: !email ? 'Email is required' : null
        }
      });
    }

    // Validation email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Email invalide:', email);
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Invalid email format',
        details: { email: 'Please provide a valid email address' }
      });
    }

    // Check if association with same email exists
    const existingAssociation = await Association.findOne({ 
      where: { email } 
    });

    if (existingAssociation) {
      console.log('❌ Email déjà utilisé:', email);
      return res.status(409).json({ 
        error: 'Validation error',
        message: 'Association already exists with this email',
        details: { email: 'This email is already registered' }
      });
    }

    // ✅ Nettoyer les champs optionnels : transformer strings vides en null
    const cleanedData = {
      name: name.trim(),
      description: description?.trim() || null,
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      website: website?.trim() || null,
      isActive: false // New associations need approval
    };

    console.log('✅ Données nettoyées:', cleanedData);

    const association = await Association.create(cleanedData);

    console.log('✅ Association créée:', association.id);

    res.status(201).json({
      message: 'Association created successfully',
      association
    });

  } catch (error) {
    console.error('❌ Create association error:', error);
    
    // Gestion des erreurs de validation Sequelize
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = {};
      error.errors.forEach(err => {
        validationErrors[err.path] = err.message;
      });
      
      console.log('❌ Erreurs de validation Sequelize:', validationErrors);
      
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Validation failed',
        details: validationErrors
      });
    }

    // Gestion des erreurs de contrainte unique
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      console.log('❌ Contrainte unique violée:', field);
      
      return res.status(409).json({ 
        error: 'Validation error',
        message: `${field} must be unique`,
        details: {
          [field]: `This ${field} is already registered`
        }
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create association',
      message: error.message
    });
  }
});

// GET /api/associations/:id - Get specific association (public)
router.get('/:id', async (req, res) => {
  try {
    const association = await Association.findByPk(req.params.id, {
      attributes: ['id', 'name', 'description', 'email', 'phone', 'address', 'website', 'isActive', 'createdAt']
    });

    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }

    res.json({ association });

  } catch (error) {
    console.error('Get association error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch association',
      message: error.message 
    });
  }
});

// PUT /api/associations/:id - Update association (authenticated, same association or admin)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const association = await Association.findByPk(req.params.id);

    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }

    // Check if user belongs to this association (unless admin)
    if (req.user.role !== 'admin' && req.user.associationId !== association.id) {
      return res.status(403).json({ 
        error: 'Access denied - different association' 
      });
    }

    const {
      name,
      description,
      email,
      phone,
      address,
      website,
      isActive
    } = req.body;

    // Only admins can change isActive status
    const updateData = {
      name,
      description,
      email,
      phone,
      address,
      website
    };

    if (req.user.role === 'admin' && typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }

    await association.update(updateData);

    res.json({
      message: 'Association updated successfully',
      association
    });

  } catch (error) {
    console.error('Update association error:', error);
    res.status(400).json({ 
      error: 'Failed to update association',
      details: error.message 
    });
  }
});

// GET /api/associations/:id/stats - Get association statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const associationId = req.params.id;

    // Check if user belongs to this association (unless admin)
    if (req.user.role !== 'admin' && req.user.associationId !== associationId) {
      return res.status(403).json({ 
        error: 'Access denied - different association' 
      });
    }

    const association = await Association.findByPk(associationId);
    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }

    // Get statistics
    const [
      totalUsers,
      activeUsers,
      totalActions,
      completedActions,
      plannedActions
    ] = await Promise.all([
      User.count({ where: { associationId } }),
      User.count({ where: { associationId, isActive: true } }),
      MaraudeAction.count({ where: { associationId } }),
      MaraudeAction.count({ where: { associationId, status: 'completed' } }),
      MaraudeAction.count({ where: { associationId, status: 'planned' } })
    ]);

    res.json({
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        actions: {
          total: totalActions,
          completed: completedActions,
          planned: plannedActions,
          in_progress: totalActions - completedActions - plannedActions
        }
      }
    });

  } catch (error) {
    console.error('Get association stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch association statistics',
      details: error.message 
    });
  }
});

module.exports = router;
