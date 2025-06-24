const mongoose = require('mongoose');

const parserSettingsSchema = new mongoose.Schema({
  // Настройки парсера
  parser: {
    enabled: {
      type: Boolean,
      default: false
    },
    sourceUrl: {
      type: String,
      default: 'https://cointelegraph.com/news'
    },
    
    // Периодичность парсинга
    schedule: {
      type: String,
      enum: ['15min', '30min', '1h', '2h', '4h', '8h', '12h', '24h'],
      default: '4h'
    },
    
    // Количество статей для парсинга
    articlesPerRun: {
      type: Number,
      default: 5,
      min: 1,
      max: 50
    },
    
    // Настройки запросов
    requestDelay: {
      type: Number,
      default: 2000, // 2 секунды между запросами
      min: 1000,
      max: 10000
    },
    
    userAgent: {
      type: String,
      default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    
    // Timeout для запросов
    requestTimeout: {
      type: Number,
      default: 30000, // 30 секунд
      min: 10000,
      max: 60000
    },
    
    // Использовать RSS парсер по умолчанию
    useRSS: {
      type: Boolean,
      default: true // По умолчанию используем RSS парсер
    }
  },
  
  // Настройки доменов
  domains: {
    targetDomains: [{
      domainId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain',
        required: true
      },
      name: String,
      weight: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
      }
    }],
    
    // Стратегия распределения по доменам
    distributionStrategy: {
      type: String,
      enum: ['round_robin', 'weighted', 'random'],
      default: 'round_robin'
    }
  },
  
  // Настройки обработки контента
  content: {
    // Автоматическое форматирование
    autoFormat: {
      type: Boolean,
      default: true
    },
    
    // Сохранение изображений
    saveImages: {
      type: Boolean,
      default: true
    },
    
    // Максимальный размер изображения (в байтах)
    maxImageSize: {
      type: Number,
      default: 5 * 1024 * 1024, // 5MB
      min: 1024 * 1024, // 1MB
      max: 10 * 1024 * 1024 // 10MB
    },
    
    // Папка для сохранения изображений
    imageFolder: {
      type: String,
      default: 'parsed-images'
    },
    
    // Минимальная длина статьи (символов)
    minContentLength: {
      type: Number,
      default: 500,
      min: 100,
      max: 2000
    },
    
    // Автоматическая генерация excerpt
    autoExcerpt: {
      type: Boolean,
      default: true
    },
    
    excerptLength: {
      type: Number,
      default: 200,
      min: 50,
      max: 500
    }
  },
  
  // Настройки фильтрации
  filters: {
    // Исключенные ключевые слова
    excludeKeywords: [String],
    
    // Обязательные ключевые слова
    requiredKeywords: [String],
    
    // Исключенные категории
    excludeCategories: [String],
    
    // Дублирование - проверка заголовков
    duplicateCheck: {
      type: Boolean,
      default: true
    },
    
    // Минимальная уникальность контента (в процентах)
    minUniqueness: {
      type: Number,
      default: 70,
      min: 50,
      max: 100
    }
  },
  
  // Настройки публикации
  publishing: {
    // Статус по умолчанию
    defaultStatus: {
      type: String,
      enum: ['draft', 'published', 'scheduled'],
      default: 'draft'
    },
    
    // Автоматическая публикация
    autoPublish: {
      type: Boolean,
      default: false
    },
    
    // Задержка публикации (в минутах)
    publishDelay: {
      type: Number,
      default: 0,
      min: 0,
      max: 1440 // 24 часа
    },
    
    // Автор по умолчанию
    defaultAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Категория по умолчанию
    defaultCategory: {
      type: String,
      default: 'Crypto'
    },
    
    // Теги по умолчанию
    defaultTags: [String]
  },
  
  // Статистика работы парсера
  stats: {
    totalParsed: {
      type: Number,
      default: 0
    },
    
    totalSuccess: {
      type: Number,
      default: 0
    },
    
    totalFailed: {
      type: Number,
      default: 0
    },
    
    lastRunAt: Date,
    nextRunAt: Date,
    
    // История последних запусков
    runHistory: [{
      startTime: Date,
      endTime: Date,
      articlesFound: Number,
      articlesProcessed: Number,
      articlesSuccess: Number,
      articlesFailed: Number,
      errors: [String],
      status: {
        type: String,
        enum: ['success', 'partial', 'failed'],
        default: 'success'
      }
    }]
  },
  
  // Настройки уведомлений
  notifications: {
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      recipients: [String],
      onSuccess: {
        type: Boolean,
        default: false
      },
      onError: {
        type: Boolean,
        default: true
      }
    },
    
    // Лимиты для уведомлений
    notificationLimits: {
      maxErrorsPerHour: {
        type: Number,
        default: 5
      }
    }
  },
  
  // Настройки прокси (если нужно)
  proxy: {
    enabled: {
      type: Boolean,
      default: false
    },
    
    proxyList: [String],
    
    rotationInterval: {
      type: Number,
      default: 10, // Менять прокси каждые 10 запросов
      min: 1,
      max: 100
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Виртуальные поля
parserSettingsSchema.virtual('isActive').get(function() {
  return this.parser.enabled;
});

parserSettingsSchema.virtual('nextRunIn').get(function() {
  if (!this.stats.nextRunAt) return null;
  return Math.max(0, this.stats.nextRunAt.getTime() - Date.now());
});

// Методы схемы
parserSettingsSchema.methods.updateStats = function(runResult) {
  this.stats.totalParsed += runResult.articlesFound || 0;
  this.stats.totalSuccess += runResult.articlesSuccess || 0;
  this.stats.totalFailed += runResult.articlesFailed || 0;
  this.stats.lastRunAt = new Date();
  
  // Добавляем в историю
  this.stats.runHistory.unshift({
    startTime: runResult.startTime,
    endTime: runResult.endTime,
    articlesFound: runResult.articlesFound,
    articlesProcessed: runResult.articlesProcessed,
    articlesSuccess: runResult.articlesSuccess,
    articlesFailed: runResult.articlesFailed,
    errors: runResult.errors || [],
    status: runResult.status
  });
  
  // Оставляем только последние 50 записей
  if (this.stats.runHistory.length > 50) {
    this.stats.runHistory = this.stats.runHistory.slice(0, 50);
  }
  
  this.calculateNextRun();
  return this.save();
};

parserSettingsSchema.methods.calculateNextRun = function() {
  if (!this.parser.enabled) {
    this.stats.nextRunAt = null;
    return;
  }
  
  const now = new Date();
  const intervals = {
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };
  
  const interval = intervals[this.parser.schedule] || intervals['4h'];
  this.stats.nextRunAt = new Date(now.getTime() + interval);
};

// Статический метод для получения настроек
parserSettingsSchema.statics.getSettings = function() {
  return this.findOne({}) || this.create({});
};

// Индексы
parserSettingsSchema.index({ 'stats.nextRunAt': 1 });
parserSettingsSchema.index({ 'parser.enabled': 1 });

module.exports = mongoose.model('ParserSettings', parserSettingsSchema); 