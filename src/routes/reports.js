// src/routes/reports.js
const express = require('express');
const { Op } = require('sequelize');
const { 
  MaraudeReport, 
  ReportDistribution, 
  ReportAlert,
  DistributionType,
  MaraudeAction,
  User,
  Association
} = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendReportEmail } = require('../services/emailService');

const router = express.Router();

// GET /api/reports/distribution-types - Get all distribution types
router.get('/distribution-types', async (req, res) => {
  try {
    const types = await DistributionType.findAll({
      where: { isActive: true },
      order: [['category', 'ASC'], ['name', 'ASC']]
    });

    // Group by category for easier frontend use
    const groupedTypes = types.reduce((acc, type) => {
      if (!acc[type.category]) {
        acc[type.category] = [];
      }
      acc[type.category].push(type);
      return acc;
    }, {});

    res.json({
      types,
      grouped: groupedTypes,
      categories: {
        meal: 'Alimentation',
        hygiene: 'Hygiène',
        clothing: 'Vêtements',
        medical: 'Médical',
        other: 'Autres services'
      }
    });
  } catch (error) {
    console.error('Get distribution types error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch distribution types',
      details: error.message 
    });
  }
});

// GET /api/reports - Get all reports (with filters)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      maraudeActionId,
      hasAlerts
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Filter by association (non-admins only see their association's reports)
    if (req.user.role !== 'admin') {
      whereClause['$maraudeAction.associationId$'] = req.user.associationId;
    }

    // Filter by status
    if (status) {
      whereClause.status = status;
    }

    // Filter by date range
    if (startDate && endDate) {
      whereClause.reportDate = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Filter by maraude action
    if (maraudeActionId) {
      whereClause.maraudeActionId = maraudeActionId;
    }

    // Filter by alerts
    if (hasAlerts !== undefined) {
      whereClause.hasUrgentSituations = hasAlerts === 'true';
    }

    const { count, rows: reports } = await MaraudeReport.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          attributes: ['id', 'title', 'address', 'associationId'],
          include: [
            {
              model: Association,
              as: 'association',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'validator',
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [
            {
              model: DistributionType,
              as: 'distributionType',
              attributes: ['id', 'name', 'category', 'icon', 'color']
            }
          ]
        },
        {
          model: ReportAlert,
          as: 'alerts',
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['reportDate', 'DESC'], ['createdAt', 'DESC']],
      distinct: true
    });

    res.json({
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch reports',
      details: error.message 
    });
  }
});

// GET /api/reports/:id - Get specific report
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          include: [
            {
              model: Association,
              as: 'association'
            }
          ]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'validator',
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [
            {
              model: DistributionType,
              as: 'distributionType'
            }
          ]
        },
        {
          model: ReportAlert,
          as: 'alerts'
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        report.maraudeAction.associationId !== req.user.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Add computed fields
    const reportData = report.toJSON();
    reportData.duration = report.calculateDuration();
    reportData.summary = report.getSummary();

    res.json({ report: reportData });

  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report',
      details: error.message 
    });
  }
});

