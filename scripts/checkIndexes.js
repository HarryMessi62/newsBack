const mongoose = require('mongoose');
require('dotenv').config({ path: '../config.env' });

const Like = require('../models/Like');
const Comment = require('../models/Comment');

async function checkAndFixIndexes() {
  try {
    // Подключаемся к базе данных
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/newsdb');
    console.log('Connected to MongoDB');

    // Проверяем индексы коллекции лайков
    console.log('\n=== LIKES COLLECTION INDEXES ===');
    const likeIndexes = await Like.collection.getIndexes();
    console.log('Current indexes:', JSON.stringify(likeIndexes, null, 2));

    // Проверяем индексы коллекции комментариев
    console.log('\n=== COMMENTS COLLECTION INDEXES ===');
    const commentIndexes = await Comment.collection.getIndexes();
    console.log('Current indexes:', JSON.stringify(commentIndexes, null, 2));

    // Проверяем документы в коллекции лайков
    console.log('\n=== LIKES DOCUMENTS ===');
    const likes = await Like.find({}).limit(10);
    console.log(`Total likes: ${await Like.countDocuments()}`);
    console.log('Sample likes:');
    likes.forEach((like, index) => {
      console.log(`${index + 1}. Article: ${like.article}, User: ${like.userId}, IP: ${like.ipAddress}`);
    });

    // Проверяем, есть ли проблемные индексы по IP
    const problematicIndexes = Object.keys(likeIndexes).filter(key => 
      key.includes('ipAddress') && key.includes('article')
    );
    
    if (problematicIndexes.length > 0) {
      console.log('\n=== FOUND PROBLEMATIC INDEXES ===');
      console.log('Problematic indexes:', problematicIndexes);
      
      console.log('\nDo you want to drop these indexes? (This will allow multiple users from same IP to like)');
      console.log('Run this script with --fix flag to actually drop them');
      
      if (process.argv.includes('--fix')) {
        for (const indexName of problematicIndexes) {
          try {
            await Like.collection.dropIndex(indexName);
            console.log(`Dropped index: ${indexName}`);
          } catch (error) {
            console.error(`Failed to drop index ${indexName}:`, error.message);
          }
        }
      }
    } else {
      console.log('\n=== NO PROBLEMATIC INDEXES FOUND ===');
    }

    // Проверяем дублирующие лайки по IP
    console.log('\n=== CHECKING FOR IP DUPLICATES ===');
    const ipDuplicates = await Like.aggregate([
      {
        $group: {
          _id: { article: '$article', ipAddress: '$ipAddress' },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (ipDuplicates.length > 0) {
      console.log('Found IP duplicates:');
      ipDuplicates.forEach((dup, index) => {
        console.log(`${index + 1}. Article: ${dup._id.article}, IP: ${dup._id.ipAddress}, Count: ${dup.count}, Users: ${dup.users.join(', ')}`);
      });
    } else {
      console.log('No IP duplicates found');
    }

    console.log('\n=== DONE ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAndFixIndexes(); 