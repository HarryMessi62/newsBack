const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Составной индекс для предотвращения дублирования лайков ТОЛЬКО по userId
likeSchema.index({ article: 1, userId: 1 }, { unique: true });

// Индексы для быстрого поиска
likeSchema.index({ article: 1 });
likeSchema.index({ userId: 1 });
likeSchema.index({ createdAt: -1 });

// НЕ добавляем индекс по IP - разные пользователи с одного IP должны мочь лайкать
// likeSchema.index({ article: 1, ipAddress: 1 }, { unique: true }); // НЕ ИСПОЛЬЗУЕМ!

// Статический метод для получения количества лайков статьи
likeSchema.statics.getArticleLikesCount = async function(articleId) {
  return await this.countDocuments({ article: articleId });
};

// Статический метод для проверки, лайкнул ли пользователь статью
likeSchema.statics.hasUserLiked = async function(articleId, userId) {
  const like = await this.findOne({ article: articleId, userId });
  return !!like;
};

// Статический метод для переключения лайка
likeSchema.statics.toggleLike = async function(articleId, userId, ipAddress, userAgent) {
  try {
    console.log('Toggle like - Article:', articleId, 'User:', userId);
    
    // Проверяем, есть ли уже лайк
    const existingLike = await this.findOne({ article: articleId, userId });
    
    if (existingLike) {
      console.log('Removing existing like');
      // Убираем лайк
      await this.deleteOne({ _id: existingLike._id });
      
      // Обновляем счетчик в статье
      await mongoose.model('Article').findByIdAndUpdate(articleId, {
        $inc: { 'stats.likes.real': -1, 'stats.likes.total': -1 }
      });
      
      return { liked: false, totalLikes: await this.getArticleLikesCount(articleId) };
    } else {
      console.log('Adding new like');
      // Добавляем лайк
      await this.create({
        article: articleId,
        userId,
        ipAddress,
        userAgent
      });
      
      // Обновляем счетчик в статье
      await mongoose.model('Article').findByIdAndUpdate(articleId, {
        $inc: { 'stats.likes.real': 1, 'stats.likes.total': 1 }
      });
      
      return { liked: true, totalLikes: await this.getArticleLikesCount(articleId) };
    }
  } catch (error) {
    if (error.code === 11000) {
      // Дублирование - пользователь уже лайкнул
      console.log('Duplicate like attempt');
      throw new Error('User has already liked this article');
    }
    console.error('Toggle like error:', error);
    throw error;
  }
};

// Статический метод для получения статистики лайков пользователя
likeSchema.statics.getUserLikeStats = async function(userId) {
  const likes = await this.find({ userId }).populate('article', 'title slug');
  return {
    total: likes.length,
    articles: likes.map(like => ({
      articleId: like.article._id,
      title: like.article.title,
      slug: like.article.slug,
      likedAt: like.createdAt
    }))
  };
};

module.exports = mongoose.model('Like', likeSchema); 