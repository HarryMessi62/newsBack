const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Имя пользователя обязательно'],
    unique: true,
    trim: true,
    minlength: [3, 'Имя пользователя должно содержать минимум 3 символа'],
    maxlength: [50, 'Имя пользователя не должно превышать 50 символов']
  },
  email: {
    type: String,
    required: [true, 'Email обязателен'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Введите корректный email']
  },
  password: {
    type: String,
    required: [true, 'Пароль обязателен'],
    minlength: [6, 'Пароль должен содержать минимум 6 символов'],
    select: false
  },
  role: {
    type: String,
    enum: ['super_admin', 'user_admin'],
    default: 'user_admin',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  accessExpiresAt: {
    type: Date,
    default: null
  },
  // Дополнительные поля для пользовательских админок
  restrictions: {
    maxArticles: {
      type: Number,
      default: 100
    },
    canDelete: {
      type: Boolean,
      default: true
    },
    canEdit: {
      type: Boolean,
      default: true
    },
    allowedDomains: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Domain'
    }]
  },
  // Статистика
  stats: {
    totalArticles: {
      type: Number,
      default: 0
    },
    lastLogin: {
      type: Date,
      default: null
    },
    loginCount: {
      type: Number,
      default: 0
    }
  },
  // Информация о создателе (для пользовательских админок)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Дополнительная информация
  profile: {
    firstName: String,
    lastName: String,
    description: String,
    avatar: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Индексы
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdBy: 1 });

// Виртуальные поля
userSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.username;
});

userSchema.virtual('articleCount', {
  ref: 'Article',
  localField: '_id',
  foreignField: 'author',
  count: true
});

// Pre-save хук для хеширования пароля
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Метод для обновления последнего входа
userSchema.methods.updateLastLogin = async function() {
  return await mongoose.model('User').updateOne(
    { _id: this._id },
    {
      $set: { 'stats.lastLogin': new Date() },
      $inc: { 'stats.loginCount': 1 }
    }
  );
};

// Метод для проверки разрешений на домен
userSchema.methods.canAccessDomain = function(domainId) {
  if (this.role === 'super_admin') return true;
  return this.restrictions.allowedDomains.includes(domainId);
};

// Статический метод для получения пользователей с статистикой
userSchema.statics.getUsersWithStats = function() {
  return this.aggregate([
    {
      $lookup: {
        from: 'articles',
        localField: '_id',
        foreignField: 'author',
        as: 'articles'
      }
    },
    {
      $addFields: {
        'stats.totalArticles': { $size: '$articles' }
      }
    },
    {
      $project: {
        password: 0,
        articles: 0
      }
    }
  ]);
};

module.exports = mongoose.model('User', userSchema); 