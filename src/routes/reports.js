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

// GET /api/reports/check-duplicate - Check if report exists for maraude+date
router.get('/check-duplicate', authenticateToken, async (req, res) => {
  try {
    const { maraudeActionId, reportDate } = req.query;

    console.log('Checking duplicate for:', { maraudeActionId, reportDate });

    if (!maraudeActionId || !reportDate) {
      return res.status(400).json({ 
        error: 'maraudeActionId and reportDate are required' 
      });
    }

    // Check if report exists
    const existingReport = await MaraudeReport.findOne({
      where: { 
        maraudeActionId, 
        reportDate 
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['firstName', 'lastName']
        },
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          attributes: ['title']
        }
      ]
    });

    if (existingReport) {
      const creatorName = `${existingReport.creator.firstName} ${existingReport.creator.lastName}`;
      const createdDate = new Date(existingReport.createdAt).toLocaleDateString('fr-FR');
      
      console.log('Duplicate found:', existingReport.id);
      
      return res.json({
        exists: true,
        report: {
          id: existingReport.id,
          createdBy: creatorName,
          createdDate: createdDate,
          maraudeTitle: existingReport.maraudeAction.title,
          status: existingReport.status
        },
        message: `Un compte-rendu existe déjà pour cette maraude le ${reportDate}`,
        details: `Créé par ${creatorName} le ${createdDate}`
      });
    }

    console.log('No duplicate found');
    
    res.json({
      exists: false,
      message: 'Aucun rapport existant trouvé'
    });

  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ 
      error: 'Failed to check for duplicate report',
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

// POST /api/reports -
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      maraudeActionId,
      reportDate,
      startTime,
      endTime,
      beneficiariesCount,
      volunteersCount,
      generalNotes,
      difficultiesEncountered,
      positivePoints,
      distributions,
      alerts,
      urgentSituationsDetails
    } = req.body;

    console.log('Creating report for:', { maraudeActionId, reportDate });

    // Verify maraude action exists
    const maraudeAction = await MaraudeAction.findByPk(maraudeActionId);
    if (!maraudeAction) {
      return res.status(404).json({ 
        error: 'Action de maraude introuvable',
        message: 'L\'action de maraude sélectionnée n\'existe pas.' 
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && 
        maraudeAction.associationId !== req.user.associationId) {
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: 'Vous ne pouvez créer des rapports que pour votre association.' 
      });
    }

    // Enhanced duplicate check
    const existingReport = await MaraudeReport.findOne({
      where: { 
        maraudeActionId, 
        reportDate 
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['firstName', 'lastName']
        }
      ]
    });

    if (existingReport) {
      const creatorName = `${existingReport.creator.firstName} ${existingReport.creator.lastName}`;
      const createdDate = new Date(existingReport.createdAt).toLocaleDateString('fr-FR');
      
      console.log('Duplicate report found:', existingReport.id);
      return res.status(409).json({ 
        error: 'Rapport déjà existant',
        message: `Un compte-rendu existe déjà pour cette maraude le ${reportDate}.`,
        details: `Créé par ${creatorName} le ${createdDate}`,
        existingReportId: existingReport.id
      });
    }

    console.log('No existing report found, proceeding...');

    // Create report with AUTO-SUBMIT status
    const report = await MaraudeReport.create({
      maraudeActionId,
      reportDate,
      startTime,
      endTime,
      beneficiariesCount: parseInt(beneficiariesCount),
      volunteersCount: parseInt(volunteersCount),
      generalNotes: generalNotes || null,
      difficultiesEncountered: difficultiesEncountered || null,
      positivePoints: positivePoints || null,
      hasUrgentSituations: (alerts && alerts.length > 0) || !!urgentSituationsDetails,
      urgentSituationsDetails: urgentSituationsDetails || null,
      createdBy: req.user.id,
      status: 'submitted' // AUTO-SUBMIT instead of 'draft'
    });

    console.log('Report created with auto-submit status:', report.id);

    // Create distributions
    if (distributions && distributions.length > 0) {
      const distributionPromises = distributions.map(dist => 
        ReportDistribution.create({
          reportId: report.id,
          distributionTypeId: dist.distributionTypeId,
          quantity: parseInt(dist.quantity),
          notes: dist.notes || null
        })
      );
      await Promise.all(distributionPromises);
      console.log('Distributions created:', distributions.length);
    }

    // Create alerts
    if (alerts && alerts.length > 0) {
      const alertPromises = alerts.map(alert =>
        ReportAlert.create({
          reportId: report.id,
          alertType: alert.alertType,
          severity: alert.severity,
          locationLatitude: alert.locationLatitude || null,
          locationLongitude: alert.locationLongitude || null,
          locationAddress: alert.locationAddress || null,
          personDescription: alert.personDescription || null,
          situationDescription: alert.situationDescription,
          actionTaken: alert.actionTaken || null,
          followUpRequired: alert.followUpRequired || false,
          followUpNotes: alert.followUpNotes || null
        })
      );
      await Promise.all(alertPromises);
      console.log('Alerts created:', alerts.length);
    }

    // Return complete report
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
      message: 'Rapport créé et soumis automatiquement',
      report: completeReport,
      autoSubmitted: true
    });

  } catch (error) {
    console.error('Create report error:', error);
    res.status(400).json({ 
      error: 'Erreur lors de la création du rapport',
      message: error.message,
      details: error.name === 'SequelizeValidationError' ? 
        error.errors.map(e => `${e.path}: ${e.message}`) : 
        [error.message]
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

    // UPDATED PERMISSIONS: Allow editing of submitted reports
    const canEdit = (
      report.createdBy === req.user.id || // Creator can edit their own reports
      (req.user.associationId === report.maraudeAction.associationId && 
       ['coordinator', 'admin'].includes(req.user.role)) || // Coordinator/admin of same association
      req.user.role === 'admin' // Admin can edit any report
    );

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // UPDATED: Only prevent editing of validated reports (not submitted)
    if (report.status === 'validated' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Cannot edit validated report. Only administrators can modify validated reports.' 
      });
    }

    console.log(`Updating report ${report.id} by user ${req.user.id}`);

    const {
      distributions,
      alerts,
      ...reportData
    } = req.body;

    // Update report
    await report.update(reportData);

    // Update distributions if provided
    if (distributions !== undefined) {
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
    if (alerts !== undefined) {
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

    // Check permissions
    const canDelete = (
      (report.createdBy === req.user.id && report.status !== 'validated') ||
      (req.user.role === 'coordinator' && 
       req.user.associationId === report.maraudeAction.associationId && 
       report.status !== 'validated') ||
      req.user.role === 'admin'
    );

    if (!canDelete) {
      return res.status(403).json({ 
        error: 'Access denied. You can only delete your own reports or reports from your association that are not yet validated.' 
      });
    }

    console.log(`Deleting report ${report.id} by user ${req.user.id}`);

    // DELETE RELATED RECORDS FIRST (cascade delete manually)
    
    // 1. Delete report alerts first
    await ReportAlert.destroy({
      where: { reportId: report.id }
    });
    console.log('Deleted alerts for report:', report.id);

    // 2. Delete report distributions
    await ReportDistribution.destroy({
      where: { reportId: report.id }
    });
    console.log('Deleted distributions for report:', report.id);

    // 3. Now delete the main report
    await report.destroy();
    console.log('Deleted report:', report.id);

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

// Dans src/routes/reports.js, AJOUTER cet endpoint après les autres routes

// GET /api/reports/dashboard/stats - Get dashboard statistics for current user
router.get('/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const associationId = req.user.associationId;

    console.log(`Getting dashboard stats for user ${userId} from association ${associationId}`);

    // Get user's maraudes
    const userMaraudes = await MaraudeAction.findAll({
      where: { createdBy: userId },
      attributes: ['id', 'status', 'beneficiariesHelped']
    });

    // Get reports for user's maraudes OR reports created by user
    const userReports = await MaraudeReport.findAll({
      where: {
        [Op.or]: [
          { createdBy: userId }, // Reports created by this user
          { '$maraudeAction.createdBy$': userId } // Reports for maraudes created by this user
        ]
      },
      include: [
        {
          model: MaraudeAction,
          as: 'maraudeAction',
          attributes: ['id', 'title', 'createdBy']
        }
      ],
      attributes: [
        'id', 'beneficiariesCount', 'volunteersCount', 
        'status', 'reportDate', 'maraudeActionId', 'createdBy'
      ]
    });

    console.log(`Found ${userMaraudes.length} maraudes and ${userReports.length} reports`);

    // Calculate statistics
    const stats = {
      // Maraudes stats
      totalMaraudes: userMaraudes.length,
      completedMaraudes: userMaraudes.filter(m => m.status === 'completed').length,
      activeMaraudes: userMaraudes.filter(m => 
        m.status === 'planned' || m.status === 'in_progress'
      ).length,

      // Beneficiaries stats (from reports only - this is the KEY fix!)
      totalBeneficiaries: userReports.reduce((sum, report) => 
        sum + (report.beneficiariesCount || 0), 0
      ),
      
      // Reports stats
      totalReports: userReports.length,
      validatedReports: userReports.filter(r => r.status === 'validated').length,
      pendingReports: userReports.filter(r => r.status === 'submitted').length,
      draftReports: userReports.filter(r => r.status === 'draft').length,

      // Average beneficiaries per report
      avgBeneficiariesPerReport: userReports.length > 0 ? 
        Math.round(userReports.reduce((sum, r) => sum + r.beneficiariesCount, 0) / userReports.length) : 0,

      // Total volunteers involved across all reports
      totalVolunteers: userReports.reduce((sum, report) => 
        sum + (report.volunteersCount || 0), 0
      )
    };

    console.log('Calculated stats:', stats);

    res.json({ stats });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard statistics',
      details: error.message 
    });
  }
});

module.exports = router;