const mongoose = require('mongoose');
const Article = require('./models/Article');
const User = require('./models/User');
const Domain = require('./models/Domain');

async function checkArticles() {
  try {
    require('dotenv').config({ path: './config.env' });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backnews');
    console.log('✅ Подключились к MongoDB');
    
    // Проверяем последние статьи
    const articles = await Article.find({}).sort({ createdAt: -1 }).limit(10)
      .populate('author', 'username role')
      .populate('domain', 'name');
    
    console.log(`\nПоследние ${articles.length} статей:`);
    articles.forEach((article, i) => {
      console.log(`${i+1}. ID: ${article._id}`);
      console.log(`   Slug: ${article.slug || 'НЕТ SLUG'}`);
      console.log(`   Title: ${article.title.substring(0, 60)}...`);
      console.log(`   Status: ${article.status}`);
      console.log(`   Author: ${article.author?.username || 'НЕТ АВТОРА'} (role: ${article.author?.role || 'НЕТ РОЛИ'})`);
      console.log(`   Domain: ${article.domain?.name || 'НЕТ ДОМЕНА'}`);
      console.log(`   Published: ${article.publishedAt || 'НЕТ'}`);
      console.log(`   Created: ${article.createdAt}`);
      console.log('');
    });
    
    // Проверяем пользователей
    console.log('\n=== ПОЛЬЗОВАТЕЛИ ===');
    const users = await User.find({});
    users.forEach(user => {
      console.log(`${user.username} - ${user.role} (ID: ${user._id})`);
    });
    
    // Проверяем статьи со статусом published
    const publishedCount = await Article.countDocuments({ status: 'published' });
    const draftCount = await Article.countDocuments({ status: 'draft' });
    
    console.log('\n=== СТАТИСТИКА ===');
    console.log(`Опубликованных статей: ${publishedCount}`);
    console.log(`Черновиков: ${draftCount}`);
    const totalCount = await Article.countDocuments({});
    console.log(`Всего статей: ${totalCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

checkArticles(); 