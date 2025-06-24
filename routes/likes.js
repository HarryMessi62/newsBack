const express = require('express');
const router = express.Router();
const Like = require('../models/Like');
const Article = require('../models/Article');

// Получить информацию о лайках статьи
router.get('/article/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { fingerprint } = req.query;
    
    console.log('Getting article likes - Article:', articleId, 'User fingerprint:', fingerprint);
    
    // Проверяем, существует ли статья
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Получаем общее количество лайков
    const totalLikes = await Like.getArticleLikesCount(articleId);
    
    // Проверяем, лайкнул ли текущий пользователь
    let userLiked = false;
    if (fingerprint) {
      userLiked = await Like.hasUserLiked(articleId, fingerprint);
      console.log('User liked check result:', userLiked);
    }
    
    res.json({
      articleId,
      totalLikes,
      userLiked,
      stats: article.stats.likes
    });
  } catch (error) {
    console.error('Error getting article likes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Переключить лайк статьи
router.post('/article/:articleId/toggle', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { fingerprint } = req.body;
    
    console.log('Toggling like - Article:', articleId, 'User fingerprint:', fingerprint);
    
    if (!fingerprint) {
      return res.status(400).json({ error: 'User fingerprint is required' });
    }
    
    // Проверяем, существует ли статья
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Получаем IP адрес и User Agent
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    console.log('Request details - IP:', ipAddress, 'User-Agent:', userAgent);
    
    // Переключаем лайк
    const result = await Like.toggleLike(articleId, fingerprint, ipAddress, userAgent);
    
    console.log('Toggle result:', result);
    
    res.json({
      articleId,
      liked: result.liked,
      totalLikes: result.totalLikes,
      message: result.liked ? 'Article liked' : 'Like removed'
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    
    if (error.message === 'User has already liked this article') {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить статистику лайков пользователя
router.get('/user/:fingerprint/stats', async (req, res) => {
  try {
    const { fingerprint } = req.params;
    
    const stats = await Like.getUserLikeStats(fingerprint);
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting user like stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить топ статей по лайкам
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const topArticles = await Article.find({ status: 'published' })
      .sort({ 'stats.likes.total': -1 })
      .limit(limit)
      .select('title slug stats.likes category createdAt')
      .populate('author', 'username fullName');
    
    res.json(topArticles);
  } catch (error) {
    console.error('Error getting top liked articles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить общую статистику лайков
router.get('/stats', async (req, res) => {
  try {
    const totalLikes = await Like.countDocuments();
    const uniqueUsers = await Like.distinct('userId').then(ids => ids.length);
    const articlesWithLikes = await Like.distinct('article').then(articles => articles.length);
    
    // Статистика за последние 24 часа
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const likesToday = await Like.countDocuments({ createdAt: { $gte: yesterday } });
    
    // Статистика за последнюю неделю
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const likesThisWeek = await Like.countDocuments({ createdAt: { $gte: lastWeek } });
    
    res.json({
      totalLikes,
      uniqueUsers,
      articlesWithLikes,
      likesToday,
      likesThisWeek,
      averageLikesPerArticle: articlesWithLikes > 0 ? Math.round(totalLikes / articlesWithLikes) : 0
    });
  } catch (error) {
    console.error('Error getting likes stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 