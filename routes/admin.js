const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Article = require('../models/Article');
const Domain = require('../models/Domain');
const Settings = require('../models/Settings');
const ParserSettings = require('../models/ParserSettings');
const NewsParser = require('../services/newsParser');
const { authenticateToken, requireSuperAdmin, logUserActivity } = require('../middleware/auth');

const router = express.Router();

// Применяем middleware авторизации и проверки супер-админа ко всем маршрутам
router.use(authenticateToken);
router.use(requireSuperAdmin);

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     tags: [Admin]
 *     summary: Получение данных для админской панели
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные дашборда
 */
router.get('/dashboard', logUserActivity('Просмотр дашборда'), async (req, res) => {
  try {
    // Получаем общую статистику
    const totalUsers = await User.countDocuments({ role: 'user_admin' });
    const activeUsers = await User.countDocuments({ role: 'user_admin', isActive: true });
    const totalArticles = await Article.countDocuments();
    const publishedArticles = await Article.countDocuments({ status: 'published' });
    const totalDomains = await Domain.countDocuments();
    const activeDomains = await Domain.countDocuments({ isActive: true });

    // Просмотры за сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayViewsStats = await Article.aggregate([
      {
        $match: {
          status: 'published',
          publishedAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$stats.views.total' }
        }
      }
    ]);

    const todayViews = todayViewsStats[0]?.totalViews || 0;

    // Статистика по пользователям за последний месяц
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const newUsersLastMonth = await User.countDocuments({
      role: 'user_admin',
      createdAt: { $gte: lastMonth }
    });

    const newArticlesLastMonth = await Article.countDocuments({
      createdAt: { $gte: lastMonth }
    });

    // Топ-5 авторов по количеству статей
    const topAuthors = await User.aggregate([
      { $match: { role: 'user_admin' } },
      {
        $lookup: {
          from: 'articles',
          localField: '_id',
          foreignField: 'author',
          as: 'articles'
        }
      },
      {
        $project: {
          username: 1,
          email: 1,
          articleCount: { $size: '$articles' },
          stats: 1,
          createdAt: 1
        }
      },
      { $sort: { articleCount: -1 } },
      { $limit: 5 }
    ]);

    // Топ-5 доменов по количеству статей
    const topDomains = await Domain.aggregate([
      {
        $lookup: {
          from: 'articles',
          localField: '_id',
          foreignField: 'domain',
          as: 'articles'
        }
      },
      {
        $project: {
          name: 1,
          url: 1,
          articleCount: { $size: '$articles' },
          stats: 1,
          isActive: 1
        }
      },
      { $sort: { articleCount: -1 } },
      { $limit: 5 }
    ]);

    // Статистика просмотров по месяцам (последние 12 месяцев)
    const monthlyViewsStats = await Article.aggregate([
      {
        $match: {
          status: 'published',
          publishedAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$publishedAt' },
            month: { $month: '$publishedAt' }
          },
          views: { $sum: '$stats.views.total' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Последние статьи (5 штук)
    const recentArticles = await Article.find()
      .populate('author', 'username email')
      .populate('domain', 'name url')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status stats.views.total stats.comments.total createdAt publishedAt');

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          activeUsers,
          totalArticles,
          publishedArticles,
          totalDomains,
          activeDomains,
          todayViews
        },
        trends: {
          newUsersLastMonth,
          newArticlesLastMonth
        },
        topAuthors,
        topDomains,
        monthlyViewsStats,
        recentArticles
      }
    });
  } catch (error) {
    console.error('Ошибка получения данных дашборда:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Получение списка всех пользователей
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
 *         description: Список пользователей
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, isActive } = req.query;

    // Построение запроса
    const query = { role: 'user_admin' };
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Получение пользователей с подсчетом статей
    const users = await User.find(query)
      .populate('restrictions.allowedDomains', 'name url')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Добавляем статистику статей для каждого пользователя
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const articleCount = await Article.countDocuments({ author: user._id });
        return {
          ...user.toObject(),
          articleCount
        };
      })
    );

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Создание новой пользовательской админки
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               restrictions:
 *                 type: object
 *               profile:
 *                 type: object
 *     responses:
 *       201:
 *         description: Пользователь создан
 */
