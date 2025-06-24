const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Название домена обязательно'],
    unique: true,
    trim: true,
    maxlength: [100, 'Название домена не должно превышать 100 символов']
  },
  url: {
    type: String,
    required: [true, 'URL домена обязателен'],
    unique: true,
    trim: true,
    match: [/^https?:\/\/.+/, 'URL должен начинаться с http:// или https://']
  },
  description: {
    type: String,
    maxlength: [500, 'Описание не должно превышать 500 символов']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    // Настройки SEO
    defaultMetaTitle: String,
    defaultMetaDescription: String,
    defaultKeywords: [String],
    
    // Настройки индексации
    indexationKey: {
      type: String,
      default: function() {
        return this.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      }
    },
    indexationBoost: {
      type: Number,
      default: 40,
      min: 0,
      max: 100
    },
    
    // Настройки отображения
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    logo: String,
    favicon: String,
    
    // Настройки комментариев
    commentsEnabled: {
      type: Boolean,
      default: true
    },
    moderateComments: {
      type: Boolean,
      default: true
    }
  },
  
  // Статистика
  stats: {
    totalArticles: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    },
    totalLikes: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    }
  },
  
  // Информация о создателе
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Индексы
domainSchema.index({ name: 1 });
domainSchema.index({ url: 1 });
domainSchema.index({ isActive: 1 });
domainSchema.index({ createdBy: 1 });

// Виртуальные поля
domainSchema.virtual('articleCount', {
  ref: 'Article',
  localField: '_id',
  foreignField: 'domain',
  count: true
});

// Методы для работы со статистикой
domainSchema.methods.updateStats = async function() {
  const Article = mongoose.model('Article');
  
  const stats = await Article.aggregate([
    { $match: { domain: this._id } },
    {
      $group: {
        _id: null,
        totalArticles: { $sum: 1 },
        totalViews: { $sum: '$stats.views' },
        totalLikes: { $sum: '$stats.likes' },
        avgRating: { $avg: '$stats.rating' }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.stats.totalArticles = stats[0].totalArticles || 0;
    this.stats.totalViews = stats[0].totalViews || 0;
    this.stats.totalLikes = stats[0].totalLikes || 0;
    this.stats.averageRating = Math.round((stats[0].avgRating || 0) * 100) / 100;
  }
  
  await this.save();
};

// Статический метод для поиска доменов с фильтрацией
domainSchema.statics.findWithFilters = function(filters = {}) {
  const query = {};
  
  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive;
  }
  
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { description: { $regex: filters.search, $options: 'i' } },
      { url: { $regex: filters.search, $options: 'i' } }
    ];
  }
  
  return this.find(query)
    .populate('createdBy', 'username email')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Domain', domainSchema); 