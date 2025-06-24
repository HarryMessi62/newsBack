const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Подключение к базе данных
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Подключение к MongoDB успешно'))
.catch(err => {
  console.error('❌ Ошибка подключения к MongoDB:', err);
  process.exit(1);
});

// Простая схема пользователя
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  role: String
});

const User = mongoose.model('User', userSchema);

async function cleanAdmin() {
  try {
    console.log('🧹 Удаление существующего администратора...\n');

    // Удаляем всех пользователей с username 'admin'
    const result = await User.deleteMany({ username: 'admin' });
    
    console.log(`✅ Удалено ${result.deletedCount} пользователей с именем 'admin'`);
    console.log('💡 Теперь можно создать нового админа: npm run create-admin\n');

  } catch (error) {
    console.error('❌ Ошибка удаления:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

// Запуск скрипта
cleanAdmin(); 