const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Article = require('../models/Article');
const Domain = require('../models/Domain');
const { authenticateToken, canManageUser, logUserActivity } = require('../middleware/auth');

const router = express.Router();

// Применяем middleware авторизации ко всем маршрутам
router.use(authenticateToken);

/**
 * @swagger
 * /user/dashboard:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение данных для пользовательской панели
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные дашборда пользователя
 */
router.get('/dashboard', logUserActivity('Просмотр пользовательской панели'), async (req, res) => {
  try {
    const userId = req.user._id;

    // Статистика статей пользователя
    const totalArticles = await Article.countDocuments({ author: userId });
    const publishedArticles = await Article.countDocuments({ 
      author: userId, 
      status: 'published' 
    });
    const draftArticles = await Article.countDocuments({ 
      author: userId, 
      status: 'draft' 
    });
    const scheduledArticles = await Article.countDocuments({ 
      author: userId, 
      status: 'scheduled' 
    });

    // Общая статистика просмотров и лайков
    const statsAggregation = await Article.aggregate([
      { $match: { author: userId } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$stats.views.total' },
          totalLikes: { $sum: '$stats.likes.total' },
          totalShares: { $sum: '$stats.shares.total' },
          totalComments: { $sum: '$stats.comments.total' }
        }
      }
    ]);

    const stats = statsAggregation[0] || {
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalComments: 0
    };

    // Последние статьи
    const recentArticles = await Article.find({ author: userId })
      .populate('domain', 'name url')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status stats.views.total stats.likes.total stats.comments.total createdAt publishedAt');

    // Статистика по доменам
    const domainStats = await Article.aggregate([
      { $match: { author: userId } },
      {
        $group: {
          _id: '$domain',
          count: { $sum: 1 },
          totalViews: { $sum: '$stats.views.total' },
          totalLikes: { $sum: '$stats.likes.total' }
        }
      },
      {
        $lookup: {
          from: 'domains',
          localField: '_id',
          foreignField: '_id',
          as: 'domain'
        }
      },
      { $unwind: '$domain' },
      { $sort: { count: -1 } }
    ]);

    // Статистика за последний месяц
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const monthlyStats = await Article.aggregate([
      {
        $match: {
          author: userId,
          createdAt: { $gte: lastMonth }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          views: { $sum: '$stats.views.total' },
          likes: { $sum: '$stats.likes.total' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalArticles,
          publishedArticles,
          draftArticles,
          scheduledArticles,
          ...stats
        },
        recentArticles,
        domainStats,
        monthlyStats,
        user: {
          restrictions: req.user.restrictions,
          allowedDomains: req.user.restrictions.allowedDomains.length,
          maxArticles: req.user.restrictions.maxArticles,
          articlesRemaining: Math.max(0, req.user.restrictions.maxArticles - totalArticles)
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения данных дашборда пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /user/profile:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение профиля пользователя
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('restrictions.allowedDomains', 'name url')
      .populate('createdBy', 'username email');

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /user/profile:
 *   put:
 *     tags: [User Panel]
 *     summary: Обновление профиля пользователя
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profile:
 *                 type: object
 *                 properties:
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   description:
 *                     type: string
 *                   avatar:
 *                     type: string
 */
router.put('/profile', [
  body('profile.firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Имя не должно превышать 50 символов'),
  body('profile.lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Фамилия не должна превышать 50 символов'),
  body('profile.description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Описание не должно превышать 500 символов')
], logUserActivity('Обновление профиля'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { profile } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $set: {
          'profile.firstName': profile.firstName,
          'profile.lastName': profile.lastName,
          'profile.description': profile.description,
          'profile.avatar': profile.avatar
        }
      },
      { new: true, runValidators: true }
    ).populate('restrictions.allowedDomains', 'name url');

    res.json({
      success: true,
      message: 'Профиль успешно обновлен',
      data: { user }
    });
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /user/allowed-domains:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение доменов, доступных пользователю
 *     security:
 *       - bearerAuth: []
 */
router.get('/allowed-domains', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('restrictions.allowedDomains');

    const domains = user.restrictions.allowedDomains.filter(domain => domain.isActive);

    res.json({
      success: true,
      data: { domains }
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
 * /user/articles/stats:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение детальной статистики статей пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: month
 */
router.get('/articles/stats', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const userId = req.user._id;

    // Определяем период
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default: // month
        startDate.setMonth(now.getMonth() - 1);
    }

    // Группировка по дням для недели, по неделям для месяца, по месяцам для года
    let groupBy = {};
    let sortBy = {};
    
    if (period === 'week') {
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' }
      };
      sortBy = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
    } else if (period === 'month') {
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        week: { $week: '$createdAt' }
      };
      sortBy = { '_id.year': 1, '_id.week': 1 };
    } else {
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      };
      sortBy = { '_id.year': 1, '_id.month': 1 };
    }

    const timeSeriesStats = await Article.aggregate([
      {
        $match: {
          author: userId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          articlesCount: { $sum: 1 },
          totalViews: { $sum: '$stats.views.total' },
          totalLikes: { $sum: '$stats.likes.total' },
          totalShares: { $sum: '$stats.shares.total' }
        }
      },
      { $sort: sortBy }
    ]);

    // Статистика по категориям
    const categoryStats = await Article.aggregate([
      { $match: { author: userId } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalViews: { $sum: '$stats.views.total' },
          totalLikes: { $sum: '$stats.likes.total' },
          avgViews: { $avg: '$stats.views.total' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Топ статей по просмотрам
    const topArticles = await Article.find({ author: userId })
      .populate('domain', 'name url')
      .sort({ 'stats.views.total': -1 })
      .limit(10)
      .select('title slug stats.views.total stats.likes.total publishedAt domain');

    res.json({
      success: true,
      data: {
        timeSeriesStats,
        categoryStats,
        topArticles,
        period
      }
    });
  } catch (error) {
    console.error('Ошибка получения статистики статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /user/activity:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение активности пользователя
 *     security:
 *       - bearerAuth: []
 */
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Получаем последние действия пользователя (создание, обновление статей)
    const recentArticles = await Article.find({ author: userId })
      .populate('domain', 'name url')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title status createdAt updatedAt publishedAt lastEditedAt version');

    const activities = recentArticles.map(article => {
      const activities = [];
      
      // Создание статьи
      activities.push({
        type: 'created',
        article: {
          id: article._id,
          title: article.title,
          domain: article.domain
        },
        timestamp: article.createdAt
      });

      // Публикация
      if (article.publishedAt) {
        activities.push({
          type: 'published',
          article: {
            id: article._id,
            title: article.title,
            domain: article.domain
          },
          timestamp: article.publishedAt
        });
      }

      // Последнее редактирование
      if (article.lastEditedAt && article.version > 1) {
        activities.push({
          type: 'edited',
          article: {
            id: article._id,
            title: article.title,
            domain: article.domain,
            version: article.version
          },
          timestamp: article.lastEditedAt
        });
      }

      return activities;
    }).flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: {
        activities: activities.slice(0, limit),
        pagination: {
          page,
          limit,
          hasMore: activities.length > limit
        }
      }
    });
  } catch (error) {
    console.error('Ошибка получения активности:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /user/limits:
 *   get:
 *     tags: [User Panel]
 *     summary: Получение информации о лимитах пользователя
 *     security:
 *       - bearerAuth: []
 */
router.get('/limits', async (req, res) => {
  try {
    const userId = req.user._id;
    const currentArticleCount = await Article.countDocuments({ author: userId });

    const limits = {
      articles: {
        max: req.user.restrictions.maxArticles,
        current: currentArticleCount,
        remaining: Math.max(0, req.user.restrictions.maxArticles - currentArticleCount),
        percentage: Math.round((currentArticleCount / req.user.restrictions.maxArticles) * 100)
      },
      permissions: {
        canDelete: req.user.restrictions.canDelete,
        canEdit: req.user.restrictions.canEdit
      },
      domains: {
        allowed: req.user.restrictions.allowedDomains.length,
        total: await Domain.countDocuments({ isActive: true })
      }
    };

    res.json({
      success: true,
      data: { limits }
    });
  } catch (error) {
    console.error('Ошибка получения лимитов:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 