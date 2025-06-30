const mongoose = require('mongoose');
const moment = require('moment');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Заголовок статьи обязателен'],
    trim: true,
    maxlength: [200, 'Заголовок не должен превышать 200 символов']
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true
  },
  content: {
    type: String,
    required: [true, 'Содержимое статьи обязательно']
  },
  excerpt: {
    type: String,
    maxlength: [500, 'Краткое описание не должно превышать 500 символов']
  },
  
  // Настройки форматирования
  formatting: {
    textAlign: {
      type: String,
      enum: ['left', 'center', 'right', 'justify'],
      default: 'left'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large', 'extra-large'],
      default: 'medium'
    },
    fontFamily: {
      type: String,
      enum: ['arial', 'helvetica', 'times', 'georgia', 'verdana', 'trebuchet'],
      default: 'arial'
    },
    lineHeight: {
      type: String,
      enum: ['1.2', '1.4', '1.6', '1.8', '2.0'],
      default: '1.6'
    }
  },
  
  // Мультимедиа контент
  media: {
    featuredImage: {
      url: String,
      alt: String,
      caption: String
    },
    gallery: [{
      url: String,
      alt: String,
      caption: String,
      position: Number
    }],
    videos: [{
      url: String,
      title: String,
      description: String,
      position: Number,
      embedCode: String
    }]
  },
  
  // SEO и метаданные
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    canonicalUrl: String,
    openGraphImage: String
  },
  
  // Категоризация
  category: {
    type: String,
    required: [true, 'Категория обязательна'],
    enum: [
      'Crypto', 'Cryptocurrencies', 'Bitcoin', 'Ethereum',
      'Technology', 'Politics', 'Economy', 'Sports',
      'Entertainment', 'Science', 'Health', 'Business',
      'World', 'Local', 'Opinion', 'Other'
    ]
  },
  tags: [String],
  hashtags: [String],
  
  // Настройки публикации
  status: {
    type: String,
    enum: ['draft', 'published', 'scheduled', 'archived'],
    default: 'draft'
  },
  publishedAt: {
    type: Date,
    default: null
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  
  // Автор и домен
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  domain: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    required: true
  },
  
  // Статистика (включая фейковые значения)
  stats: {
    views: {
      real: { type: Number, default: 0 },
      fake: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    likes: {
      real: { type: Number, default: 0 },
      fake: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    shares: {
      real: { type: Number, default: 0 },
      fake: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    comments: {
      real: { type: Number, default: 0 },
      fake: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    // Счетчик реальных просмотров за текущие сутки (сброс при первом просмотре нового дня)
    todayViews: {
      type: Number,
      default: 0
    },
    // Дата, для которой актуален счетчик todayViews (храним полночь текущего дня)
    todayViewsDate: {
      type: Date,
      default: null
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    }
  },
  
  // Настройки взаимодействия
  settings: {
    commentsEnabled: {
      type: Boolean,
      default: true
    },
    likesEnabled: {
      type: Boolean,
      default: true
    },
    sharingEnabled: {
      type: Boolean,
      default: true
    },
    indexationKey: String,
    indexationBoost: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  
  // Связанные статьи
  relatedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  }],
  
  // Версионирование
  version: {
    type: Number,
    default: 1
  },
  lastEditedAt: Date,
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Индексы
articleSchema.index({ slug: 1 });
articleSchema.index({ author: 1 });
articleSchema.index({ domain: 1 });
articleSchema.index({ status: 1 });
articleSchema.index({ category: 1 });
articleSchema.index({ publishedAt: -1 });
articleSchema.index({ 'stats.views.total': -1 });
articleSchema.index({ tags: 1 });
articleSchema.index({ title: 'text', content: 'text' });

// Виртуальные поля
articleSchema.virtual('url').get(function() {
  return `/articles/${this.slug}`;
});

articleSchema.virtual('readingTime').get(function() {
  const wordsPerMinute = 200;
  const wordCount = (this.content || '').split(' ').length;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Pre-save хуки
articleSchema.pre('save', function(next) {
  // Генерация slug из заголовка
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
    
    // Добавляем timestamp для уникальности
    this.slug += '-' + Date.now();
  }
  
  // Обновление общих статистик
  this.stats.views.total = this.stats.views.real + this.stats.views.fake;
  this.stats.likes.total = this.stats.likes.real + this.stats.likes.fake;
  this.stats.shares.total = this.stats.shares.real + this.stats.shares.fake;
  this.stats.comments.total = this.stats.comments.real + this.stats.comments.fake;
  
  // Установка даты публикации
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = this.scheduledAt || new Date();
  }
  
  // Генерация excerpt из content если не указан
  if (!this.excerpt && this.content) {
    this.excerpt = this.content
      .replace(/<[^>]*>/g, '') // Удаляем HTML теги
      .substring(0, 300) + '...';
  }
  
  next();
});

// Хуки для обновления sitemap удалены
// Sitemap теперь генерируется динамически на фронтенде через React компоненты

// Методы экземпляра
articleSchema.methods.incrementViews = async function(fake = false) {
  if (fake) {
    this.stats.views.fake += 1;
  } else {
    this.stats.views.real += 1;
  }

  // Обновляем счетчик просмотров за текущие сутки
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Полночь

  // Если дата в документе отличается от сегодняшней, сбрасываем дневной счетчик
  if (!this.stats.todayViewsDate || this.stats.todayViewsDate.getTime() !== today.getTime()) {
    this.stats.todayViews = 0;
    this.stats.todayViewsDate = today;
  }

  // Увеличиваем дневной счетчик (учитываем только реальные просмотры)
  if (!fake) {
    this.stats.todayViews += 1;
  }

  this.stats.views.total = this.stats.views.real + this.stats.views.fake;
  await this.save();
};

articleSchema.methods.incrementLikes = async function(fake = false) {
  if (fake) {
    this.stats.likes.fake += 1;
  } else {
    this.stats.likes.real += 1;
  }
  this.stats.likes.total = this.stats.likes.real + this.stats.likes.fake;
  await this.save();
};

articleSchema.methods.setFakeStats = async function(views = 0, likes = 0, shares = 0, comments = 0) {
  this.stats.views.fake = views;
  this.stats.likes.fake = likes;
  this.stats.shares.fake = shares;
  this.stats.comments.fake = comments;
  
  this.stats.views.total = this.stats.views.real + this.stats.views.fake;
  this.stats.likes.total = this.stats.likes.real + this.stats.likes.fake;
  this.stats.shares.total = this.stats.shares.real + this.stats.shares.fake;
  this.stats.comments.total = this.stats.comments.real + this.stats.comments.fake;
  
  await this.save();
};

articleSchema.methods.schedulePublication = async function(publishDate) {
  this.scheduledAt = publishDate;
  this.status = 'scheduled';
  await this.save();
};

// Статические методы
articleSchema.statics.findPublished = function() {
  return this.find({
    status: 'published',
    publishedAt: { $lte: new Date() }
  }).sort({ publishedAt: -1 });
};

articleSchema.statics.findByCategory = function(category) {
  return this.find({
    category: category,
    status: 'published',
    publishedAt: { $lte: new Date() }
  }).sort({ publishedAt: -1 });
};

articleSchema.statics.findByAuthor = function(authorId) {
  return this.find({ author: authorId })
    .populate('domain', 'name url')
    .sort({ createdAt: -1 });
};

articleSchema.statics.findByDomain = function(domainId) {
  return this.find({ domain: domainId })
    .populate('author', 'username profile')
    .sort({ publishedAt: -1 });
};

articleSchema.statics.getPopular = function(limit = 10) {
  return this.find({
    status: 'published',
    publishedAt: { $lte: new Date() }
  })
  .sort({ 'stats.views.total': -1 })
  .limit(limit);
};

articleSchema.statics.searchArticles = function(query, filters = {}) {
  const searchQuery = {
    $and: [
      {
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } },
          { tags: { $in: [new RegExp(query, 'i')] } }
        ]
      }
    ]
  };
  
  if (filters.category) {
    searchQuery.$and.push({ category: filters.category });
  }
  
  if (filters.domain) {
    searchQuery.$and.push({ domain: filters.domain });
  }
  
  if (filters.author) {
    searchQuery.$and.push({ author: filters.author });
  }
  
  if (filters.dateFrom || filters.dateTo) {
    const dateFilter = {};
    if (filters.dateFrom) dateFilter.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.$lte = new Date(filters.dateTo);
    searchQuery.$and.push({ publishedAt: dateFilter });
  }
  
  return this.find(searchQuery)
    .populate('author', 'username profile')
    .populate('domain', 'name url')
    .sort({ publishedAt: -1 });
};

module.exports = mongoose.model('Article', articleSchema); 