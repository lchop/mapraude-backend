// src/routes/maraudes.js - Complete file
const express = require('express');
const { Op } = require('sequelize');
const { MaraudeAction, Association, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/maraudes - Get all maraude actions (updated for weekly)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      associationId,
      dayOfWeek,
      isRecurring,
      isActive = 'true'
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Filter by status
    if (status) {
      whereClause.status = status;
    }

    // Filter by association
    if (associationId) {
      whereClause.associationId = associationId;
    }

    // Filter by day of week
    if (dayOfWeek) {
      whereClause.dayOfWeek = parseInt(dayOfWeek);
    }

    // Filter by recurring
    if (isRecurring !== undefined) {
      whereClause.isRecurring = isRecurring === 'true';
    }

    // Filter by active status
    if (isActive !== 'all') {
      whereClause.isActive = isActive === 'true';
    }

    const { count, rows: actions } = await MaraudeAction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
    });

    // Add computed fields for each action
    const actionsWithMetadata = actions.map(action => {
      const actionData = action.toJSON();
      actionData.nextOccurrence = action.getNextOccurrence();
      actionData.isHappeningToday = action.isHappeningToday();
      actionData.dayName = action.getDayName();
      return actionData;
    });

    res.json({
      actions: actionsWithMetadata,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get maraudes error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch maraude actions',
      details: error.message 
    });
  }
});

// GET /api/maraudes/:id - Get specific maraude action
router.get('/:id', async (req, res) => {
  try {
    const action = await MaraudeAction.findByPk(req.params.id, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    // Add computed fields
    const actionData = action.toJSON();
    actionData.nextOccurrence = action.getNextOccurrence();
    actionData.isHappeningToday = action.isHappeningToday();
    actionData.dayName = action.getDayName();

    res.json({ action: actionData });

  } catch (error) {
    console.error('Get maraude error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch maraude action',
      details: error.message 
    });
  }
});

// GET /api/maraudes/today/active - Get today's active maraudes (UPDATED)
router.get('/today/active', async (req, res) => {
  try {
    const today = new Date();
    const todayISO = today.getDay() === 0 ? 7 : today.getDay(); // Convert to ISO day

    const actions = await MaraudeAction.findAll({
      where: {
        [Op.and]: [
          { isActive: true },
          {
            [Op.or]: [
              // Recurring maraudes happening today
              {
                isRecurring: true,
                dayOfWeek: todayISO
              },
              // One-time events scheduled for today
              {
                isRecurring: false,
                scheduledDate: today.toISOString().split('T')[0]
              }
            ]
          }
        ]
      },
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['startTime', 'ASC']]
    });

    // Add computed fields for each action
    const actionsWithMetadata = actions.map(action => {
      const actionData = action.toJSON();
      actionData.nextOccurrence = action.getNextOccurrence();
      actionData.isHappeningToday = action.isHappeningToday();
      actionData.dayName = action.getDayName();
      return actionData;
    });

    res.json({
      actions: actionsWithMetadata,
      count: actions.length,
      date: today.toISOString().split('T')[0],
      currentDayOfWeek: todayISO,
      currentDayName: ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][todayISO]
    });

  } catch (error) {
    console.error('Get today active maraudes error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch today\'s active maraudes',
      details: error.message 
    });
  }
});

// NEW: GET /api/maraudes/weekly-schedule - Get this week's full schedule
router.get('/weekly-schedule', async (req, res) => {
  try {
    const recurringActions = await MaraudeAction.findAll({
      where: {
        isRecurring: true,
        isActive: true
      },
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
    });

    // Organize by day of week
    const weeklySchedule = {
      1: [], // Lundi
      2: [], // Mardi
      3: [], // Mercredi
      4: [], // Jeudi
      5: [], // Vendredi
      6: [], // Samedi
      7: []  // Dimanche
    };

    recurringActions.forEach(action => {
      const actionData = action.toJSON();
      actionData.nextOccurrence = action.getNextOccurrence();
      actionData.dayName = action.getDayName();
      actionData.isHappeningToday = action.isHappeningToday();
      weeklySchedule[action.dayOfWeek].push(actionData);
    });

    res.json({
      weeklySchedule,
      days: [
        { value: 1, name: 'Lundi', short: 'Lun' },
        { value: 2, name: 'Mardi', short: 'Mar' },
        { value: 3, name: 'Mercredi', short: 'Mer' },
        { value: 4, name: 'Jeudi', short: 'Jeu' },
        { value: 5, name: 'Vendredi', short: 'Ven' },
        { value: 6, name: 'Samedi', short: 'Sam' },
        { value: 7, name: 'Dimanche', short: 'Dim' }
      ]
    });

  } catch (error) {
    console.error('Get weekly schedule error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch weekly schedule',
      details: error.message 
    });
  }
});

