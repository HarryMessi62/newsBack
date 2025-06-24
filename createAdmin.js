const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config({ path: './config.env' });

async function createSuperAdmin() {
  try {
    console.log('🔍 Подключение к MongoDB...');
    
    // Подключение к базе данных
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Подключение к MongoDB успешно');
    console.log('🔍 Проверка существующего суперадмина...');
    
    // Проверяем есть ли уже суперадмин
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('✅ Суперадмин уже существует:', existingSuperAdmin.username);
      console.log('📧 Email:', existingSuperAdmin.email);
      console.log('🔑 Используйте существующие данные для входа');
      mongoose.connection.close();
      return;
    }

    console.log('👤 Создание нового суперадмина...');

    // Создаем суперадмина
    const superAdmin = new User({
      username: 'superadmin',
      email: 'admin@backnews.com',
      password: 'admin123456', // Пароль будет автоматически захеширован в pre-save хуке
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

    console.log('');
    console.log('🎉 Суперадмин успешно создан!');
    console.log('');
    console.log('📋 Данные для входа:');
    console.log('👤 Логин: superadmin');
    console.log('📧 Email: admin@backnews.com');
    console.log('🔑 Пароль: admin123456');
    console.log('');
    console.log('🌐 Перейдите на http://localhost:5173 для входа в админ-панель');
    console.log('');
    console.log('⚠️  ВАЖНО: Смените пароль после первого входа!');

  } catch (error) {
    console.error('❌ Ошибка при создании суперадмина:', error.message);
    
    if (error.code === 11000) {
      console.log('💡 Пользователь с таким username или email уже существует');
    }
  } finally {
    mongoose.connection.close();
    console.log('🔌 Соединение с базой данных закрыто');
  }
}

// Запуск создания суперадмина
createSuperAdmin(); 