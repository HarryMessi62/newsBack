const express = require('express');
const { body, validationResult } = require('express-validator');
const Domain = require('../models/Domain');
const { authenticateToken, requireSuperAdmin, logUserActivity } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /domains:
 *   get:
 *     tags: [Domains]
 *     summary: Получение списка доменов
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Список доменов
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, isActive } = req.query;

    // Построение запроса
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } }
      ];
    }

    // Пользователи видят только свои разрешенные домены
    if (req.user.role !== 'super_admin') {
      query._id = { $in: req.user.restrictions.allowedDomains };
    }

    const domains = await Domain.find(query)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Domain.countDocuments(query);

    res.json({
      success: true,
      data: {
        domains,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения доменов:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains:
 *   post:
 *     tags: [Domains]
 *     summary: Создание нового домена (только супер-админ)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               description:
 *                 type: string
 *               settings:
 *                 type: object
 *     responses:
 *       201:
 *         description: Домен создан
 */
router.post('/', [
  authenticateToken,
  requireSuperAdmin,
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Название домена обязательно и не должно превышать 100 символов'),
  body('url')
    .isURL()
    .withMessage('Введите корректный URL'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Описание не должно превышать 500 символов')
], logUserActivity('Создание домена'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { name, url, description, settings = {} } = req.body;

    // Проверка уникальности
    const existingDomain = await Domain.findOne({
      $or: [{ name }, { url }]
    });

    if (existingDomain) {
      return res.status(409).json({
        success: false,
        message: 'Домен с таким названием или URL уже существует'
      });
    }

    // Создание домена
    const domainData = {
      name,
      url,
      description,
      createdBy: req.user._id,
      settings: {
        defaultMetaTitle: settings.defaultMetaTitle || name,
        defaultMetaDescription: settings.defaultMetaDescription || description,
        defaultKeywords: settings.defaultKeywords || [],
        indexationKey: settings.indexationKey || name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        indexationBoost: settings.indexationBoost || 40,
        theme: settings.theme || 'light',
        logo: settings.logo,
        favicon: settings.favicon,
        commentsEnabled: settings.commentsEnabled !== undefined ? settings.commentsEnabled : true,
        moderateComments: settings.moderateComments !== undefined ? settings.moderateComments : true
      }
    };

    const domain = new Domain(domainData);
    await domain.save();

    res.status(201).json({
      success: true,
      message: 'Домен успешно создан',
      data: { domain }
    });
  } catch (error) {
    console.error('Ошибка создания домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/{id}:
 *   get:
 *     tags: [Domains]
 *     summary: Получение домена по ID
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем доступ к домену
    if (req.user.role !== 'super_admin' && !req.user.canAccessDomain(id)) {
      return res.status(403).json({
        success: false,
        message: 'Нет доступа к этому домену'
      });
    }

    const domain = await Domain.findById(id)
      .populate('createdBy', 'username email');

    if (!domain) {
      return res.status(404).json({
        success: false,
        message: 'Домен не найден'
      });
    }

    // Обновляем статистику домена
    await domain.updateStats();

    res.json({
      success: true,
      data: { domain }
    });
  } catch (error) {
    console.error('Ошибка получения домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/{id}:
 *   put:
 *     tags: [Domains]
 *     summary: Обновление домена (только супер-админ)
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', [
  authenticateToken,
  requireSuperAdmin,
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Название домена не должно превышать 100 символов'),
  body('url')
    .optional()
    .isURL()
    .withMessage('Введите корректный URL'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Описание не должно превышать 500 символов')
], logUserActivity('Обновление домена'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Проверка уникальности при обновлении
    if (updateData.name || updateData.url) {
      const existingDomain = await Domain.findOne({
        _id: { $ne: id },
        $or: [
          ...(updateData.name ? [{ name: updateData.name }] : []),
          ...(updateData.url ? [{ url: updateData.url }] : [])
        ]
      });

      if (existingDomain) {
        return res.status(409).json({
          success: false,
          message: 'Домен с таким названием или URL уже существует'
        });
      }
    }

    const domain = await Domain.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'username email');

    if (!domain) {
      return res.status(404).json({
        success: false,
        message: 'Домен не найден'
      });
    }

    res.json({
      success: true,
      message: 'Домен успешно обновлен',
      data: { domain }
    });
  } catch (error) {
    console.error('Ошибка обновления домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/{id}/toggle-active:
 *   patch:
 *     tags: [Domains]
 *     summary: Активация/деактивация домена (только супер-админ)
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/toggle-active', [
  authenticateToken,
  requireSuperAdmin
], logUserActivity('Изменение статуса домена'), async (req, res) => {
  try {
    const { id } = req.params;

    const domain = await Domain.findById(id);
    if (!domain) {
      return res.status(404).json({
        success: false,
        message: 'Домен не найден'
      });
    }

    domain.isActive = !domain.isActive;
    await domain.save();

    res.json({
      success: true,
      message: `Домен ${domain.isActive ? 'активирован' : 'деактивирован'}`,
      data: { domain }
    });
  } catch (error) {
    console.error('Ошибка изменения статуса домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/{id}:
 *   delete:
 *     tags: [Domains]
 *     summary: Удаление домена (только супер-админ)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', [
  authenticateToken,
  requireSuperAdmin
], logUserActivity('Удаление домена'), async (req, res) => {
  try {
    const { id } = req.params;
    const Article = require('../models/Article');

    const domain = await Domain.findById(id);
    if (!domain) {
      return res.status(404).json({
        success: false,
        message: 'Домен не найден'
      });
    }

    // Проверяем, есть ли статьи в этом домене
    const articleCount = await Article.countDocuments({ domain: id });
    if (articleCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Нельзя удалить домен, в нем есть ${articleCount} статей. Сначала удалите или перенесите статьи.`
      });
    }

    await Domain.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Домен успешно удален'
    });
  } catch (error) {
    console.error('Ошибка удаления домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/{id}/articles:
 *   get:
 *     tags: [Domains]
 *     summary: Получение статей домена
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/articles', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем доступ к домену
    if (req.user.role !== 'super_admin' && !req.user.canAccessDomain(id)) {
      return res.status(403).json({
        success: false,
        message: 'Нет доступа к этому домену'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const Article = require('../models/Article');

    const articles = await Article.find({ domain: id })
      .populate('author', 'username profile')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments({ domain: id });

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения статей домена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /domains/public/list:
 *   get:
 *     tags: [Domains]
 *     summary: Получение списка активных доменов (публичный доступ)
 *     responses:
 *       200:
 *         description: Список активных доменов
 */
router.get('/public/list', async (req, res) => {
  try {
    const domains = await Domain.find({ isActive: true })
      .select('name url description stats')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: { domains }
    });
  } catch (error) {
    console.error('Ошибка получения публичного списка доменов:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 