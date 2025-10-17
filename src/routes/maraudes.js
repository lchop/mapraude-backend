// src/routes/maraudes.js - Fixed route order with admin association support
const express = require('express');
const { Op } = require('sequelize');
const { MaraudeAction, Association, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// IMPORTANT: Specific routes MUST come before general patterns like /:id

// GET /api/maraudes/today/active - MOVED UP
router.get('/today/active', async (req, res) => {
  try {
    const today = new Date();
    const todayISO = today.getDay() === 0 ? 7 : today.getDay();

    const actions = await MaraudeAction.findAll({
      where: {
        [Op.and]: [
          { isActive: true },
          {
            [Op.or]: [
              {
                isRecurring: true,
                dayOfWeek: todayISO
              },
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

// GET /api/maraudes/weekly-schedule - MOVED UP
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

    const weeklySchedule = {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: []
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

// GET /api/maraudes/:id - Get specific maraude (MOVED AFTER specific routes)
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

// GET /api/maraudes - Get all maraude actions (MOVED AFTER /:id)
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

    if (status) {
      whereClause.status = status;
    }
    if (associationId) {
      whereClause.associationId = associationId;
    }
    if (dayOfWeek) {
      whereClause.dayOfWeek = parseInt(dayOfWeek);
    }
    if (isRecurring !== undefined) {
      whereClause.isRecurring = isRecurring === 'true';
    }
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

// POST /api/maraudes - Create new maraude action (FIXED FOR ADMIN ASSOCIATION)
router.post('/', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  console.log('📝 POST /api/maraudes - Create request');
  console.log('👤 User:', { id: req.user.id, role: req.user.role, associationId: req.user.associationId });
  console.log('📦 Body:', req.body);

  try {
    const {
      title,
      description,
      startLatitude,
      startLongitude,
      startAddress,
      waypoints,
      estimatedDistance,
      estimatedDuration,
      routePolyline,
      dayOfWeek,
      isRecurring = true,
      scheduledDate,
      startTime,
      endTime,
      participantsCount,
      notes,
      associationId // NEW: Association ID from request body
    } = req.body;

    // Validation
    if (!title || startLatitude === undefined || startLongitude === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, startLatitude, startLongitude' 
      });
    }

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

    // ============================================
    // NEW: Determine which associationId to use
    // ============================================
    let targetAssociationId;
    
    if (req.user.role === 'admin') {
      // Admin can specify association OR use their own
      if (associationId) {
        // Verify the association exists
        const associationExists = await Association.findByPk(associationId);
        
        if (!associationExists) {
          return res.status(400).json({ 
            error: 'Association not found' 
          });
        }
        
        targetAssociationId = associationId;
        console.log('✅ Admin selected association:', targetAssociationId);
      } else {
        // If admin doesn't specify, use their own (if they have one)
        targetAssociationId = req.user.associationId;
        console.log('ℹ️ Admin using own association:', targetAssociationId);
      }
    } else {
      // Non-admin users MUST use their own association
      if (!req.user.associationId) {
        return res.status(400).json({ 
          error: 'User must be associated with an organization' 
        });
      }
      
      targetAssociationId = req.user.associationId;
      console.log('👤 User using own association:', targetAssociationId);
    }

    // Validate associationId is present
    if (!targetAssociationId) {
      return res.status(400).json({ 
        error: 'Association ID is required' 
      });
    }

    // Prepare waypoints
    let parsedWaypoints = [];
    if (waypoints) {
      try {
        parsedWaypoints = typeof waypoints === 'string' ? JSON.parse(waypoints) : waypoints;
        if (!Array.isArray(parsedWaypoints)) {
          parsedWaypoints = [];
        }
        console.log('📍 Parsed waypoints:', parsedWaypoints.length, 'points');
      } catch (error) {
        console.error('⚠️ Error parsing waypoints:', error);
        parsedWaypoints = [];
      }
    }

    // Clean data for database
    const cleanData = {
      title,
      description: description?.trim() || null,
      startLatitude,
      startLongitude,
      startAddress: startAddress?.trim() || null,
      waypoints: parsedWaypoints,
      estimatedDistance: estimatedDistance || null,
      estimatedDuration: estimatedDuration || null,
      routePolyline: routePolyline || null,
      dayOfWeek: isRecurring ? dayOfWeek : null,
      isRecurring,
      scheduledDate: !isRecurring ? scheduledDate : null,
      startTime,
      endTime: endTime?.trim() || null,
      participantsCount: participantsCount || 0,
      notes: notes?.trim() || null,
      createdBy: req.user.id,
      associationId: targetAssociationId, // Use the determined association ID
      status: 'planned',
      isActive: true
    };

    console.log('💾 Creating with data:', cleanData);

    const action = await MaraudeAction.create(cleanData);

    const createdAction = await MaraudeAction.findByPk(action.id, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name', 'email']
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

    console.log('✅ Maraude created successfully with association:', actionData.associationId);

    res.status(201).json({
      message: 'Maraude action created successfully',
      action: actionData
    });

  } catch (error) {
    console.error('❌ Create maraude error:', error);
    res.status(400).json({ 
      error: 'Failed to create maraude action',
      details: error.message 
    });
  }
});

// PUT /api/maraudes/:id - Update maraude action (FIXED for admin association)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 PUT /api/maraudes/:id - Update request');
    console.log('👤 User:', { id: req.user.id, role: req.user.role });
    console.log('📦 Body:', req.body);

    const action = await MaraudeAction.findByPk(req.params.id);

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    // Check permissions
    const canEdit = (
      action.createdBy === req.user.id ||
      (req.user.associationId === action.associationId && 
       ['coordinator', 'admin'].includes(req.user.role)) ||
      req.user.role === 'admin' // Admin can edit any maraude
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      title, description, 
      startLatitude, startLongitude, startAddress, waypoints,
      estimatedDistance, estimatedDuration, routePolyline,
      dayOfWeek, isRecurring, scheduledDate, startTime, endTime, 
      status, participantsCount, beneficiariesHelped, materialsDistributed,
      notes, isActive,
      associationId // NEW: Allow admin to change association
    } = req.body;

    // Validation
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

    // Build update data object
    const updateData = {};

    // Basic fields
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (notes !== undefined) updateData.notes = notes;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (status !== undefined) updateData.status = status;
    if (participantsCount !== undefined) updateData.participantsCount = participantsCount;
    if (beneficiariesHelped !== undefined) updateData.beneficiariesHelped = beneficiariesHelped;
    if (materialsDistributed !== undefined) updateData.materialsDistributed = materialsDistributed;

    // Route planning fields
    if (startLatitude !== undefined) updateData.startLatitude = startLatitude;
    if (startLongitude !== undefined) updateData.startLongitude = startLongitude;
    if (startAddress !== undefined) updateData.startAddress = startAddress;
    if (waypoints !== undefined) updateData.waypoints = waypoints;
    if (estimatedDistance !== undefined) updateData.estimatedDistance = estimatedDistance;
    if (estimatedDuration !== undefined) updateData.estimatedDuration = estimatedDuration;
    if (routePolyline !== undefined) updateData.routePolyline = routePolyline;

    // Scheduling updates
    if (isRecurring !== undefined) {
      updateData.isRecurring = isRecurring;
      updateData.dayOfWeek = isRecurring ? dayOfWeek : null;
      updateData.scheduledDate = !isRecurring ? scheduledDate : null;
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    // NEW: Allow admin to change association
    if (associationId !== undefined && req.user.role === 'admin') {
      // Verify the association exists
      const associationExists = await Association.findByPk(associationId);
      
      if (!associationExists) {
        return res.status(400).json({ 
          error: 'Association not found' 
        });
      }
      
      updateData.associationId = associationId;
      console.log('✅ Admin changing association to:', associationId);
    }

    console.log('🔧 Applying update:', updateData);

    await action.update(updateData);

    const updatedAction = await MaraudeAction.findByPk(action.id, {
      include: [
        {
          model: Association,
          as: 'association',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    const actionData = updatedAction.toJSON();
    actionData.nextOccurrence = updatedAction.getNextOccurrence();
    actionData.dayName = updatedAction.getDayName();
    actionData.isHappeningToday = updatedAction.isHappeningToday();

    console.log('✅ Maraude updated successfully');

    res.json({
      message: 'Maraude action updated successfully',
      action: actionData
    });

  } catch (error) {
    console.error('❌ Update maraude error:', error);
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

// PATCH /api/maraudes/:id/toggle - Toggle active status
router.patch('/:id/toggle', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const action = await MaraudeAction.findByPk(req.params.id);

    if (!action) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    if (req.user.role !== 'admin' && req.user.associationId !== action.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await action.update({ isActive: !action.isActive });

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
