const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Токен доступа не предоставлен'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Аккаунт пользователя заблокирован'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Недействительный токен'
    });
  }
};

// Middleware для проверки роли супер-админа
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Доступ запрещен. Требуются права супер-администратора'
    });
  }
  next();
};

// Middleware для проверки прав на управление пользователем
const canManageUser = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.params.id;
    
    // Супер-админ может управлять всеми
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    // Пользователь может управлять только собой
    if (req.user._id.toString() === userId) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Недостаточно прав для выполнения этого действия'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Ошибка проверки прав доступа'
    });
  }
};

// Middleware для проверки прав на домен
const canAccessDomain = async (req, res, next) => {
  try {
    const domainId = req.params.domainId || req.body.domain;
    
    // Супер-админ имеет доступ ко всем доменам
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    // Проверяем, есть ли у пользователя доступ к домену
    if (req.user.canAccessDomain(domainId)) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Нет доступа к указанному домену'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Ошибка проверки доступа к домену'
    });
  }
};

// Middleware для проверки прав на статью
const canManageArticle = async (req, res, next) => {
  try {
    const Article = require('../models/Article');
    const articleId = req.params.articleId || req.params.id;
    
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Статья не найдена'
      });
    }
    
    // Супер-админ может управлять всеми статьями
    if (req.user.role === 'super_admin') {
      req.article = article;
      return next();
    }
    
    // Автор может управлять своими статьями
    if (article.author.toString() === req.user._id.toString()) {
      // Проверяем права пользователя
      if (req.method === 'DELETE' && !req.user.restrictions.canDelete) {
        return res.status(403).json({
          success: false,
          message: 'У вас нет прав на удаление статей'
        });
      }
      
      if ((req.method === 'PUT' || req.method === 'PATCH') && !req.user.restrictions.canEdit) {
        return res.status(403).json({
          success: false,
          message: 'У вас нет прав на редактирование статей'
        });
      }
      
      req.article = article;
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Недостаточно прав для управления этой статьей'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Ошибка проверки прав на статью'
    });
  }
};

// Middleware для проверки лимитов пользователя
const checkUserLimits = async (req, res, next) => {
  try {
    // Супер-админ не имеет лимитов
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    // Проверяем количество статей при создании новой
    if (req.method === 'POST' && req.path.includes('/articles')) {
      const Article = require('../models/Article');
      const userArticleCount = await Article.countDocuments({ author: req.user._id });
      
      if (userArticleCount >= req.user.restrictions.maxArticles) {
        return res.status(403).json({
          success: false,
          message: `Превышен лимит статей (${req.user.restrictions.maxArticles})`
        });
      }
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Ошибка проверки лимитов пользователя'
    });
  }
};

// Middleware для логирования активности пользователя
const logUserActivity = (action) => {
  return (req, res, next) => {
    // Логируем действие пользователя
    console.log(`[${new Date().toISOString()}] Пользователь ${req.user.username} выполнил действие: ${action}`);
    
    // Можно добавить сохранение в базу данных
    // const ActivityLog = require('../models/ActivityLog');
    // ActivityLog.create({
    //   user: req.user._id,
    //   action,
    //   ip: req.ip,
    //   userAgent: req.get('User-Agent'),
    //   timestamp: new Date()
    // });
    
    next();
  };
};

// Middleware для валидации токена без требования авторизации
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Игнорируем ошибки при опциональной авторизации
    next();
  }
};

// Middleware для проверки истечения доступа
const checkAccessExpiry = (req, res, next) => {
  // Супер-админов не ограничиваем
  if (req.user.role === 'super_admin') {
    return next();
  }

  if (req.user.accessExpiresAt && new Date() > req.user.accessExpiresAt) {
    return res.status(403).json({
      success: false,
      message: 'Срок доступа истёк. Продлите подписку, чтобы продолжить создавать или редактировать статьи.'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireSuperAdmin,
  canManageUser,
  canAccessDomain,
  canManageArticle,
  checkUserLimits,
  logUserActivity,
  optionalAuth,
  checkAccessExpiry
}; 