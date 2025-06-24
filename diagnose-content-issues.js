const mongoose = require('mongoose');
const Article = require('./models/Article');
const User = require('./models/User');
const Domain = require('./models/Domain');

async function diagnoseContentIssues() {
  console.log('🔍 Диагностика проблем с контентом статей...\n');
  
  try {
    await mongoose.connect('mongodb://localhost:27017/backnews');
    console.log('✅ Подключение к базе данных установлено\n');

    // Получаем последние 50 статей
    const articles = await Article.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', 'username')
      .populate('domain', 'name');

    console.log(`📊 Анализируем ${articles.length} последних статей...\n`);

    let issues = {
      duplicateImages: [],
      shortContent: [],
      noImages: [],
      duplicateTitles: [],
      badContent: [],
      statistics: {
        totalArticles: articles.length,
        withImages: 0,
        withoutImages: 0,
        shortContent: 0,
        normalContent: 0,
        duplicateImages: 0
      }
    };

    // Группируем статьи по изображениям для поиска дубликатов
    const imageGroups = {};
    const titleGroups = {};

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      // Анализ изображений
      const imageUrl = article.media?.featuredImage?.url;
      if (imageUrl) {
        issues.statistics.withImages++;
        
        if (!imageGroups[imageUrl]) {
          imageGroups[imageUrl] = [];
        }
        imageGroups[imageUrl].push({
          id: article._id,
          title: article.title,
          source: article.source,
          createdAt: article.createdAt
        });
      } else {
        issues.statistics.withoutImages++;
        issues.noImages.push({
          id: article._id,
          title: article.title,
          source: article.source
        });
      }

      // Анализ контента
      const contentLength = article.content ? article.content.replace(/<[^>]*>/g, '').length : 0;
      if (contentLength < 500) {
        issues.statistics.shortContent++;
        issues.shortContent.push({
          id: article._id,
          title: article.title,
          contentLength,
          source: article.source,
          content: article.content?.substring(0, 200) + '...'
        });
      } else {
        issues.statistics.normalContent++;
      }

      // Анализ заголовков на дубликаты
      const titleKey = article.title.toLowerCase().trim();
      if (!titleGroups[titleKey]) {
        titleGroups[titleKey] = [];
      }
      titleGroups[titleKey].push({
        id: article._id,
        title: article.title,
        source: article.source,
        createdAt: article.createdAt
      });

      // Анализ "плохого" контента
      if (article.content) {
        const cleanContent = article.content.replace(/<[^>]*>/g, '').toLowerCase();
        const badPatterns = [
          'content available at link',
          'контент статьи доступен по ссылке',
          'failed to load',
          'error loading',
          'access denied',
          'cloudflare',
          '403 forbidden',
          'blocked'
        ];

        const hasBadContent = badPatterns.some(pattern => cleanContent.includes(pattern));
        if (hasBadContent || contentLength < 100) {
          issues.badContent.push({
            id: article._id,
            title: article.title,
            source: article.source,
            contentLength,
            content: article.content?.substring(0, 300) + '...'
          });
        }
      }
    }

    // Находим дубликаты изображений
    for (const [imageUrl, articles] of Object.entries(imageGroups)) {
      if (articles.length > 1) {
        issues.statistics.duplicateImages += articles.length;
        issues.duplicateImages.push({
          imageUrl,
          count: articles.length,
          articles: articles
        });
      }
    }

    // Находим дубликаты заголовков
    for (const [title, articles] of Object.entries(titleGroups)) {
      if (articles.length > 1) {
        issues.duplicateTitles.push({
          title,
          count: articles.length,
          articles: articles
        });
      }
    }

    // Выводим результаты
    console.log('📈 СТАТИСТИКА:');
    console.log('=' .repeat(50));
    console.log(`📰 Всего статей: ${issues.statistics.totalArticles}`);
    console.log(`🖼️ С изображениями: ${issues.statistics.withImages}`);
    console.log(`❌ Без изображений: ${issues.statistics.withoutImages}`);
    console.log(`📝 Нормальный контент: ${issues.statistics.normalContent}`);
    console.log(`⚠️ Короткий контент: ${issues.statistics.shortContent}`);
    console.log(`🔄 Дублирующиеся изображения: ${issues.statistics.duplicateImages}`);

    console.log('\n🚨 ПРОБЛЕМЫ:');
    console.log('=' .repeat(50));

    // Дублирующиеся изображения
    if (issues.duplicateImages.length > 0) {
      console.log(`\n🔄 ДУБЛИРУЮЩИЕСЯ ИЗОБРАЖЕНИЯ (${issues.duplicateImages.length} групп):`);
      issues.duplicateImages.slice(0, 5).forEach((group, index) => {
        console.log(`\n${index + 1}. Изображение используется ${group.count} раз:`);
        console.log(`   URL: ${group.imageUrl?.substring(0, 80)}...`);
        group.articles.forEach(article => {
          console.log(`   - ${article.title.substring(0, 60)}... (${article.source})`);
        });
      });
      if (issues.duplicateImages.length > 5) {
        console.log(`   ... и еще ${issues.duplicateImages.length - 5} групп`);
      }
    }

    // Статьи без изображений
    if (issues.noImages.length > 0) {
      console.log(`\n❌ СТАТЬИ БЕЗ ИЗОБРАЖЕНИЙ (${issues.noImages.length}):`);
      issues.noImages.slice(0, 10).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title.substring(0, 70)}... (${article.source})`);
      });
      if (issues.noImages.length > 10) {
        console.log(`   ... и еще ${issues.noImages.length - 10} статей`);
      }
    }

    // Короткий контент
    if (issues.shortContent.length > 0) {
      console.log(`\n⚠️ СТАТЬИ С КОРОТКИМ КОНТЕНТОМ (${issues.shortContent.length}):`);
      issues.shortContent.slice(0, 5).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title.substring(0, 60)}... (${article.contentLength} символов, ${article.source})`);
        console.log(`   Контент: ${article.content?.substring(0, 100)}...`);
      });
      if (issues.shortContent.length > 5) {
        console.log(`   ... и еще ${issues.shortContent.length - 5} статей`);
      }
    }

    // Плохой контент
    if (issues.badContent.length > 0) {
      console.log(`\n🚫 СТАТЬИ С ПРОБЛЕМНЫМ КОНТЕНТОМ (${issues.badContent.length}):`);
      issues.badContent.slice(0, 5).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title.substring(0, 60)}... (${article.source})`);
        console.log(`   Контент: ${article.content?.substring(0, 150)}...`);
      });
    }

    // Дублирующиеся заголовки
    if (issues.duplicateTitles.length > 0) {
      console.log(`\n🔄 ДУБЛИРУЮЩИЕСЯ ЗАГОЛОВКИ (${issues.duplicateTitles.length} групп):`);
      issues.duplicateTitles.slice(0, 3).forEach((group, index) => {
        console.log(`\n${index + 1}. "${group.title.substring(0, 80)}..." (${group.count} раз)`);
        group.articles.forEach(article => {
          console.log(`   - ID: ${article.id} (${article.source})`);
        });
      });
    }

    console.log('\n💡 РЕКОМЕНДАЦИИ:');
    console.log('=' .repeat(50));
    
    if (issues.duplicateImages.length > 0) {
      console.log('🔄 Дублирующиеся изображения:');
      console.log('   • Проблема в RSS фидах - некоторые источники используют одно изображение');
      console.log('   • Улучшить логику поиска изображений в статьях');
      console.log('   • Добавить fallback изображения для разных источников');
    }

    if (issues.shortContent.length > 0) {
      console.log('\n⚠️ Короткий контент:');
      console.log('   • Некоторые сайты блокируют парсинг полного контента');
      console.log('   • Улучшить селекторы для извлечения контента');
      console.log('   • Добавить больше задержек между запросами');
    }

    if (issues.noImages.length > 0) {
      console.log('\n❌ Отсутствующие изображения:');
      console.log('   • Улучшить поиск изображений в meta тегах');
      console.log('   • Добавить fallback изображения по умолчанию');
      console.log('   • Использовать изображения из RSS фидов');
    }

    console.log('\n🔧 ИСТОЧНИКИ ПРОБЛЕМ:');
    const sourceStats = {};
    articles.forEach(article => {
      if (!sourceStats[article.source]) {
        sourceStats[article.source] = { total: 0, withImages: 0, shortContent: 0 };
      }
      sourceStats[article.source].total++;
      if (article.media?.featuredImage?.url) {
        sourceStats[article.source].withImages++;
      }
      const contentLength = article.content ? article.content.replace(/<[^>]*>/g, '').length : 0;
      if (contentLength < 500) {
        sourceStats[article.source].shortContent++;
      }
    });

    Object.entries(sourceStats).forEach(([source, stats]) => {
      const imagePercent = Math.round((stats.withImages / stats.total) * 100);
      const contentPercent = Math.round(((stats.total - stats.shortContent) / stats.total) * 100);
      console.log(`${source}: ${stats.total} статей, ${imagePercent}% с изображениями, ${contentPercent}% с нормальным контентом`);
    });

  } catch (error) {
    console.error('❌ Ошибка диагностики:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Отключение от базы данных');
  }
}

diagnoseContentIssues(); 