// POST /api/reports - Create new report
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      maraudeActionId,
      reportDate,
      startTime,
      endTime,
      weatherConditions,
      temperature,
      beneficiariesCount,
      volunteersCount,
      newBeneficiariesCount,
      routeDescription,
      routeCoordinates,
      distanceCovered,
      generalNotes,
      difficultiesEncountered,
      positivePoints,
      distributions, // Array of { distributionTypeId, quantity, notes }
      alerts, // Array of alert objects
      urgentSituationsDetails
    } = req.body;

    // Verify the maraude action exists and user has permission
    const maraudeAction = await MaraudeAction.findByPk(maraudeActionId);
    if (!maraudeAction) {
      return res.status(404).json({ error: 'Maraude action not found' });
    }

    if (req.user.role !== 'admin' && 
        maraudeAction.associationId !== req.user.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if report already exists for this date and maraude
    const existingReport = await MaraudeReport.findOne({
      where: {
        maraudeActionId,
        reportDate
      }
    });

    if (existingReport) {
      return res.status(409).json({ 
        error: 'Un compte-rendu existe déjà pour cette maraude à cette date' 
      });
    }

    // Create the report
    const report = await MaraudeReport.create({
      maraudeActionId,
      reportDate,
      startTime,
      endTime,
      weatherConditions,
      temperature,
      beneficiariesCount,
      volunteersCount,
      newBeneficiariesCount,
      routeDescription,
      routeCoordinates,
      distanceCovered,
      generalNotes,
      difficultiesEncountered,
      positivePoints,
      hasUrgentSituations: (alerts && alerts.length > 0) || !!urgentSituationsDetails,
      urgentSituationsDetails,
      createdBy: req.user.id,
      status: 'draft'
    });

    // Create distributions
    if (distributions && distributions.length > 0) {
      const distributionPromises = distributions.map(dist => 
        ReportDistribution.create({
          reportId: report.id,
          distributionTypeId: dist.distributionTypeId,
          quantity: dist.quantity,
          notes: dist.notes
        })
      );
      await Promise.all(distributionPromises);
    }

    // Create alerts
    if (alerts && alerts.length > 0) {
      const alertPromises = alerts.map(alert =>
        ReportAlert.create({
          reportId: report.id,
          alertType: alert.alertType,
          severity: alert.severity,
          locationLatitude: alert.locationLatitude,
          locationLongitude: alert.locationLongitude,
          locationAddress: alert.locationAddress,
          personDescription: alert.personDescription,
          situationDescription: alert.situationDescription,
          actionTaken: alert.actionTaken,
          followUpRequired: alert.followUpRequired,
          followUpNotes: alert.followUpNotes
        })
      );
      await Promise.all(alertPromises);
    }

    // Fetch the complete report with associations
    const completeReport = await MaraudeReport.findByPk(report.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          include: [{ model: Association, as: 'association' }]
        },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName'] },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [{ model: DistributionType, as: 'distributionType' }]
        },
        { model: ReportAlert, as: 'alerts' }
      ]
    });

    res.status(201).json({
      message: 'Report created successfully',
      report: completeReport
    });

  } catch (error) {
    console.error('Create report error:', error);
    res.status(400).json({ 
      error: 'Failed to create report',
      details: error.message 
    });
  }
});

// PUT /api/reports/:id - Update report
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction'
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions
    const canEdit = (
      report.createdBy === req.user.id ||
      (req.user.associationId === report.maraudeAction.associationId && 
       ['coordinator', 'admin'].includes(req.user.role))
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Don't allow editing validated reports unless admin
    if (report.status === 'validated' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Cannot edit validated report' 
      });
    }

    const {
      distributions,
      alerts,
      ...reportData
    } = req.body;

    // Update report
    await report.update(reportData);

    // Update distributions if provided
    if (distributions) {
      // Delete existing distributions
      await ReportDistribution.destroy({ where: { reportId: report.id } });
      
      // Create new distributions
      if (distributions.length > 0) {
        const distributionPromises = distributions.map(dist => 
          ReportDistribution.create({
            reportId: report.id,
            distributionTypeId: dist.distributionTypeId,
            quantity: dist.quantity,
            notes: dist.notes
          })
        );
        await Promise.all(distributionPromises);
      }
    }

    // Update alerts if provided
    if (alerts) {
      // Delete existing alerts
      await ReportAlert.destroy({ where: { reportId: report.id } });
      
      // Create new alerts
      if (alerts.length > 0) {
        const alertPromises = alerts.map(alert =>
          ReportAlert.create({
            reportId: report.id,
            ...alert
          })
        );
        await Promise.all(alertPromises);
      }
    }

    // Fetch updated report
    const updatedReport = await MaraudeReport.findByPk(report.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          include: [{ model: Association, as: 'association' }]
        },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName'] },
        { model: User, as: 'validator', attributes: ['id', 'firstName', 'lastName'] },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [{ model: DistributionType, as: 'distributionType' }]
        },
        { model: ReportAlert, as: 'alerts' }
      ]
    });

    res.json({
      message: 'Report updated successfully',
      report: updatedReport
    });

  } catch (error) {
    console.error('Update report error:', error);
    res.status(400).json({ 
      error: 'Failed to update report',
      details: error.message 
    });
  }
});

// PATCH /api/reports/:id/submit - Submit report for validation
router.patch('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction'
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions
    if (report.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (report.status !== 'draft') {
      return res.status(400).json({ 
        error: 'Only draft reports can be submitted' 
      });
    }

    await report.update({ status: 'submitted' });

    res.json({
      message: 'Report submitted for validation',
      report
    });

  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ 
      error: 'Failed to submit report',
      details: error.message 
    });
  }
});

