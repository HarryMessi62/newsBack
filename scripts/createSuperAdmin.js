const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './config.env' });

// Подключение к базе данных
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Модель пользователя
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['super_admin', 'user_admin'],
    default: 'user_admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  restrictions: {
    maxArticles: {
      type: Number,
      default: 999999
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
  profile: {
    firstName: String,
    lastName: String,
    description: String,
    avatar: String
  }
}, {
  timestamps: true
});

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

const User = mongoose.model('User', userSchema);

async function createSuperAdmin() {
  try {
    console.log('🔍 Проверка существующего суперадмина...');
    
    // Проверяем есть ли уже суперадмин
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('✅ Суперадмин уже существует:', existingSuperAdmin.username);
      console.log('📧 Email:', existingSuperAdmin.email);
      mongoose.connection.close();
      return;
    }

    console.log('👤 Создание нового суперадмина...');

    // Создаем суперадмина
    const superAdmin = new User({
      username: 'superadmin',
      email: 'admin@backnews.com',
      password: 'admin123456',
      role: 'super_admin',
      isActive: true,
      restrictions: {
        maxArticles: 999999,
        canDelete: true,
        canEdit: true,
        allowedDomains: []
      },
      profile: {
        firstName: 'Super',
        lastName: 'Admin',
        description: 'Главный администратор системы BackNews'
      }
    });

    await superAdmin.save();

    console.log('✅ Суперадмин успешно создан!');
    console.log('👤 Логин: superadmin');
    console.log('📧 Email: admin@backnews.com');
    console.log('🔑 Пароль: admin123456');
    console.log('');
    console.log('⚠️  ВАЖНО: Смените пароль после первого входа!');

  } catch (error) {
    console.error('❌ Ошибка при создании суперадмина:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Запуск создания суперадмина
createSuperAdmin(); 