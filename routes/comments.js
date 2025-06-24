const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Article = require('../models/Article');

// Получить комментарии статьи
router.get('/article/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { page = 1, limit = 20, userId } = req.query;
    
    // Проверяем, существует ли статья
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Получаем комментарии
    const result = await Comment.getArticleComments(articleId, parseInt(page), parseInt(limit));
    
    // Проверяем, комментировал ли текущий пользователь
    let userHasCommented = false;
    if (userId) {
      userHasCommented = await Comment.hasUserCommented(articleId, userId);
    }
    
    res.json({
      ...result,
      userHasCommented
    });
  } catch (error) {
    console.error('Error getting article comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить комментарий
router.post('/article/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { userId, userEmail, text } = req.body;
    
    if (!userId || !userEmail || !text) {
      return res.status(400).json({ 
        error: 'User ID, email and comment text are required' 
      });
    }
    
    if (text.trim().length < 1) {
      return res.status(400).json({ 
        error: 'Comment text cannot be empty' 
      });
    }
    
    if (text.length > 1000) {
      return res.status(400).json({ 
        error: 'Comment text cannot exceed 1000 characters' 
      });
    }
    
    // Проверяем, существует ли статья
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Получаем IP адрес и User Agent
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Добавляем комментарий
    const comment = await Comment.addComment(
      articleId, 
      userId, 
      userEmail, 
      text.trim(), 
      ipAddress, 
      userAgent
    );
    
    res.status(201).json({
      success: true,
      comment: {
        _id: comment._id,
        text: comment.text,
        userEmail: comment.userEmail,
        likes: comment.likes,
        createdAt: comment.createdAt
      },
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    
    if (error.message === 'User has already commented on this article') {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Лайкнуть/убрать лайк с комментария
router.post('/comment/:commentId/like', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const result = await Comment.toggleCommentLike(commentId, userId);
    
    res.json({
      commentId,
      liked: result.liked,
      totalLikes: result.totalLikes,
      message: result.liked ? 'Comment liked' : 'Like removed'
    });
  } catch (error) {
    console.error('Error toggling comment like:', error);
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить комментарий пользователя
router.delete('/article/:articleId/user/:userId', async (req, res) => {
  try {
    const { articleId, userId } = req.params;
    
    await Comment.deleteUserComment(articleId, userId);
    
    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    
    if (error.message === 'Comment not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить статистику комментариев пользователя
router.get('/user/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stats = await Comment.getUserCommentStats(userId);
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting user comment stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Проверить, комментировал ли пользователь статью
router.get('/article/:articleId/user/:userId/check', async (req, res) => {
  try {
    const { articleId, userId } = req.params;
    
    const hasCommented = await Comment.hasUserCommented(articleId, userId);
    
    res.json({
      articleId,
      userId,
      hasCommented
    });
  } catch (error) {
    console.error('Error checking user comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить общую статистику комментариев
router.get('/stats', async (req, res) => {
  try {
    const totalComments = await Comment.countDocuments({ status: 'active' });
    const uniqueUsers = await Comment.distinct('userId', { status: 'active' }).then(ids => ids.length);
    const articlesWithComments = await Comment.distinct('article', { status: 'active' }).then(articles => articles.length);
    
    // Статистика за последние 24 часа
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const commentsToday = await Comment.countDocuments({ 
      status: 'active',
      createdAt: { $gte: yesterday } 
    });
    
    // Статистика за последнюю неделю
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const commentsThisWeek = await Comment.countDocuments({ 
      status: 'active',
      createdAt: { $gte: lastWeek } 
    });
    
    res.json({
      totalComments,
      uniqueUsers,
      articlesWithComments,
      commentsToday,
      commentsThisWeek,
      averageCommentsPerArticle: articlesWithComments > 0 ? Math.round(totalComments / articlesWithComments) : 0
    });
  } catch (error) {
    console.error('Error getting comments stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 