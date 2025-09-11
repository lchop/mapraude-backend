const express = require('express');
const { User, Association, MaraudeAction } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - Get users (admin/coordinator only)
router.get('/', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      active = 'true', 
      associationId 
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Filter by role
    if (role) {
      whereClause.role = role;
    }

    // Filter by active status
    if (active !== 'all') {
      whereClause.isActive = active === 'true';
    }

    // Filter by association (admins can see all, coordinators only their own)
    if (req.user.role === 'admin') {
      if (associationId) {
        whereClause.associationId = associationId;
      }
    } else {
      // Coordinators can only see users from their association
      whereClause.associationId = req.user.associationId;
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        }
      ],
      attributes: { exclude: ['password'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users',
      details: error.message 
    });
  }
});

// GET /api/users/:id - Get specific user
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can view their own profile, coordinators/admins can view users in their association
    const canView = (
      userId === req.user.id ||
      ['coordinator', 'admin'].includes(req.user.role)
    );

    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findByPk(userId, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: MaraudeAction,
          as: 'maraudeActions',
          attributes: ['id', 'title', 'scheduledDate', 'status'],
          limit: 10,
          order: [['scheduledDate', 'DESC']]
        }
      ],
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Non-admins can only view users from same association
    if (req.user.role !== 'admin' && 
        req.user.associationId !== user.associationId &&
        userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied - different association' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user',
      details: error.message 
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions
    const canEdit = (
      userId === req.user.id || // Own profile
      (req.user.role === 'coordinator' && req.user.associationId === user.associationId) ||
      req.user.role === 'admin'
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      isActive
    } = req.body;

    const updateData = {
      firstName,
      lastName,
      email,
      phone
    };

    // Only coordinators/admins can change role and active status
    if (['coordinator', 'admin'].includes(req.user.role) && userId !== req.user.id) {
      if (role && ['volunteer', 'coordinator', 'admin'].includes(role)) {
        updateData.role = role;
      }
      if (typeof isActive === 'boolean') {
        updateData.isActive = isActive;
      }
    }

    await user.update(updateData);

    // Fetch updated user
    const updatedUser = await User.findByPk(userId, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        }
      ],
      attributes: { exclude: ['password'] }
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({ 
      error: 'Failed to update user',
      details: error.message 
    });
  }
});

// PUT /api/users/:id/password - Change user password
router.put('/:id/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters long' 
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only users can change their own password (for security)
    if (userId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Can only change your own password' 
      });
    }

    // Verify current password
    const isValidPassword = await user.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password (will be hashed by the model hook)
    await user.update({ password: newPassword });

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Failed to change password',
      details: error.message 
    });
  }
});

// DELETE /api/users/:id - Deactivate user (soft delete)
router.delete('/:id', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions
    const canDelete = (
      (req.user.role === 'coordinator' && req.user.associationId === user.associationId) ||
      req.user.role === 'admin'
    );

    if (!canDelete) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Don't allow users to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ 
        error: 'Cannot delete your own account' 
      });
    }

    // Soft delete - just set isActive to false
    await user.update({ isActive: false });

    res.json({
      message: 'User deactivated successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      error: 'Failed to deactivate user',
      details: error.message 
    });
  }
});

// GET /api/users/:id/stats - Get user statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Check permissions
    const canView = (
      userId === req.user.id ||
      ['coordinator', 'admin'].includes(req.user.role)
    );

    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Non-admins can only view users from same association
    if (req.user.role !== 'admin' && 
        req.user.associationId !== user.associationId &&
        userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied - different association' });
    }

    // Get user statistics
    const [
      totalActions,
      completedActions,
      plannedActions,
      inProgressActions
    ] = await Promise.all([
      MaraudeAction.count({ where: { createdBy: userId } }),
      MaraudeAction.count({ where: { createdBy: userId, status: 'completed' } }),
      MaraudeAction.count({ where: { createdBy: userId, status: 'planned' } }),
      MaraudeAction.count({ where: { createdBy: userId, status: 'in_progress' } })
    ]);

    res.json({
      stats: {
        actions: {
          total: totalActions,
          completed: completedActions,
          planned: plannedActions,
          in_progress: inProgressActions,
          cancelled: totalActions - completedActions - plannedActions - inProgressActions
        }
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user statistics',
      details: error.message 
    });
  }
});

module.exports = router;