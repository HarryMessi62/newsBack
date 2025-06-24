const NewsParser = require('./services/newsParser');
const RSSParser = require('./services/rssParser');
const mongoose = require('mongoose');

async function compareParsers() {
  console.log('🔍 Сравнение ручного и автоматического парсера...\n');
  
  try {
    await mongoose.connect('mongodb://localhost:27017/backnews');
    console.log('✅ Подключение к базе данных установлено\n');

    // 1. Тестируем RSS парсер (автоматический)
    console.log('🤖 ТЕСТИРОВАНИЕ RSS ПАРСЕРА (АВТОМАТИЧЕСКИЙ):');
    console.log('=' .repeat(60));
    
    const rssParser = new RSSParser();
    const startTimeRSS = Date.now();
    
    try {
      const rssResult = await rssParser.parseRSSArticles(3);
      const endTimeRSS = Date.now();
      const rssTime = (endTimeRSS - startTimeRSS) / 1000;
      
      console.log(`✅ RSS парсер завершен за ${rssTime.toFixed(2)} секунд`);
      console.log(`📊 Результаты RSS парсера:`);
      console.log(`   • Успешно: ${rssResult.articlesSuccess}`);
      console.log(`   • Неудачно: ${rssResult.articlesFailed}`);
      console.log(`   • Дубликаты: ${rssResult.duplicates}`);
      console.log(`   • Статус: ${rssResult.status}`);
      console.log(`   • Время: ${rssTime.toFixed(2)}с`);
      
      if (rssResult.errors && rssResult.errors.length > 0) {
        console.log(`   • Ошибки: ${rssResult.errors.length}`);
      }
      
    } catch (error) {
      console.log(`❌ RSS парсер завершился с ошибкой: ${error.message}`);
    }

    console.log('\n' + '=' .repeat(60));

    // 2. Тестируем HTML парсер (ручной)
    console.log('\n👤 ТЕСТИРОВАНИЕ HTML ПАРСЕРА (РУЧНОЙ):');
    console.log('=' .repeat(60));
    
    const htmlParser = new NewsParser();
    await htmlParser.init();
    const startTimeHTML = Date.now();
    
    try {
      const htmlResult = await htmlParser.parseNews({ 
        count: 3, 
        manual: true, 
        useRSS: false // Принудительно отключаем RSS
      });
      const endTimeHTML = Date.now();
      const htmlTime = (endTimeHTML - startTimeHTML) / 1000;
      
      console.log(`✅ HTML парсер завершен за ${htmlTime.toFixed(2)} секунд`);
      console.log(`📊 Результаты HTML парсера:`);
      console.log(`   • Успешно: ${htmlResult.articlesSuccess}`);
      console.log(`   • Неудачно: ${htmlResult.articlesFailed}`);
      console.log(`   • Найдено: ${htmlResult.articlesFound}`);
      console.log(`   • Обработано: ${htmlResult.articlesProcessed}`);
      console.log(`   • Статус: ${htmlResult.status}`);
      console.log(`   • Время: ${htmlTime.toFixed(2)}с`);
      
      if (htmlResult.errors && htmlResult.errors.length > 0) {
        console.log(`   • Ошибки: ${htmlResult.errors.length}`);
      }
      
    } catch (error) {
      console.log(`❌ HTML парсер завершился с ошибкой: ${error.message}`);
    }

    console.log('\n' + '=' .repeat(60));

    // 3. Сравнительный анализ
    console.log('\n📈 СРАВНИТЕЛЬНЫЙ АНАЛИЗ:');
    console.log('=' .repeat(60));
    
    console.log('🔧 ТЕХНИЧЕСКИЕ РАЗЛИЧИЯ:');
    console.log('');
    console.log('RSS ПАРСЕР (Автоматический):');
    console.log('  ✅ Использует RSS фиды новостных сайтов');
    console.log('  ✅ 8 источников одновременно');
    console.log('  ✅ Быстрая работа (2-5 секунд)');
    console.log('  ✅ Стабильная работа');
    console.log('  ✅ Автоматическое извлечение тегов');
    console.log('  ✅ Получение полного контента статей');
    console.log('  ✅ Сортировка по приоритету источников');
    console.log('  ⚠️ Зависит от доступности RSS фидов');
    console.log('');
    console.log('HTML ПАРСЕР (Ручной):');
    console.log('  ✅ Парсит HTML страницы напрямую');
    console.log('  ✅ Больший контроль над процессом');
    console.log('  ✅ Может работать с любыми сайтами');
    console.log('  ❌ Медленнее (10-30 секунд)');
    console.log('  ❌ Может блокироваться Cloudflare');
    console.log('  ❌ Требует обновления селекторов');
    console.log('  ❌ Один источник за раз');

    console.log('\n🎯 РЕКОМЕНДАЦИИ:');
    console.log('  • Используйте RSS парсер для ежедневной работы');
    console.log('  • HTML парсер - для специальных случаев');
    console.log('  • RSS парсер более надежен и быстр');
    console.log('  • HTML парсер подходит для кастомных источников');

    console.log('\n📋 НАСТРОЙКИ:');
    console.log('  • В админке включена опция "Использовать RSS" по умолчанию');
    console.log('  • Автоматический парсер использует RSS');
    console.log('  • Ручной запуск тоже использует RSS (если не отключено)');
    console.log('  • Можно переключаться между режимами в настройках');

  } catch (error) {
    console.error('❌ Ошибка сравнения парсеров:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Отключение от базы данных');
  }
}

compareParsers(); 