// POST /api/maraudes - Create new maraude action (UPDATED for weekly)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      latitude,
      longitude,
      address,
      dayOfWeek,
      isRecurring = true,
      scheduledDate,
      startTime,
      endTime,
      participantsCount,
      notes
    } = req.body;

    // Validation
    if (isRecurring && (dayOfWeek === null || dayOfWeek === undefined)) {
      return res.status(400).json({ 
        error: 'dayOfWeek is required for recurring maraudes' 
      });
    }

    if (!isRecurring && !scheduledDate) {
      return res.status(400).json({ 
        error: 'scheduledDate is required for one-time maraudes' 
      });
    }

    const action = await MaraudeAction.create({
      title,
      description,
      latitude,
      longitude,
      address,
      dayOfWeek: isRecurring ? dayOfWeek : null,
      isRecurring,
      scheduledDate: !isRecurring ? scheduledDate : null,
      startTime,
      endTime,
      participantsCount,
      notes,
      createdBy: req.user.id,
      associationId: req.user.associationId,
      status: 'planned',
      isActive: true
    });

    // Fetch the created action with associations
    const createdAction = await MaraudeAction.findByPk(action.id, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    // Add computed fields
    const actionData = createdAction.toJSON();
    actionData.nextOccurrence = createdAction.getNextOccurrence();
    actionData.dayName = createdAction.getDayName();
    actionData.isHappeningToday = createdAction.isHappeningToday();

    res.status(201).json({
      message: 'Maraude action created successfully',
      action: actionData
    });

  } catch (error) {
    console.error('Create maraude error:', error);
    res.status(400).json({ 
      error: 'Failed to create maraude action',
      details: error.message 
    });
  }
});

// PUT /api/maraudes/:id - Update maraude action
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const action = await MaraudeAction.findByPk(req.params.id);

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    // Check permissions: creator, coordinator/admin of same association
    const canEdit = (
      action.createdBy === req.user.id ||
      (req.user.associationId === action.associationId && 
       ['coordinator', 'admin'].includes(req.user.role))
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      title,
      description,
      latitude,
      longitude,
      address,
      dayOfWeek,
      isRecurring,
      scheduledDate,
      startTime,
      endTime,
      status,
      participantsCount,
      beneficiariesHelped,
      materialsDistributed,
      notes,
      isActive
    } = req.body;

    // Validation for weekly updates
    if (isRecurring !== undefined && isRecurring && (dayOfWeek === null || dayOfWeek === undefined)) {
      return res.status(400).json({ 
        error: 'dayOfWeek is required for recurring maraudes' 
      });
    }

    if (isRecurring !== undefined && !isRecurring && !scheduledDate) {
      return res.status(400).json({ 
        error: 'scheduledDate is required for one-time maraudes' 
      });
    }

    const updateData = {
      title,
      description,
      latitude,
      longitude,
      address,
      startTime,
      endTime,
      status,
      participantsCount,
      beneficiariesHelped,
      materialsDistributed,
      notes
    };

    // Handle weekly schedule updates
    if (isRecurring !== undefined) {
      updateData.isRecurring = isRecurring;
      updateData.dayOfWeek = isRecurring ? dayOfWeek : null;
      updateData.scheduledDate = !isRecurring ? scheduledDate : null;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    await action.update(updateData);

    // Fetch updated action with associations
    const updatedAction = await MaraudeAction.findByPk(action.id, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    // Add computed fields
    const actionData = updatedAction.toJSON();
    actionData.nextOccurrence = updatedAction.getNextOccurrence();
    actionData.dayName = updatedAction.getDayName();
    actionData.isHappeningToday = updatedAction.isHappeningToday();

    res.json({
      message: 'Maraude action updated successfully',
      action: actionData
    });

  } catch (error) {
    console.error('Update maraude error:', error);
    res.status(400).json({ 
      error: 'Failed to update maraude action',
      details: error.message 
    });
  }
});

// DELETE /api/maraudes/:id - Delete maraude action
router.delete('/:id', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const action = await MaraudeAction.findByPk(req.params.id);

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    // Check if user belongs to same association (unless admin)
    if (req.user.role !== 'admin' && req.user.associationId !== action.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await action.destroy();

    res.json({
      message: 'Maraude action deleted successfully'
    });

  } catch (error) {
    console.error('Delete maraude error:', error);
    res.status(500).json({ 
      error: 'Failed to delete maraude action',
      details: error.message 
    });
  }
});

// PATCH /api/maraudes/:id/toggle - Toggle active status (NEW)
router.patch('/:id/toggle', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const action = await MaraudeAction.findByPk(req.params.id);

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    // Check if user belongs to same association (unless admin)
    if (req.user.role !== 'admin' && req.user.associationId !== action.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await action.update({ isActive: !action.isActive });

    // Fetch updated action with computed fields
    const actionData = action.toJSON();
    actionData.nextOccurrence = action.getNextOccurrence();
    actionData.dayName = action.getDayName();
    actionData.isHappeningToday = action.isHappeningToday();

    res.json({
      message: `Maraude action ${action.isActive ? 'activated' : 'deactivated'} successfully`,
      action: actionData
    });

  } catch (error) {
    console.error('Toggle maraude error:', error);
    res.status(500).json({ 
      error: 'Failed to toggle maraude action',
      details: error.message 
    });
  }
});

module.exports = router;