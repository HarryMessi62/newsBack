const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: './config.env' });
//
// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const articleRoutes = require('./routes/articles');
const domainRoutes = require('./routes/domains');
const uploadRoutes = require('./routes/upload');
const likesRoutes = require('./routes/likes');
const commentsRoutes = require('./routes/comments');
const sitemapRoutes = require('./routes/sitemap');

// Import swagger configuration
const swaggerSetup = require('./config/swagger');

// Import scheduler for news parsing
const scheduler = require('./services/scheduler');

const app = express();
app.set('trust proxy', true);
// Security middleware with CSP configuration for Swagger
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5173", "ws://localhost:5000"]
    }
  }
}));

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 20000, // increase limit for development
//   skip: (req) => {
//     // Skip rate limiting for localhost during development
//     return process.env.NODE_ENV !== 'production' && req.ip === '127.0.0.1';
//   }
// });
// app.use(limiter);

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [
      process.env.FRONTEND_URL, 
      /\.vercel\.app$/,
      /\.netlify\.app$/,
      'http://45.150.34.200'
    ]
  : [
      'http://localhost:3001', 
      'http://localhost:3000', 
      'http://localhost:5173', 
      'http://localhost:5174'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, мобильные приложения)
    if (!origin) return callback(null, true);
    
    // Проверяем точные совпадения и регулярные выражения
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return allowed === origin;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Не разрешено CORS политикой'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Handle preflight requests
app.options('*', cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Static files with CORS headers
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  
  // Используем ту же логику что и для основного CORS
  const isAllowed = allowedOrigins.some(allowed => {
    if (typeof allowed === 'string') return allowed === origin;
    if (allowed instanceof RegExp) return allowed.test(origin);
    return false;
  });
  
  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use('/public', express.static(path.join(__dirname, 'public')));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('MongoDB подключена успешно');
  
  // Инициализация планировщика парсера после подключения к БД
  // В production (Vercel) не запускаем планировщик, так как это serverless среда
  if (process.env.NODE_ENV !== 'production') {
    try {
      await scheduler.init();
    } catch (error) {
      console.error('Ошибка инициализации планировщика:', error);
    }
  } else {
    console.log('🚀 Планировщик отключен в production (serverless среда)');
  }
})
.catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Swagger documentation
swaggerSetup(app);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/comments', commentsRoutes);

// Sitemap и robots.txt роуты (без префикса /api)
app.use('/', sitemapRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Маршрут не найден'
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📚 Документация Swagger доступна на http://localhost:${PORT}/api-docs`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
});

// Graceful shutdown (только для development)
if (process.env.NODE_ENV !== 'production') {
  const gracefulShutdown = async (signal) => {
    console.log(`\n⚡ Получен сигнал ${signal}. Начинаю корректное завершение...`);
    
    try {
      // Останавливаем планировщик парсера
      await scheduler.stop();
      
      // Закрываем соединение с БД
      await mongoose.connection.close();
      console.log('✅ Соединение с MongoDB закрыто');
      
      // Закрываем HTTP сервер
      server.close(() => {
        console.log('✅ HTTP сервер закрыт');
        process.exit(0);
      });
      
      // Принудительное завершение через 10 секунд
      setTimeout(() => {
        console.error('⚠️ Принудительное завершение процесса');
        process.exit(1);
      }, 10000);
      
    } catch (error) {
      console.error('❌ Ошибка при корректном завершении:', error);
      process.exit(1);
    }
  };

  // Обработчики сигналов завершения
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  // Не завершаем процесс в development режиме
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанное исключение:', error);
  // Завершаем процесс в любом случае для uncaughtException
  process.exit(1);
}); 