// PATCH /api/reports/:id/validate - Validate report (coordinator/admin only)
router.patch('/:id/validate', authenticateToken, requireRole('coordinator', 'admin'), async (req, res) => {
  try {
    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction'
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        report.maraudeAction.associationId !== req.user.associationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (report.status !== 'submitted') {
      return res.status(400).json({ 
        error: 'Only submitted reports can be validated' 
      });
    }

    await report.update({
      status: 'validated',
      validatedBy: req.user.id,
      validationDate: new Date()
    });

    res.json({
      message: 'Report validated successfully',
      report
    });

  } catch (error) {
    console.error('Validate report error:', error);
    res.status(500).json({ 
      error: 'Failed to validate report',
      details: error.message 
    });
  }
});

// POST /api/reports/:id/send-email - Send report by email
router.post('/:id/send-email', authenticateToken, async (req, res) => {
  try {
    const { recipients, subject, message } = req.body;

    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients required' });
    }

    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          include: [{ model: Association, as: 'association' }]
        },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: User, as: 'validator', attributes: ['id', 'firstName', 'lastName'] },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [{ model: DistributionType, as: 'distributionType' }]
        },
        { model: ReportAlert, as: 'alerts' }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions
    if (report.createdBy !== req.user.id && 
        req.user.role !== 'admin' &&
        (req.user.role !== 'coordinator' || 
         report.maraudeAction.associationId !== req.user.associationId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Send email
    const emailSent = await sendReportEmail({
      report,
      recipients,
      subject: subject || `Compte-rendu de maraude - ${report.maraudeAction.title}`,
      message: message || '',
      senderName: `${req.user.firstName} ${req.user.lastName}`,
      senderEmail: req.user.email
    });

    if (emailSent) {
      await report.update({
        emailSent: true,
        emailSentAt: new Date(),
        emailRecipients: recipients
      });

      res.json({
        message: 'Report sent by email successfully',
        recipients
      });
    } else {
      res.status(500).json({ error: 'Failed to send email' });
    }

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ 
      error: 'Failed to send report by email',
      details: error.message 
    });
  }
});

// GET /api/reports/stats/summary - Get reports statistics
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, associationId } = req.query;

    const whereClause = {};
    
    if (startDate && endDate) {
      whereClause.reportDate = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Non-admins only see their association's stats
    const associationFilter = req.user.role === 'admin' && associationId
      ? associationId
      : req.user.associationId;

    const reports = await MaraudeReport.findAll({
      where: whereClause,
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          where: { associationId: associationFilter },
          attributes: ['id', 'associationId']
        },
        {
          model: ReportDistribution,
          as: 'distributions',
          include: [
            {
              model: DistributionType,
              as: 'distributionType',
              attributes: ['category', 'name']
            }
          ]
        },
        {
          model: ReportAlert,
          as: 'alerts',
          attributes: ['severity']
        }
      ]
    });

    // Calculate statistics
    const stats = {
      totalReports: reports.length,
      totalBeneficiaries: reports.reduce((sum, r) => sum + r.beneficiariesCount, 0),
      totalVolunteers: reports.reduce((sum, r) => sum + r.volunteersCount, 0),
      newBeneficiaries: reports.reduce((sum, r) => sum + r.newBeneficiariesCount, 0),
      totalDistance: reports.reduce((sum, r) => sum + (parseFloat(r.distanceCovered) || 0), 0),
      averageBeneficiariesPerMaraude: reports.length > 0 
        ? Math.round(reports.reduce((sum, r) => sum + r.beneficiariesCount, 0) / reports.length)
        : 0,
      distributions: {},
      alertsCount: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };

    // Calculate distribution statistics
    reports.forEach(report => {
      report.distributions.forEach(dist => {
        const category = dist.distributionType.category;
        if (!stats.distributions[category]) {
          stats.distributions[category] = {
            total: 0,
            items: {}
          };
        }
        stats.distributions[category].total += dist.quantity;
        
        const itemName = dist.distributionType.name;
        if (!stats.distributions[category].items[itemName]) {
          stats.distributions[category].items[itemName] = 0;
        }
        stats.distributions[category].items[itemName] += dist.quantity;
      });

      // Count alerts
      report.alerts.forEach(alert => {
        stats.alertsCount.total++;
        stats.alertsCount[alert.severity]++;
      });
    });

    res.json({ stats });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  }
});

// DELETE /api/reports/:id - Delete report
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const report = await MaraudeReport.findByPk(req.params.id, {
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction'
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check permissions - only creator or admin can delete
    if (report.createdBy !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Actually delete the report and its associations (cascade delete)
    await report.destroy();

    res.json({
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ 
      error: 'Failed to delete report',
      details: error.message 
    });
  }
});

module.exports = router;