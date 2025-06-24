const mongoose = require('mongoose');
require('dotenv').config({ path: '../config.env' });

const Like = require('../models/Like');

async function fixLikeIndexes() {
  try {
    // Подключаемся к базе данных
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/newsdb');
    console.log('Connected to MongoDB');

    console.log('\n=== FIXING LIKE INDEXES ===');

    // 1. Удаляем старые проблемные индексы
    const indexesToDrop = [
      'userFingerprint_1',
      'article_1_userFingerprint_1'
    ];

    for (const indexName of indexesToDrop) {
      try {
        await Like.collection.dropIndex(indexName);
        console.log(`✓ Dropped old index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`- Index ${indexName} does not exist (already dropped)`);
        } else {
          console.error(`✗ Failed to drop index ${indexName}:`, error.message);
        }
      }
    }

    // 2. Удаляем лайки с undefined userId
    const deletedCount = await Like.deleteMany({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: undefined },
        { userId: '' }
      ]
    });
    console.log(`✓ Deleted ${deletedCount.deletedCount} likes with invalid userId`);

    // 3. Проверяем текущие индексы
    console.log('\n=== CURRENT INDEXES AFTER CLEANUP ===');
    const currentIndexes = await Like.collection.getIndexes();
    Object.keys(currentIndexes).forEach(indexName => {
      console.log(`- ${indexName}: ${JSON.stringify(currentIndexes[indexName])}`);
    });

    // 4. Убеждаемся, что правильный индекс существует
    try {
      await Like.collection.createIndex(
        { article: 1, userId: 1 }, 
        { unique: true, name: 'article_1_userId_1' }
      );
      console.log('✓ Ensured correct unique index exists: article_1_userId_1');
    } catch (error) {
      if (error.code === 85) {
        console.log('- Correct unique index already exists');
      } else {
        console.error('✗ Failed to create index:', error.message);
      }
    }

    // 5. Проверяем оставшиеся лайки
    console.log('\n=== REMAINING LIKES ===');
    const remainingLikes = await Like.find({}).limit(10);
    console.log(`Total likes: ${await Like.countDocuments()}`);
    console.log('Sample likes:');
    remainingLikes.forEach((like, index) => {
      console.log(`${index + 1}. Article: ${like.article}, User: ${like.userId}, IP: ${like.ipAddress}`);
    });

    console.log('\n=== LIKES FIXED SUCCESSFULLY ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixLikeIndexes(); 