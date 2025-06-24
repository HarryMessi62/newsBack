const mongoose = require('mongoose');
const Article = require('./models/Article');
const ParserSettings = require('./models/ParserSettings');
const Comment = require('./models/Comment');
const Like = require('./models/Like');
const fs = require('fs').promises;
const path = require('path');

async function cleanupArticlesAndHistory() {
  try {
    console.log('🔌 Подключаемся к MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/backnews');
    console.log('✅ Подключение к MongoDB установлено');

    console.log('\n🧹 Начинаем очистку...');

    // 1. Удаляем все статьи
    console.log('\n📰 Удаляем все статьи...');
    const articlesCount = await Article.countDocuments();
    console.log(`   Найдено статей: ${articlesCount}`);
    
    if (articlesCount > 0) {
      const deleteResult = await Article.deleteMany({});
      console.log(`   ✅ Удалено статей: ${deleteResult.deletedCount}`);
    } else {
      console.log('   ℹ️ Статьи не найдены');
    }

    // 2. Удаляем все комментарии
    console.log('\n💬 Удаляем все комментарии...');
    const commentsCount = await Comment.countDocuments();
    console.log(`   Найдено комментариев: ${commentsCount}`);
    
    if (commentsCount > 0) {
      const deleteCommentsResult = await Comment.deleteMany({});
      console.log(`   ✅ Удалено комментариев: ${deleteCommentsResult.deletedCount}`);
    } else {
      console.log('   ℹ️ Комментарии не найдены');
    }

    // 3. Удаляем все лайки
    console.log('\n👍 Удаляем все лайки...');
    const likesCount = await Like.countDocuments();
    console.log(`   Найдено лайков: ${likesCount}`);
    
    if (likesCount > 0) {
      const deleteLikesResult = await Like.deleteMany({});
      console.log(`   ✅ Удалено лайков: ${deleteLikesResult.deletedCount}`);
    } else {
      console.log('   ℹ️ Лайки не найдены');
    }

    // 4. Очищаем историю парсера и сбрасываем статистику
    console.log('\n📊 Очищаем историю парсера...');
    const settings = await ParserSettings.findOne({});
    
    if (settings) {
      // Сбрасываем статистику
      settings.stats.totalParsed = 0;
      settings.stats.totalSuccess = 0;
      settings.stats.totalFailed = 0;
      settings.stats.lastRunAt = null;
      settings.stats.runHistory = [];
      
      await settings.save();
      console.log('   ✅ История парсера очищена');
      console.log('   ✅ Статистика парсера сброшена');
    } else {
      console.log('   ℹ️ Настройки парсера не найдены');
    }

    // 5. Очищаем загруженные изображения
    console.log('\n🖼️ Очищаем загруженные изображения...');
    const uploadsPath = path.join(__dirname, 'uploads', 'images');
    
    try {
      const files = await fs.readdir(uploadsPath);
      const imageFiles = files.filter(file => 
        file.endsWith('.jpg') || 
        file.endsWith('.jpeg') || 
        file.endsWith('.png') || 
        file.endsWith('.webp') ||
        file.endsWith('.gif')
      );
      
      console.log(`   Найдено изображений: ${imageFiles.length}`);
      
      if (imageFiles.length > 0) {
        for (const file of imageFiles) {
          await fs.unlink(path.join(uploadsPath, file));
        }
        console.log(`   ✅ Удалено изображений: ${imageFiles.length}`);
      } else {
        console.log('   ℹ️ Изображения не найдены');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('   ℹ️ Папка uploads/images не существует');
      } else {
        console.log(`   ⚠️ Ошибка очистки изображений: ${error.message}`);
      }
    }

    // 6. Показываем итоговую статистику
    console.log('\n📈 Итоговая статистика после очистки:');
    const finalArticlesCount = await Article.countDocuments();
    const finalCommentsCount = await Comment.countDocuments();
    const finalLikesCount = await Like.countDocuments();
    
    console.log(`   📰 Статей: ${finalArticlesCount}`);
    console.log(`   💬 Комментариев: ${finalCommentsCount}`);
    console.log(`   👍 Лайков: ${finalLikesCount}`);

    const finalSettings = await ParserSettings.findOne({});
    if (finalSettings) {
      console.log(`   📊 История парсера: ${finalSettings.stats.runHistory.length} записей`);
      console.log(`   🔢 Общая статистика: ${finalSettings.stats.totalParsed} обработано`);
    }

    console.log('\n🎉 Очистка завершена успешно!');
    console.log('💡 Теперь можно запускать парсер с чистого листа');

  } catch (error) {
    console.error('❌ Ошибка очистки:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Отключение от MongoDB');
  }
}

// Запрашиваем подтверждение перед очисткой
console.log('⚠️  ВНИМАНИЕ! Этот скрипт удалит ВСЕ данные:');
console.log('   • Все статьи');
console.log('   • Все комментарии');
console.log('   • Все лайки');
console.log('   • Историю парсера');
console.log('   • Загруженные изображения');
console.log('\n❓ Вы уверены, что хотите продолжить?');
console.log('   Для подтверждения запустите: node cleanup-articles.js --confirm');

// Проверяем флаг подтверждения
if (process.argv.includes('--confirm')) {
  cleanupArticlesAndHistory();
} else {
  console.log('\n🛑 Очистка отменена. Добавьте флаг --confirm для выполнения.');
} 