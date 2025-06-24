const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
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
  userEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  text: {
    type: String,
    required: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    userId: String,
    timestamp: { type: Date, default: Date.now }
  }],
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'deleted', 'moderated'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ userId: 1 });
commentSchema.index({ userEmail: 1 });
commentSchema.index({ status: 1 });

// Составной индекс для предотвращения дублирования комментариев от одного пользователя к одной статье
commentSchema.index({ article: 1, userId: 1 }, { unique: true });

// Статический метод для получения комментариев статьи
commentSchema.statics.getArticleComments = async function(articleId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const comments = await this.find({ 
    article: articleId, 
    status: 'active' 
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean();
  
  const total = await this.countDocuments({ 
    article: articleId, 
    status: 'active' 
  });
  
  return {
    comments,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
};

// Статический метод для добавления комментария
commentSchema.statics.addComment = async function(articleId, userId, userEmail, text, ipAddress, userAgent) {
  try {
    console.log('Adding comment - Article:', articleId, 'User:', userId, 'Email:', userEmail);
    
    // Проверяем, не оставлял ли пользователь уже комментарий к этой статье
    const existingComment = await this.findOne({ article: articleId, userId });
    
    if (existingComment) {
      throw new Error('User has already commented on this article');
    }
    
    // Создаем новый комментарий
    const comment = await this.create({
      article: articleId,
      userId,
      userEmail,
      text,
      ipAddress,
      userAgent
    });
    
    // Обновляем счетчик комментариев в статье
    await mongoose.model('Article').findByIdAndUpdate(articleId, {
      $inc: { 'stats.comments.real': 1, 'stats.comments.total': 1 }
    });
    
    return comment;
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('User has already commented on this article');
    }
    console.error('Add comment error:', error);
    throw error;
  }
};

// Статический метод для лайка комментария
commentSchema.statics.toggleCommentLike = async function(commentId, userId) {
  try {
    const comment = await this.findById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    const existingLike = comment.likedBy.find(like => like.userId === userId);
    
    if (existingLike) {
      // Убираем лайк
      comment.likedBy = comment.likedBy.filter(like => like.userId !== userId);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      // Добавляем лайк
      comment.likedBy.push({ userId });
      comment.likes += 1;
    }
    
    await comment.save();
    
    return {
      liked: !existingLike,
      totalLikes: comment.likes
    };
  } catch (error) {
    console.error('Toggle comment like error:', error);
    throw error;
  }
};

// Статический метод для проверки, комментировал ли пользователь статью
commentSchema.statics.hasUserCommented = async function(articleId, userId) {
  const comment = await this.findOne({ article: articleId, userId, status: 'active' });
  return !!comment;
};

// Статический метод для получения статистики комментариев пользователя
commentSchema.statics.getUserCommentStats = async function(userId) {
  const comments = await this.find({ userId, status: 'active' })
    .populate('article', 'title slug')
    .lean();
  
  return {
    total: comments.length,
    articles: comments.map(comment => ({
      articleId: comment.article._id,
      title: comment.article.title,
      slug: comment.article.slug,
      text: comment.text,
      likes: comment.likes,
      commentedAt: comment.createdAt
    }))
  };
};

// Статический метод для удаления комментария пользователя
commentSchema.statics.deleteUserComment = async function(articleId, userId) {
  try {
    const comment = await this.findOne({ article: articleId, userId });
    
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    // Помечаем как удаленный вместо физического удаления
    comment.status = 'deleted';
    await comment.save();
    
    // Обновляем счетчик комментариев в статье
    await mongoose.model('Article').findByIdAndUpdate(articleId, {
      $inc: { 'stats.comments.real': -1, 'stats.comments.total': -1 }
    });
    
    return true;
  } catch (error) {
    console.error('Delete comment error:', error);
    throw error;
  }
};

module.exports = mongoose.model('Comment', commentSchema); 