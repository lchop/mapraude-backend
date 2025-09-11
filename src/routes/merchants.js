const express = require('express');
const { Op } = require('sequelize');
const { Merchant, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/merchants - Get all merchants (public)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      services,
      verified,
      active = 'true',
      lat,
      lng,
      radius = 10, // km
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Filter by active status
    if (active !== 'all') {
      whereClause.isActive = active === 'true';
    }

    // Filter by verified status
    if (verified !== undefined) {
      whereClause.isVerified = verified === 'true';
    }

    // Filter by category
    if (category) {
      whereClause.category = category;
    }

    // Filter by services (array of services)
    if (services) {
      const serviceArray = services.split(',').map(s => s.trim());
      whereClause.services = {
        [Op.overlap]: serviceArray
      };
    }

    // Search by name or description
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Filter by location (if lat/lng provided)
    if (lat && lng) {
      const latRadius = radius / 111;
      const lngRadius = radius / (111 * Math.cos(lat * Math.PI / 180));
      
      whereClause.latitude = {
        [Op.between]: [parseFloat(lat) - latRadius, parseFloat(lat) + latRadius]
      };
      whereClause.longitude = {
        [Op.between]: [parseFloat(lng) - lngRadius, parseFloat(lng) + lngRadius]
      };
    }

    const { count, rows: merchants } = await Merchant.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['name', 'ASC']]
    });

    res.json({
      merchants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get merchants error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch merchants',
      details: error.message 
    });
  }
});

// GET /api/merchants/:id - Get specific merchant (public)
router.get('/:id', async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json({ merchant });

  } catch (error) {
    console.error('Get merchant error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch merchant',
      details: error.message 
    });
  }
});

// POST /api/merchants - Create new merchant
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      services,
      latitude,
      longitude,
      address,
      phone,
      email,
      website,
      openingHours,
      specialInstructions,
      contactPerson
    } = req.body;

    // Check if merchant with same name and address exists
    const existingMerchant = await Merchant.findOne({
      where: {
        name,
        address
      }
    });

    if (existingMerchant) {
      return res.status(409).json({ 
        error: 'Merchant already exists at this location' 
      });
    }

    const merchant = await Merchant.create({
      name,
      description,
      category,
      services: services || [],
      latitude,
      longitude,
      address,
      phone,
      email,
      website,
      openingHours,
      specialInstructions,
      contactPerson,
      addedBy: req.user.id,
      isVerified: false, // New merchants need verification
      isActive: true
    });

    // Fetch the created merchant with user info
    const createdMerchant = await Merchant.findByPk(merchant.id, {
      include: [
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    res.status(201).json({
      message: 'Merchant created successfully',
      merchant: createdMerchant
    });

  } catch (error) {
    console.error('Create merchant error:', error);
    res.status(400).json({ 
      error: 'Failed to create merchant',
      details: error.message 
    });
  }
});

// PUT /api/merchants/:id - Update merchant
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Check permissions: creator or coordinator/admin
    const canEdit = (
      merchant.addedBy === req.user.id ||
      ['coordinator', 'admin'].includes(req.user.role)
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      name,
      description,
      category,
      services,
      latitude,
      longitude,
      address,
      phone,
      email,
      website,
      openingHours,
      specialInstructions,
      contactPerson,
      isVerified,
      isActive
    } = req.body;

    const updateData = {
      name,
      description,
      category,
      services,
      latitude,
      longitude,
      address,
      phone,
      email,
      website,
      openingHours,
      specialInstructions,
      contactPerson
    };

    // Only coordinators/admins can change verification and active status
    if (['coordinator', 'admin'].includes(req.user.role)) {
      if (typeof isVerified === 'boolean') {
        updateData.isVerified = isVerified;
      }
      if (typeof isActive === 'boolean') {
        updateData.isActive = isActive;
      }
    }

    await merchant.update(updateData);

    // Fetch updated merchant with user info
    const updatedMerchant = await Merchant.findByPk(merchant.id, {
      include: [
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    res.json({
      message: 'Merchant updated successfully',
      merchant: updatedMerchant
    });

  } catch (error) {
    console.error('Update merchant error:', error);
    res.status(400).json({ 
      error: 'Failed to update merchant',
      details: error.message 
    });
  }
});

// DELETE /api/merchants/:id - Delete merchant
router.delete('/:id', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Check permissions: creator, coordinator, or admin
    const canDelete = (
      merchant.addedBy === req.user.id ||
      ['coordinator', 'admin'].includes(req.user.role)
    );

    if (!canDelete) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await merchant.destroy();

    res.json({
      message: 'Merchant deleted successfully'
    });

  } catch (error) {
    console.error('Delete merchant error:', error);
    res.status(500).json({ 
      error: 'Failed to delete merchant',
      details: error.message 
    });
  }
});

// GET /api/merchants/categories/list - Get available categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = [
      'restaurant',
      'cafe', 
      'bakery',
      'pharmacy',
      'clothing_store',
      'supermarket',
      'laundromat',
      'health_center',
      'other'
    ];

    res.json({ categories });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch categories',
      details: error.message 
    });
  }
});

// GET /api/merchants/services/list - Get available services
router.get('/services/list', async (req, res) => {
  try {
    const services = [
      'free_coffee',
      'free_meal',
      'shower',
      'restroom',
      'wifi',
      'phone_charging',
      'clothing_donation',
      'hygiene_kit',
      'first_aid',
      'information',
      'temporary_shelter',
      'food_distribution',
      'medical_consultation'
    ];

    res.json({ services });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch services',
      details: error.message 
    });
  }
});

// GET /api/merchants/nearby - Get merchants near a location
router.get('/nearby/:lat/:lng', async (req, res) => {
  try {
    const { lat, lng } = req.params;
    const { radius = 5, services, category } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const whereClause = {
      isActive: true,
      isVerified: true
    };

    // Filter by location
    const latRadius = radius / 111;
    const lngRadius = radius / (111 * Math.cos(lat * Math.PI / 180));
    
    whereClause.latitude = {
      [Op.between]: [parseFloat(lat) - latRadius, parseFloat(lat) + latRadius]
    };
    whereClause.longitude = {
      [Op.between]: [parseFloat(lng) - lngRadius, parseFloat(lng) + lngRadius]
    };

    // Filter by category
    if (category) {
      whereClause.category = category;
    }

    // Filter by services
    if (services) {
      const serviceArray = services.split(',').map(s => s.trim());
      whereClause.services = {
        [Op.overlap]: serviceArray
      };
    }

    const merchants = await Merchant.findAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'category', 'services', 'latitude', 
        'longitude', 'address', 'phone', 'openingHours'
      ],
      order: [['name', 'ASC']],
      limit: 50
    });

    res.json({
      merchants,
      location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      radius: parseFloat(radius),
      count: merchants.length
    });

  } catch (error) {
    console.error('Get nearby merchants error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch nearby merchants',
      details: error.message 
    });
  }
});

// POST /api/merchants/:id/verify - Verify merchant (coordinators/admins only)
router.post('/:id/verify', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await merchant.update({ isVerified: true });

    res.json({
      message: 'Merchant verified successfully',
      merchant
    });

  } catch (error) {
    console.error('Verify merchant error:', error);
    res.status(500).json({ 
      error: 'Failed to verify merchant',
      details: error.message 
    });
  }
});

module.exports = router;