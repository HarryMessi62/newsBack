const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const ParserSettings = require('./models/ParserSettings');
const User = require('./models/User');
const Domain = require('./models/Domain');
const Article = require('./models/Article');

async function fixParserSettings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Подключились к MongoDB');
    
    // Находим супер-админа
    const superAdmin = await User.findOne({ role: 'super_admin' });
    if (!superAdmin) {
      console.log('❌ Супер-админ не найден');
      return;
    }
    console.log(`✅ Найден супер-админ: ${superAdmin.username}`);
    
    // Находим домен
    const domain = await Domain.findOne({});
    if (!domain) {
      console.log('❌ Домен не найден');
      return;
    }
    console.log(`✅ Найден домен: ${domain.name}`);
    
    // Обновляем настройки парсера
    let settings = await ParserSettings.findOne({});
    
    if (!settings) {
      console.log('Создаем новые настройки парсера...');
      settings = new ParserSettings({});
    }
    
    // Устанавливаем правильные настройки
    settings.parser.enabled = true;
    settings.parser.sourceUrl = 'https://cointelegraph.com/news';
    settings.parser.articlesPerRun = 5;
    
    // Настройки публикации
    settings.publishing.defaultStatus = 'published'; // Изменяем на published
    settings.publishing.autoPublish = true; // Включаем автопубликацию
    settings.publishing.defaultAuthor = superAdmin._id; // Используем супер-админа
    settings.publishing.defaultCategory = 'Crypto';
    
    // Настройки доменов
    settings.domains.targetDomains = [{
      domainId: domain._id,
      name: domain.name,
      weight: 1
    }];
    
    await settings.save();
    console.log('✅ Настройки парсера обновлены');
    
    // Обновляем существующие статьи-черновики на published
    const draftArticles = await Article.updateMany(
      { 
        status: 'draft',
        title: { $regex: /Bitcoin|Ethereum|crypto/i } // Только криптовалютные статьи
      },
      { 
        status: 'published',
        publishedAt: new Date(),
        author: superAdmin._id
      }
    );
    
    console.log(`✅ Обновлено ${draftArticles.modifiedCount} статей на статус "published"`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

fixParserSettings(); 