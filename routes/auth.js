const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Регистрация нового пользователя (только для супер-админа)
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
 *                 minLength: 3
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [user_admin]
 *                 default: user_admin
 *               restrictions:
 *                 type: object
 *                 properties:
 *                   maxArticles:
 *                     type: number
 *                     default: 100
 *                   canDelete:
 *                     type: boolean
 *                     default: true
 *                   canEdit:
 *                     type: boolean
 *                     default: true
 *                   allowedDomains:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Пользователь успешно создан
 *       400:
 *         description: Ошибка валидации
 *       409:
 *         description: Пользователь уже существует
 */
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Имя пользователя должно содержать от 3 до 50 символов')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Имя пользователя может содержать только буквы, цифры и подчеркивания'),
  body('email')
    .isEmail()
    .withMessage('Введите корректный email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль должен содержать минимум 6 символов'),
  body('role')
    .optional()
    .isIn(['user_admin'])
    .withMessage('Недопустимая роль')
], async (req, res) => {
  try {
    // Проверка ошибок валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { username, email, password, role = 'user_admin', restrictions, profile } = req.body;

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

    // Создание нового пользователя
    const userData = {
      username,
      email,
      password,
      role,
      profile: profile || {}
    };

    // Добавляем ограничения для пользовательских админок
    if (restrictions) {
      userData.restrictions = {
        maxArticles: restrictions.maxArticles || 100,
        canDelete: restrictions.canDelete !== undefined ? restrictions.canDelete : true,
        canEdit: restrictions.canEdit !== undefined ? restrictions.canEdit : true,
        allowedDomains: restrictions.allowedDomains || []
      };
    }

    const user = new User(userData);
    await user.save();

    // Генерация JWT токена
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.status(201).json({
      success: true,
      message: 'Пользователь успешно создан',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          restrictions: user.restrictions,
          createdAt: user.createdAt
        },
        token
      }
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Вход в систему
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - login
 *               - password
 *             properties:
 *               login:
 *                 type: string
 *                 description: Email или имя пользователя
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Успешный вход
 *       401:
 *         description: Неверные учетные данные
 *       403:
 *         description: Аккаунт заблокирован
 */
router.post('/login', [
  body('login')
    .notEmpty()
    .withMessage('Email или имя пользователя обязательны'),
  body('password')
    .notEmpty()
    .withMessage('Пароль обязателен')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { login, password } = req.body;

    // Поиск пользователя по email или username
    const user = await User.findOne({
      $or: [{ email: login }, { username: login }]
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Неверные учетные данные'
      });
    }

    // Проверка активности аккаунта
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Аккаунт заблокирован'
      });
    }

    // Проверка пароля
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Неверные учетные данные'
      });
    }

    // Генерация JWT токена
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Обновляем lastLogin асинхронно после отправки ответа
    user.updateLastLogin().catch(err => console.error('Ошибка обновления lastLogin:', err));

    res.json({
      success: true,
      message: 'Успешный вход в систему',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          restrictions: user.restrictions,
          stats: user.stats,
          lastLogin: user.stats.lastLogin
        },
        token
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Получение информации о текущем пользователе
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Информация о пользователе
 *       401:
 *         description: Не авторизован
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('restrictions.allowedDomains', 'name url')
      .populate('createdBy', 'username email');

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          restrictions: user.restrictions,
          stats: user.stats,
          profile: user.profile,
          createdBy: user.createdBy,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
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
 * /auth/change-password:
 *   put:
 *     tags: [Authentication]
 *     summary: Изменение пароля
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Пароль успешно изменен
 *       400:
 *         description: Неверный текущий пароль
 */
router.put('/change-password', [
  authenticateToken,
  body('currentPassword')
    .notEmpty()
    .withMessage('Текущий пароль обязателен'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Новый пароль должен содержать минимум 6 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Получаем пользователя с паролем
    const user = await User.findById(req.user._id).select('+password');

    // Проверяем текущий пароль
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Неверный текущий пароль'
      });
    }

    // Устанавливаем новый пароль
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Пароль успешно изменен'
    });
  } catch (error) {
    console.error('Ошибка изменения пароля:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Обновление токена
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Новый токен
 *       401:
 *         description: Недействительный токен
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // Генерируем новый токен
    const token = jwt.sign(
      { id: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.json({
      success: true,
      message: 'Токен обновлен',
      data: { token }
    });
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 