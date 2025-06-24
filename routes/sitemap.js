const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Domain = require('../models/Domain');

// Генератор sitemap
const generateSitemap = (articles, baseUrl) => {
  const urls = articles.map(article => {
    const lastmod = article.updatedAt ? article.updatedAt.toISOString() : article.publishedAt.toISOString();
    const priority = getPriority(article);
    
    return `  <url>
    <loc>${baseUrl}/article/${article.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/articles</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${urls}
</urlset>`;
};

// Определение приоритета страницы
const getPriority = (article) => {
  const now = new Date();
  const publishedAt = new Date(article.publishedAt);
  const daysDiff = (now - publishedAt) / (1000 * 60 * 60 * 24);
  
  // Более новые статьи имеют больший приоритет
  if (daysDiff < 7) return '0.9';
  if (daysDiff < 30) return '0.8';
  if (daysDiff < 90) return '0.7';
  return '0.6';
};

// Роут для sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    // Получаем домен из заголовков
    const host = req.get('host') || req.get('origin') || 'localhost';
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const baseUrl = `${protocol}://${host}`;
    
    console.log(`🗺️ Генерация sitemap для домена: ${baseUrl}`);
    
    // Ищем домен в базе данных
    let domain = await Domain.findOne({ 
      $or: [
        { url: baseUrl },
        { url: `${baseUrl}/` },
        { url: host },
        { name: host }
      ]
    });
    
    // Если домен не найден, создаем временный
    if (!domain) {
      console.log(`⚠️ Домен ${host} не найден в базе, используем все статьи`);
      domain = null;
    }
    
    // Получаем статьи для данного домена
    let query = { 
      status: 'published',
      publishedAt: { $lte: new Date() }
    };
    
    if (domain) {
      query.domain = domain._id;
    }
    
    const articles = await Article.find(query)
      .select('slug title publishedAt updatedAt category')
      .sort({ publishedAt: -1 })
      .limit(5000); // Ограничиваем для производительности
    
    console.log(`📄 Найдено ${articles.length} статей для sitemap`);
    
    // Генерируем sitemap
    const sitemap = generateSitemap(articles, baseUrl);
    
    // Устанавливаем правильные заголовки
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // Кэш на 1 час
      'X-Robots-Tag': 'index, follow'
    });
    
    res.send(sitemap);
    
  } catch (error) {
    console.error('❌ Ошибка генерации sitemap:', error);
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>Ошибка генерации sitemap: ${error.message}</error>`);
  }
});

// Роут для robots.txt
router.get('/robots.txt', async (req, res) => {
  try {
    const host = req.get('host') || 'localhost';
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const baseUrl = `${protocol}://${host}`;
    
    const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /uploads

Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay для вежливого сканирования
Crawl-delay: 1`;

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400' // Кэш на 24 часа
    });
    
    res.send(robotsTxt);
    
  } catch (error) {
    console.error('❌ Ошибка генерации robots.txt:', error);
    res.status(500).send('Error generating robots.txt');
  }
});

module.exports = router; 