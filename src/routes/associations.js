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
