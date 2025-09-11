const express = require('express');
const { Association, User, MaraudeAction } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/associations - Get all associations (public)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, active = 'true' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (active !== 'all') {
      whereClause.isActive = active === 'true';
    }

    const { count, rows: associations } = await Association.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: { exclude: ['createdAt', 'updatedAt'] },
      order: [['name', 'ASC']]
    });

    res.json({
      associations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get associations error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch associations',
      details: error.message 
    });
  }
});

// GET /api/associations/:id - Get association by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const association = await Association.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'firstName', 'lastName', 'role', 'isActive'],
          where: { isActive: true },
          required: false
        },
        {
          model: MaraudeAction,
          as: 'maraudeActions',
          attributes: ['id', 'title', 'scheduledDate', 'status'],
          where: { status: ['planned', 'in_progress'] },
          required: false,
          limit: 5,
          order: [['scheduledDate', 'ASC']]
        }
      ]
    });

    if (!association) {
      return res.status(404).json({ error: 'Association not found' });
    }

    res.json({ association });

  } catch (error) {
    console.error('Get association error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch association',
      details: error.message 
    });
  }
});

// POST /api/associations - Create new association (admin only or public registration)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      phone,
      address,
      website
    } = req.body;

    // Check if association with same email exists
    const existingAssociation = await Association.findOne({ 
      where: { email } 
    });

    if (existingAssociation) {
      return res.status(409).json({ 
        error: 'Association already exists with this email' 
      });
    }

    const association = await Association.create({
      name,
      description,
      email,
      phone,
      address,
      website,
      isActive: false // New associations need approval
    });

    res.status(201).json({
      message: 'Association created successfully',
      association
    });

  } catch (error) {
    console.error('Create association error:', error);
    res.status(400).json({ 
      error: 'Failed to create association',
      details: error.message 
    });
  }
});

// PUT /api/associations/:id - Update association
router.put('/:id', authenticateToken, requireRole('admin', 'coordinator'), async (req, res) => {
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