router.post('/users', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Имя пользователя должно содержать от 3 до 50 символов'),
  body('email')
    .isEmail()
    .withMessage('Введите корректный email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль должен содержать минимум 6 символов')
], logUserActivity('Создание пользователя'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { username, email, password, restrictions, profile } = req.body;

    // Проверка существования пользователя
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Пользователь с таким email или именем уже существует'
      });
    }

    // Создание пользователя
    const userData = {
      username,
      email,
      password,
      role: 'user_admin',
      createdBy: req.user._id,
      profile: profile || {},
      restrictions: {
        maxArticles: restrictions?.maxArticles || 100,
        canDelete: restrictions?.canDelete !== undefined ? restrictions.canDelete : true,
        canEdit: restrictions?.canEdit !== undefined ? restrictions.canEdit : true,
        allowedDomains: restrictions?.allowedDomains || []
      }
    };

    const user = new User(userData);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Пользователь успешно создан',
      data: { user }
    });
  } catch (error) {
    console.error('Ошибка создания пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/users/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Обновление пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Пользователь обновлен
 */
router.put('/users/:id', logUserActivity('Обновление пользователя'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Удаляем поля, которые нельзя обновлять
    delete updateData.password;
    delete updateData.role;
    delete updateData._id;

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('restrictions.allowedDomains', 'name url');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    res.json({
      success: true,
      message: 'Пользователь успешно обновлен',
      data: { user }
    });
  } catch (error) {
    console.error('Ошибка обновления пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/users/{id}/toggle-active:
 *   patch:
 *     tags: [Admin]
 *     summary: Блокировка/разблокировка пользователя
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:id/toggle-active', logUserActivity('Изменение статуса пользователя'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `Пользователь ${user.isActive ? 'активирован' : 'заблокирован'}`,
      data: { user }
    });
  } catch (error) {
    console.error('Ошибка изменения статуса пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Удаление пользователя
 *     security:
 *       - bearerAuth: []
 */
router.delete('/users/:id', logUserActivity('Удаление пользователя'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем, есть ли у пользователя статьи
    const articleCount = await Article.countDocuments({ author: id });
    if (articleCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Нельзя удалить пользователя, у него есть ${articleCount} статей. Сначала удалите или переназначьте статьи.`
      });
    }

    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Пользователь успешно удален'
    });
  } catch (error) {
    console.error('Ошибка удаления пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/articles:
 *   get:
 *     tags: [Admin]
 *     summary: Получение всех статей для администрирования
 *     security:
 *       - bearerAuth: []
 */
router.get('/articles', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Увеличиваем лимит по умолчанию
    const skip = (page - 1) * limit;
    const { status, author, domain, search } = req.query;

    const query = {};
    
    if (status) query.status = status;
    if (author) query.author = author;
    if (domain) query.domain = domain;
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const articles = await Article.find(query)
      .populate('author', 'username email')
      .populate('domain', 'name url')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments(query);

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
    console.error('Ошибка получения статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/articles/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Удаление статьи (супер-админ)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/articles/:id', logUserActivity('Удаление статьи'), async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findByIdAndDelete(id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }

    res.json({
      success: true,
      message: 'Статья успешно удалена'
    });
  } catch (error) {
    console.error('Ошибка удаления статьи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Получение системных настроек
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Системные настройки
 */
router.get('/settings', logUserActivity('Просмотр настроек'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Ошибка получения настроек:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Обновление системных настроек
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parser:
 *                 type: object
 *               ip:
 *                 type: object
 *               backup:
 *                 type: object
 *     responses:
 *       200:
 *         description: Настройки успешно обновлены
 */
router.put('/settings', 
  logUserActivity('Обновление настроек'),
  [
    // Валидация настроек парсера
    body('parser.maxConcurrentRequests')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Максимум одновременных запросов должен быть от 1 до 50'),
    body('parser.requestTimeout')
      .optional()
      .isInt({ min: 5000, max: 120000 })
      .withMessage('Таймаут запроса должен быть от 5000 до 120000 мс'),
    body('parser.articlesPerDay')
      .optional()
      .isInt({ min: 10, max: 10000 })
      .withMessage('Количество статей в день должно быть от 10 до 10000'),
    
    // Валидация IP настроек
    body('ip.maxRequestsPerMinute')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Максимум запросов в минуту должен быть от 1 до 1000'),
    body('ip.blockDuration')
      .optional()
      .isInt({ min: 1, max: 10080 })
      .withMessage('Длительность блокировки должна быть от 1 до 10080 минут'),
    
    // Валидация настроек бэкапа
    body('backup.backupRetentionDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Срок хранения бэкапов должен быть от 1 до 365 дней'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      const { parser, ip, backup } = req.body;
      const updateData = {};

      if (parser) updateData.parser = parser;
      if (ip) updateData.ip = ip;
      if (backup) updateData.backup = backup;

      const settings = await Settings.updateSettings(updateData);

      res.json({
        success: true,
        message: 'Настройки успешно обновлены',
        data: settings
      });
    } catch (error) {
      console.error('Ошибка обновления настроек:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
      });
    }
  }
);

/**
 * @swagger
 * /admin/ip/block:
 *   post:
 *     tags: [Admin]
 *     summary: Блокировка IP адреса
 *     security:
 *       - bearerAuth: []
 */
router.post('/ip/block', 
  logUserActivity('Блокировка IP'),
  [
    body('ip')
      .isIP()
      .withMessage('Некорректный IP адрес'),
    body('reason')
      .notEmpty()
      .withMessage('Причина блокировки обязательна'),
    body('duration')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Длительность блокировки должна быть положительным числом')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      const { ip, duration, reason } = req.body;
      
      const settings = await Settings.blockIP(ip, duration, reason);

      res.json({
        success: true,
        message: `IP ${ip} заблокирован`,
        data: settings.ip
      });
    } catch (error) {
      console.error('Ошибка блокировки IP:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
      });
    }
  }
);

/**
 * @swagger
 * /admin/ip/unblock:
 *   post:
 *     tags: [Admin]
 *     summary: Разблокировка IP адреса
 *     security:
 *       - bearerAuth: []
 */
router.post('/ip/unblock', 
  logUserActivity('Разблокировка IP'),
  [
    body('ip')
      .isIP()
      .withMessage('Некорректный IP адрес')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      const { ip } = req.body;
      
      const settings = await Settings.unblockIP(ip);

      res.json({
        success: true,
        message: `IP ${ip} разблокирован`,
        data: settings.ip
      });
    } catch (error) {
      console.error('Ошибка разблокировки IP:', error);
      res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
      });
    }
  }
);

/**
 * @swagger
 * /admin/ip/blocked:
 *   get:
 *     tags: [Admin]
 *     summary: Получение списка заблокированных IP
 *     security:
 *       - bearerAuth: []
 */
router.get('/ip/blocked', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Очищаем истекшие блокировки
    const now = new Date();
    const activeBlocks = settings.ip.blockedIPs.filter(blocked => 
      !blocked.blockedUntil || blocked.blockedUntil > now
    );

    res.json({
      success: true,
      data: activeBlocks
    });
  } catch (error) {
    console.error('Ошибка получения заблокированных IP:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/backup/create:
 *   post:
 *     tags: [Admin]
 *     summary: Создание резервной копии
 *     security:
 *       - bearerAuth: []
 */
router.post('/backup/create', logUserActivity('Создание резервной копии'), async (req, res) => {
  try {
    // Имитация создания резервной копии
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const path = `/backups/backup-${timestamp}.tar.gz`;
    const size = Math.floor(Math.random() * 1000000) + 500000; // Случайный размер от 500KB до 1.5MB
    
    // Добавляем запись в историю
    await Settings.addBackupRecord(size, 'success', path);
    
    res.json({
      success: true,
      message: 'Резервная копия успешно создана',
      data: {
        path,
        date: new Date().toISOString(),
        size
      }
    });
  } catch (error) {
    console.error('Ошибка создания резервной копии:', error);
    
    // Добавляем запись об ошибке
    try {
      await Settings.addBackupRecord(0, 'failed', '', error.message);
    } catch (logError) {
      console.error('Ошибка записи лога резервной копии:', logError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Ошибка создания резервной копии'
    });
  }
});

/**
 * @swagger
 * /admin/backup/restore:
 *   post:
 *     tags: [Admin]
 *     summary: Восстановление из резервной копии
 *     security:
 *       - bearerAuth: []
 */
router.post('/backup/restore', 
  logUserActivity('Восстановление из резервной копии'),
  [
    body('path')
      .notEmpty()
      .withMessage('Путь к резервной копии обязателен')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      const { path } = req.body;
      
      // Имитация восстановления
      // В реальном приложении здесь будет логика восстановления
      
      res.json({
        success: true,
        message: 'Восстановление из резервной копии завершено',
        data: {
          path,
          restoredAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Ошибка восстановления из резервной копии:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка восстановления из резервной копии'
      });
    }
  }
);

/**
 * @swagger
 * /admin/backup/history:
 *   get:
 *     tags: [Admin]
 *     summary: Получение истории резервных копий
 *     security:
 *       - bearerAuth: []
 */
router.get('/backup/history', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    res.json({
      success: true,
      data: settings.backup.backupHistory.sort((a, b) => new Date(b.date) - new Date(a.date))
    });
  } catch (error) {
    console.error('Ошибка получения истории резервных копий:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/backup/download/{filename}:
 *   get:
 *     tags: [Admin]
 *     summary: Скачивание резервной копии
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Имя файла резервной копии
 */
router.get('/backup/download/:filename', logUserActivity('Скачивание резервной копии'), async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Валидация имени файла (защита от path traversal)
    if (!/^backup-[\d\-T]+\.tar\.gz$/.test(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Некорректное имя файла'
      });
    }
    
    // В реальном приложении здесь будет логика создания и отправки реального файла
    // Для демо создаем простой текстовый файл
    const content = `BackNews Backup
Created: ${new Date().toISOString()}
Filename: ${filename}

This is a demo backup file.
In a real application, this would be a compressed database dump.`;
    
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(content));
    
    res.send(content);
  } catch (error) {
    console.error('Ошибка скачивания резервной копии:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка скачивания резервной копии'
    });
  }
});

// =============================================================================
// ПАРСЕР НОВОСТЕЙ
// =============================================================================

/**
 * @swagger
 * /admin/parser/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Получение настроек парсера
 *     security:
 *       - bearerAuth: []
 */
router.get('/parser/settings', async (req, res) => {
  try {
    let settings = await ParserSettings.findOne({});
    
    // Получаем список доменов для выбора
    const domains = await Domain.find({ isActive: true }).select('_id name url');
    
    // Получаем список пользователей-авторов для выбора
    const authors = await User.find({ role: { $in: ['user_admin', 'admin'] } }).select('_id username email');

    // Если настроек нет, создаем с базовыми параметрами
    if (!settings) {
      const defaultAuthor = authors.length > 0 ? authors[0]._id : null;
      
      settings = await ParserSettings.create({
        parser: {
          enabled: false,
          sourceUrl: 'https://cryptonews.com/news/',
          schedule: '4h',
          articlesPerRun: 5,
          requestDelay: 2000,
          requestTimeout: 30000
        },
        domains: {
          targetDomains: domains.slice(0, 3).map(domain => ({
            domainId: domain._id,
            name: domain.name,
            weight: 1
          })),
          distributionStrategy: 'round_robin'
        },
        content: {
          autoFormat: true,
          saveImages: true,
          maxImageSize: 5 * 1024 * 1024,
          minContentLength: 500,
          autoExcerpt: true,
          excerptLength: 200
        },
        publishing: {
          defaultStatus: 'draft',
          autoPublish: false,
          publishDelay: 0,
          defaultAuthor: defaultAuthor,
          defaultCategory: 'Crypto',
          defaultTags: ['crypto', 'news']
        }
      });
    } else if (settings.domains.targetDomains.length === 0 && domains.length > 0) {
      // Если домены есть, но не выбраны, добавляем первые 3
      settings.domains.targetDomains = domains.slice(0, 3).map(domain => ({
        domainId: domain._id,
        name: domain.name,
        weight: 1
      }));
      
      // Если нет автора по умолчанию, устанавливаем первого доступного
      if (!settings.publishing.defaultAuthor && authors.length > 0) {
        settings.publishing.defaultAuthor = authors[0]._id;
      }
      
      await settings.save();
    }

    res.json({
      success: true,
      data: {
        settings,
        availableDomains: domains,
        availableAuthors: authors
      }
    });
  } catch (error) {
    console.error('Ошибка получения настроек парсера:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/parser/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Обновление настроек парсера
 *     security:
 *       - bearerAuth: []
 */
router.put('/parser/settings', 
  logUserActivity('Обновление настроек парсера'),
  [
    body('parser.articlesPerRun')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Количество статей должно быть от 1 до 50'),
    body('parser.requestDelay')
      .optional()
      .isInt({ min: 1000, max: 10000 })
      .withMessage('Задержка запросов должна быть от 1000 до 10000 мс'),
    body('content.minContentLength')
      .optional()
      .isInt({ min: 100, max: 2000 })
      .withMessage('Минимальная длина контента должна быть от 100 до 2000 символов')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      let settings = await ParserSettings.findOne({});
      if (!settings) {
        settings = new ParserSettings(req.body);
      } else {
        Object.assign(settings, req.body);
      }

      // Пересчитываем следующий запуск если изменились настройки
      if (req.body.parser?.enabled !== undefined || req.body.parser?.schedule) {
        settings.calculateNextRun();
      }

      await settings.save();

      res.json({
        success: true,
        message: 'Настройки парсера обновлены',
        data: settings
      });
    } catch (error) {
      console.error('Ошибка обновления настроек парсера:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка обновления настроек'
      });
    }
  }
);

/**
 * @swagger
 * /admin/parser/run:
 *   post:
 *     tags: [Admin]
 *     summary: Ручной запуск парсера
 *     security:
 *       - bearerAuth: []
 */
router.post('/parser/run',
  logUserActivity('Ручной запуск парсера'),
  [
    body('count')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Количество статей должно быть от 1 до 50')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      const parser = new NewsParser();
      await parser.init();

      const options = {
        manual: true,
        count: req.body.count
      };

      // Запускаем парсер асинхронно
      parser.parseNews(options)
        .then(result => {
          console.log('Ручной парсинг завершен:', result);
        })
        .catch(error => {
          console.error('Ошибка ручного парсинга:', error);
        });

      res.json({
        success: true,
        message: 'Парсер запущен в ручном режиме',
        data: {
          startedAt: new Date(),
          options
        }
      });
    } catch (error) {
      console.error('Ошибка запуска парсера:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка запуска парсера'
      });
    }
  }
);

/**
 * @swagger
 * /admin/parser/status:
 *   get:
 *     tags: [Admin]
 *     summary: Получение статуса парсера
 *     security:
 *       - bearerAuth: []
 */
router.get('/parser/status', async (req, res) => {
  try {
    const settings = await ParserSettings.findOne({}) || await ParserSettings.create({});
    
    const status = {
      enabled: settings.parser.enabled,
      isActive: settings.isActive,
      nextRunAt: settings.stats.nextRunAt,
      nextRunIn: settings.nextRunIn,
      lastRunAt: settings.stats.lastRunAt,
      schedule: settings.parser.schedule,
      articlesPerRun: settings.parser.articlesPerRun,
      stats: {
        totalParsed: settings.stats.totalParsed,
        totalSuccess: settings.stats.totalSuccess,
        totalFailed: settings.stats.totalFailed
      }
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Ошибка получения статуса парсера:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/parser/history:
 *   get:
 *     tags: [Admin]
 *     summary: Получение истории запусков парсера
 *     security:
 *       - bearerAuth: []
 */
router.get('/parser/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const settings = await ParserSettings.findOne({}) || await ParserSettings.create({});
    
    const history = settings.stats.runHistory || [];
    const total = history.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedHistory = history.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        history: paginatedHistory,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения истории парсера:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /admin/parser/test:
 *   get:
 *     tags: [Admin]
 *     summary: Тестирование парсера (получение списка статей без сохранения)
 *     security:
 *       - bearerAuth: []
 */
router.get('/parser/test', 
  logUserActivity('Тестирование парсера'),
  async (req, res) => {
    try {
      const count = parseInt(req.query.count) || 5;
      
      if (count < 1 || count > 20) {
        return res.status(400).json({
          success: false,
          message: 'Количество статей должно быть от 1 до 20'
        });
      }

      const parser = new NewsParser();
      await parser.init();

      const articleLinks = await parser.getArticleLinks(count);

      res.json({
        success: true,
        message: `Найдено ${articleLinks.length} статей`,
        data: {
          articles: articleLinks,
          testedAt: new Date(),
          sourceUrl: parser.settings?.parser?.sourceUrl || 'https://cryptonews.com/news/'
        }
      });
    } catch (error) {
      console.error('Ошибка тестирования парсера:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка тестирования парсера',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /admin/parser/toggle:
 *   post:
 *     tags: [Admin]
 *     summary: Включение/выключение парсера
 *     security:
 *       - bearerAuth: []
 */
router.post('/parser/toggle',
  logUserActivity('Переключение состояния парсера'),
  [
    body('enabled')
      .isBoolean()
      .withMessage('Поле enabled должно быть булевым значением')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Ошибки валидации',
          errors: errors.array()
        });
      }

      let settings = await ParserSettings.findOne({});
      if (!settings) {
        settings = await ParserSettings.create({});
      }

      settings.parser.enabled = req.body.enabled;
      settings.calculateNextRun();
      await settings.save();

      res.json({
        success: true,
        message: `Парсер ${req.body.enabled ? 'включен' : 'выключен'}`,
        data: {
          enabled: settings.parser.enabled,
          nextRunAt: settings.stats.nextRunAt
        }
      });
    } catch (error) {
      console.error('Ошибка переключения парсера:', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка переключения парсера'
      });
    }
  }
);

module.exports = router; 