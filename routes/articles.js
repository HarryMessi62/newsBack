const express = require('express');
const { body, validationResult } = require('express-validator');
const moment = require('moment');
const Article = require('../models/Article');
const Domain = require('../models/Domain');
const User = require('../models/User');
const { 
  authenticateToken, 
  canManageArticle, 
  canAccessDomain, 
  checkUserLimits,
  logUserActivity,
  optionalAuth,
  checkAccessExpiry
} = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /articles/meta/categories:
 *   get:
 *     tags: [Articles]
 *     summary: Получение списка категорий статей
 *     description: Возвращает все доступные категории статей с количеством публикаций в каждой
 *     responses:
 *       200:
 *         description: Список категорий успешно получен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           count:
 *                             type: number
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = [
      'Crypto', 'Cryptocurrencies', 'Bitcoin', 'Ethereum',
      'Technology', 'Politics', 'Economy', 'Sports',
      'Entertainment', 'Science', 'Health', 'Business',
      'World', 'Local', 'Opinion', 'Other'
    ];

    // Получаем статистику по категориям
    const categoryStats = await Article.aggregate([
      {
        $match: {
          status: 'published',
          publishedAt: { $lte: new Date() }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoriesWithStats = categories.map(category => {
      const stat = categoryStats.find(s => s._id === category);
      return {
        name: category,
        count: stat ? stat.count : 0
      };
    });

    res.json({
      success: true,
      data: { categories: categoriesWithStats }
    });
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/meta/popular:
 *   get:
 *     tags: [Articles]
 *     summary: Получение популярных статей
 *     description: Возвращает статьи отсортированные по количеству просмотров
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Количество статей для возврата
 *     responses:
 *       200:
 *         description: Популярные статьи успешно получены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     articles:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Article'
 */
router.get('/meta/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const articles = await Article.find({
      status: 'published',
      publishedAt: { $lte: new Date() }
    })
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort({ 'stats.views.total': -1 })
      .limit(limit)
      .select('title slug excerpt media.featuredImage stats publishedAt');

    res.json({
      success: true,
      data: { articles }
    });
  } catch (error) {
    console.error('Ошибка получения популярных статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/my/list:
 *   get:
 *     tags: [Articles]
 *     summary: Получение статей текущего пользователя
 *     description: Возвращает статьи созданные текущим авторизованным пользователем с пагинацией
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Количество статей на странице
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, scheduled, archived]
 *         description: Фильтр по статусу статьи
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Поиск по заголовку и содержимому
 *     responses:
 *       200:
 *         description: Статьи пользователя успешно получены
 *       401:
 *         description: Не авторизован
 */
router.get('/my/list', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const query = { author: req.user._id };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const articles = await Article.find(query)
      .populate('domain', 'name url')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments(query);

    // Статистика по статусам
    const statusStats = await Article.aggregate([
      { $match: { author: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        statusStats
      }
    });
  } catch (error) {
    console.error('Ошибка получения статей пользователя:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles:
 *   get:
 *     tags: [Articles]
 *     summary: Получение списка опубликованных статей (публичный доступ)
 *     description: Возвращает все опубликованные статьи с возможностью фильтрации и поиска
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Количество статей на странице
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [Crypto, Cryptocurrencies, Bitcoin, Ethereum, Technology, Politics, Economy, Sports, Entertainment, Science, Health, Business, World, Local, Opinion, Other]
 *         description: Фильтр по категории
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *         description: ID домена для фильтрации
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Поиск по заголовку, содержимому и тегам
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, popular, liked]
 *           default: newest
 *         description: Сортировка статей
 *     responses:
 *       200:
 *         description: Статьи успешно получены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     articles:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Article'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { category, domain, search, sort = 'newest' } = req.query;

    const query = {
      status: 'published',
      publishedAt: { $lte: new Date() }
    };

    if (category) {
      query.category = category;
    }

    if (domain) {
      query.domain = domain;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Сортировка
    let sortOption = { publishedAt: -1 };
    switch (sort) {
      case 'popular':
        sortOption = { 'stats.views.total': -1 };
        break;
      case 'liked':
        sortOption = { 'stats.likes.total': -1 };
        break;
      case 'oldest':
        sortOption = { publishedAt: 1 };
        break;
      default:
        sortOption = { publishedAt: -1 };
    }

    const articles = await Article.find(query)
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select('-content');

    const total = await Article.countDocuments(query);

    res.json({
      articles,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
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
 * /articles/{slug}:
 *   get:
 *     tags: [Articles]
 *     summary: Получение статьи по slug
 *     description: Возвращает полную информацию о статье и автоматически увеличивает счетчик просмотров
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: URL-slug статьи
 *         example: "bitcoin-dostig-novogo-maksimuma"
 *     responses:
 *       200:
 *         description: Статья успешно получена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     article:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Article'
 *                         - type: object
 *                           properties:
 *                             author:
 *                               $ref: '#/components/schemas/User'
 *                             domain:
 *                               $ref: '#/components/schemas/Domain'
 *                             relatedArticles:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/Article'
 *       404:
 *         description: Статья не найдена
 *       500:
 *         description: Внутренняя ошибка сервера
 */
/**
 * @swagger
 * /articles/latest:
 *   get:
 *     tags: [Articles]
 *     summary: Получение последних статей
 *     description: Возвращает последние опубликованные статьи
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Количество статей для возврата
 *     responses:
 *       200:
 *         description: Последние статьи успешно получены
 */
router.get('/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const articles = await Article.find({
      status: 'published',
      publishedAt: { $lte: new Date() }
    })
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort({ publishedAt: -1 })
      .limit(limit)
      .select('-content');

    res.json(articles);
  } catch (error) {
    console.error('Ошибка получения последних статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/featured:
 *   get:
 *     tags: [Articles]
 *     summary: Получение рекомендуемых статей
 *     description: Возвращает рекомендуемые статьи (с высокими просмотрами)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Количество статей для возврата
 *     responses:
 *       200:
 *         description: Рекомендуемые статьи успешно получены
 */
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const articles = await Article.find({
      status: 'published',
      publishedAt: { $lte: new Date() }
    })
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort({ 'stats.views.total': -1, publishedAt: -1 })
      .limit(limit)
      .select('-content');

    res.json(articles);
  } catch (error) {
    console.error('Ошибка получения рекомендуемых статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/category/{category}:
 *   get:
 *     tags: [Articles]
 *     summary: Получение статей по категории
 *     description: Возвращает статьи определенной категории с пагинацией
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Название категории
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Количество статей на странице
 *     responses:
 *       200:
 *         description: Статьи категории успешно получены
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      status: 'published',
      publishedAt: { $lte: new Date() },
      category: category
    };

    const articles = await Article.find(query)
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-content');

    const total = await Article.countDocuments(query);

    res.json({
      articles,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Ошибка получения статей по категории:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/search:
 *   get:
 *     tags: [Articles]
 *     summary: Поиск статей
 *     description: Поиск статей по заголовку, содержимому и тегам
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Поисковый запрос
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Количество статей на странице
 *     responses:
 *       200:
 *         description: Результаты поиска успешно получены
 */
router.get('/search', async (req, res) => {
  try {
    const { q: searchQuery } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'Поисковый запрос обязателен'
      });
    }

    const query = {
      status: 'published',
      publishedAt: { $lte: new Date() },
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { excerpt: { $regex: searchQuery, $options: 'i' } },
        { content: { $regex: searchQuery, $options: 'i' } },
        { tags: { $in: [new RegExp(searchQuery, 'i')] } }
      ]
    };

    const articles = await Article.find(query)
      .populate('author', 'username profile')
      .populate('domain', 'name url')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-content');

    const total = await Article.countDocuments(query);

    res.json({
      articles,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Ошибка поиска статей:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Получение статьи по ID (без увеличения просмотров)
router.get('/id/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findOne({ 
      _id: id,
      status: 'published',
      publishedAt: { $lte: new Date() }
    })
      .populate('author', 'username profile')
      .populate('domain', 'name url settings')
      .populate('relatedArticles', 'title slug excerpt media.featuredImage stats.views.total publishedAt');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }

    res.json({
      success: true,
      data: { article }
    });
  } catch (error) {
    console.error('Ошибка получения статьи по ID:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Увеличение просмотров статьи
router.post('/id/:id/view', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findOne({ 
      _id: id,
      status: 'published',
      publishedAt: { $lte: new Date() }
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }

    // Увеличиваем счетчик просмотров (только реальные просмотры)
    await article.incrementViews(false);

    res.json({
      success: true,
      message: 'Просмотр засчитан',
      data: {
        totalViews: article.stats.views.total
      }
    });
  } catch (error) {
    console.error('Ошибка увеличения просмотров:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;

    const article = await Article.findOne({ 
      slug,
      status: 'published',
      publishedAt: { $lte: new Date() }
    })
      .populate('author', 'username profile')
      .populate('domain', 'name url settings')
      .populate('relatedArticles', 'title slug excerpt media.featuredImage stats.views.total publishedAt');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }

    // Увеличиваем счетчик просмотров (только реальные просмотры)
    await article.incrementViews(false);

    res.json({
      success: true,
      data: { article }
    });
  } catch (error) {
    console.error('Ошибка получения статьи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles:
 *   post:
 *     tags: [Articles]
 *     summary: Создание новой статьи
 *     description: Создает новую статью с расширенными возможностями (фейковая статистика, планирование, SEO)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - category
 *               - domain
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Новости криптовалют: Bitcoin достиг нового максимума"
 *               content:
 *                 type: string
 *                 minLength: 10
 *                 example: "Подробное содержание статьи о криптовалютах..."
 *               excerpt:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Краткое описание статьи"
 *               category:
 *                 type: string
 *                 enum: [Crypto, Cryptocurrencies, Bitcoin, Ethereum, Technology, Politics, Economy, Sports, Entertainment, Science, Health, Business, World, Local, Opinion, Other]
 *                 example: "Crypto"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["bitcoin", "cryptocurrency", "news"]
 *               hashtags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["#bitcoin", "#crypto"]
 *               domain:
 *                 type: string
 *                 format: objectid
 *                 example: "507f1f77bcf86cd799439011"
 *               formatting:
 *                 type: object
 *                 properties:
 *                   textAlign:
 *                     type: string
 *                     enum: [left, center, right, justify]
 *                     default: left
 *                   fontSize:
 *                     type: string
 *                     enum: [small, medium, large]
 *                     default: medium
 *                   fontFamily:
 *                     type: string
 *                     enum: [arial, helvetica, times, georgia]
 *                     default: arial
 *               media:
 *                 type: object
 *                 properties:
 *                   featuredImage:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                       alt:
 *                         type: string
 *                   gallery:
 *                     type: array
 *                     items:
 *                       type: object
 *                   videos:
 *                     type: array
 *                     items:
 *                       type: object
 *               seo:
 *                 type: object
 *                 properties:
 *                   metaTitle:
 *                     type: string
 *                   metaDescription:
 *                     type: string
 *                   keywords:
 *                     type: array
 *                     items:
 *                       type: string
 *               settings:
 *                 type: object
 *                 properties:
 *                   commentsEnabled:
 *                     type: boolean
 *                     default: true
 *                   likesEnabled:
 *                     type: boolean
 *                     default: true
 *                   indexationKey:
 *                     type: string
 *                     example: "bitcoin-news"
 *                   indexationBoost:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 100
 *                     example: 45
 *               fakeStats:
 *                 type: object
 *                 description: "Фейковая статистика для SEO"
 *                 properties:
 *                   views:
 *                     type: number
 *                     example: 1500
 *                   likes:
 *                     type: number
 *                     example: 89
 *               scheduling:
 *                 type: object
 *                 properties:
 *                   publishNow:
 *                     type: boolean
 *                     example: false
 *                   scheduleDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-12-25T12:00:00Z"
 *     responses:
 *       201:
 *         description: Статья успешно создана
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Статья успешно создана"
 *                 data:
 *                   type: object
 *                   properties:
 *                     article:
 *                       $ref: '#/components/schemas/Article'
 *       400:
 *         description: Ошибка валидации
 *       401:
 *         description: Не авторизован
 *       403:
 *         description: Нет доступа к домену или превышен лимит статей
 *       404:
 *         description: Домен не найден
 */
router.post('/', [
  authenticateToken,
  checkAccessExpiry,
  checkUserLimits,
  body('title')
    .isLength({ min: 1, max: 200 })
    .withMessage('Заголовок обязателен и не должен превышать 200 символов'),
  body('content')
    .isLength({ min: 10 })
    .withMessage('Содержимое должно содержать минимум 10 символов'),
  body('category')
    .isIn(['Crypto', 'Cryptocurrencies', 'Bitcoin', 'Ethereum', 'Technology', 'Politics', 'Economy', 'Sports', 'Entertainment', 'Science', 'Health', 'Business', 'World', 'Local', 'Opinion', 'Other'])
    .withMessage('Неверная категория'),
  body('domain')
    .isMongoId()
    .withMessage('Неверный ID домена')
], logUserActivity('Создание статьи'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const {
      title,
      content,
      excerpt,
      category,
      tags = [],
      hashtags = [],
      domain,
      formatting = {},
      media = {},
      seo = {},
      settings = {},
      fakeStats = {},
      scheduling = {}
    } = req.body;

    // Проверяем доступ к домену
    if (!req.user.canAccessDomain(domain)) {
      return res.status(403).json({
        success: false,
        message: 'Нет доступа к указанному домену'
      });
    }

    // Проверяем существование домена
    const targetDomain = await Domain.findById(domain);
    if (!targetDomain) {
      return res.status(404).json({
        success: false,
        message: 'Домен не найден'
      });
    }

    // Создание slug
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9а-я]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Проверяем уникальность slug
    const existingArticle = await Article.findOne({ slug });
    if (existingArticle) {
      return res.status(400).json({
        success: false,
        message: 'Статья с таким URL уже существует'
      });
    }

    // Определяем статус и время публикации
    let status = 'draft';
    let publishedAt = null;
    let scheduledAt = null;

    if (scheduling.publishNow) {
      status = 'published';
      publishedAt = new Date();
    } else if (scheduling.scheduleDate) {
      const scheduleDate = new Date(scheduling.scheduleDate);
      if (scheduleDate > new Date()) {
        status = 'scheduled';
        scheduledAt = scheduleDate;
      } else {
        status = 'published';
        publishedAt = scheduleDate;
      }
    }

    // Создание статьи
    const articleData = {
      title,
      slug,
      content,
      ...(excerpt ? { excerpt } : {}),
      category,
      tags,
      hashtags,
      domain,
      author: req.user._id,
      status,
      publishedAt,
      scheduledAt,
      formatting: {
        textAlign: formatting.textAlign || 'left',
        fontSize: formatting.fontSize || 'medium',
        fontFamily: formatting.fontFamily || 'arial',
        lineHeight: formatting.lineHeight || '1.6'
      },
      media: {
        featuredImage: media.featuredImage || {},
        gallery: media.gallery || [],
        videos: media.videos || []
      },
      seo: {
        metaTitle: seo.metaTitle || title,
        metaDescription: seo.metaDescription || excerpt || content.substring(0, 200) + '...',
        keywords: seo.keywords || tags,
        canonicalUrl: seo.canonicalUrl,
        openGraphImage: seo.openGraphImage
      },
      settings: {
        commentsEnabled: settings.commentsEnabled !== undefined ? settings.commentsEnabled : true,
        likesEnabled: settings.likesEnabled !== undefined ? settings.likesEnabled : true,
        sharingEnabled: settings.sharingEnabled !== undefined ? settings.sharingEnabled : true,
        indexationKey: settings.indexationKey || targetDomain.name.toLowerCase(),
        indexationBoost: settings.indexationBoost || 0
      }
    };

    // Добавляем фальшивую статистику
    if (fakeStats.views) {
      articleData.stats = {
        views: { fake: parseInt(fakeStats.views) || 0 }
      };
    }
    if (fakeStats.likes) {
      articleData.stats = articleData.stats || {};
      articleData.stats.likes = { fake: parseInt(fakeStats.likes) || 0 };
    }

    const article = new Article(articleData);
    await article.save();

    // Обновляем статистику пользователя
    req.user.stats.totalArticles += 1;
    await req.user.save();

    res.status(201).json({
      success: true,
      message: 'Статья успешно создана',
      data: { article }
    });
  } catch (error) {
    console.error('Ошибка создания статьи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/{id}/edit:
 *   get:
 *     tags: [Articles]
 *     summary: Получение статьи для редактирования
 */
router.get('/:id/edit', authenticateToken, canManageArticle, async (req, res) => {
  try {
    const article = req.article;

    res.json({
      success: true,
      data: { article }
    });
  } catch (error) {
    console.error('Ошибка получения статьи для редактирования:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/{id}:
 *   put:
 *     tags: [Articles]
 *     summary: Обновление статьи
 */
router.put('/:id', [
  authenticateToken,
  checkAccessExpiry,
  canManageArticle,
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Заголовок не должен превышать 200 символов'),
  body('content')
    .optional()
    .isLength({ min: 10 })
    .withMessage('Содержимое должно содержать минимум 10 символов'),
  body('category')
    .optional()
    .isIn(['Crypto', 'Cryptocurrencies', 'Bitcoin', 'Ethereum', 'Technology', 'Politics', 'Economy', 'Sports', 'Entertainment', 'Science', 'Health', 'Business', 'World', 'Local', 'Opinion', 'Other'])
    .withMessage('Неверная категория')
], logUserActivity('Редактирование статьи'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const article = req.article;
    const updateData = { ...req.body };

    // Обработка планирования
    if (updateData.scheduling) {
      const { scheduling } = updateData;
      
      if (scheduling.publishNow) {
        updateData.status = 'published';
        updateData.publishedAt = new Date();
        updateData.scheduledAt = null;
      } else if (scheduling.scheduleDate) {
        const publishDate = new Date(scheduling.scheduleDate);
        if (publishDate > new Date()) {
          updateData.status = 'scheduled';
          updateData.scheduledAt = publishDate;
          updateData.publishedAt = null;
        } else {
          updateData.status = 'published';
          updateData.publishedAt = publishDate;
          updateData.scheduledAt = null;
        }
      }
      delete updateData.scheduling;
    }

    // Обновляем информацию о редактировании
    updateData.lastEditedAt = new Date();
    updateData.lastEditedBy = req.user._id;
    updateData.version = (article.version || 1) + 1;

    Object.assign(article, updateData);
    await article.save();

    const populatedArticle = await Article.findById(article._id)
      .populate('domain', 'name url')
      .populate('author', 'username profile')
      .populate('lastEditedBy', 'username');

    res.json({
      success: true,
      message: 'Статья успешно обновлена',
      data: { article: populatedArticle }
    });
  } catch (error) {
    console.error('Ошибка обновления статьи:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /articles/{id}:
 *   delete:
 *     tags: [Articles]
 *     summary: Удаление статьи
 */
router.delete('/:id', authenticateToken, canManageArticle, logUserActivity('Удаление статьи'), async (req, res) => {
  try {
    const article = req.article;

    await Article.findByIdAndDelete(article._id);

    // Обновляем статистику пользователя
    const author = await User.findById(article.author);
    if (author && author.stats.totalArticles > 0) {
      author.stats.totalArticles -= 1;
      await author.save();
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
 * /articles/{id}/like:
 *   post:
 *     tags: [Articles]
 *     summary: Лайк статьи
 */
router.post('/:id/like', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }

    await article.incrementLikes(false);

    res.json({
      success: true,
      message: 'Лайк добавлен',
      data: {
        totalLikes: article.stats.likes.total
      }
    });
  } catch (error) {
    console.error('Ошибка добавления лайка:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 