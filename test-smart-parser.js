const NewsParser = require('./services/newsParser');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/backnews');

async function testSmartParser() {
  try {
    const parser = new NewsParser();
    await parser.init();
    
    console.log('🤖 Тестируем умный парсер против дубликатов...');
    console.log('🎯 Запрашиваем 5 новых статей');
    
    const result = await parser.parseNews({ count: 5, manual: true });
    
    console.log('\n📊 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
    console.log(`✅ Успешно спарсено: ${result.articlesSuccess} статей`);
    console.log(`❌ Неудачно: ${result.articlesFailed}`);
    console.log(`📄 Всего обработано: ${result.articlesProcessed}`);
    console.log(`📰 Всего найдено: ${result.articlesFound}`);
    console.log(`📝 Статус: ${result.status}`);
    console.log(`⏱️ Время выполнения: ${Math.round((result.endTime - result.startTime) / 1000)} секунд`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Ошибки и дубликаты:');
      const duplicates = result.errors.filter(error => error.includes('duplicate')).length;
      const otherErrors = result.errors.length - duplicates;
      console.log(`  📋 Дубликатов: ${duplicates}`);
      console.log(`  ⚠️ Других ошибок: ${otherErrors}`);
      
      if (otherErrors > 0) {
        console.log('\n  Детали других ошибок:');
        result.errors.filter(error => !error.includes('duplicate')).forEach(error => {
          console.log(`    - ${error}`);
        });
      }
    }
    
    // Проверяем достижение цели
    if (result.articlesSuccess >= 5) {
      console.log('\n🎉 УСПЕХ! Цель достигнута - найдено 5 новых статей!');
    } else {
      console.log(`\n⚠️ Цель не достигнута. Найдено только ${result.articlesSuccess} из 5 статей.`);
    }
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Отключение от базы данных');
  }
}

testSmartParser(); 