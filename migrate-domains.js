const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Article = require('./models/Article');

async function migrateDomains() {
  try {
    console.log('🚀 Начинаем миграцию доменов...');
    
    // Находим все статьи где domain не является массивом
    const articlesToMigrate = await Article.find({
      $or: [
        { domain: { $type: 'objectId' } },  // ObjectId
        { domain: { $type: 'string' } }     // String
      ]
    });
    
    console.log(`📊 Найдено ${articlesToMigrate.length} статей для миграции`);
    
    let migratedCount = 0;
    
    for (const article of articlesToMigrate) {
      try {
        // Получаем текущий домен
        const currentDomain = article.domain;
        
        // Преобразуем в массив с одним элементом
        const newDomainArray = Array.isArray(currentDomain) ? currentDomain : [currentDomain];
        
        // Обновляем статью напрямую в базе данных
        await Article.updateOne(
          { _id: article._id },
          { $set: { domain: newDomainArray } }
        );
        
        migratedCount++;
        console.log(`✅ Мигрирована статья: ${article.title} (ID: ${article._id})`);
        
      } catch (error) {
        console.error(`❌ Ошибка миграции статьи ${article._id}:`, error);
      }
    }
    
    console.log(`🎉 Миграция завершена! Обработано статей: ${migratedCount}`);
    
    // Проверяем результат
    const totalArticles = await Article.countDocuments();
    const arrayDomainArticles = await Article.countDocuments({
      domain: { $type: 'array' }
    });
    
    console.log(`📈 Статистика после миграции:`);
    console.log(`   Всего статей: ${totalArticles}`);
    console.log(`   Статей с массивом доменов: ${arrayDomainArticles}`);
    
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Отключение от базы данных');
  }
}

// Запускаем миграцию
migrateDomains(); 