const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Domain = require('../models/Domain');
const resolveDomain = require('../middleware/domainResolver');

// Генератор sitemap
const generateSitemap = (articles, baseUrl, listPagesXml = '', staticPages = []) => {
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

  // Генерируем статичные страницы
  const staticPagesXml = staticPages.map(page => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${page.changefreq || 'monthly'}</changefreq>
    <priority>${page.priority || '0.8'}</priority>
  </url>`).join('\n');

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
${staticPagesXml}
${listPagesXml}
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
router.get('/sitemap.xml', resolveDomain, async (req, res) => {
  try {
    // Получаем домен из middleware
    const domain = req.currentDomain;
    
    // Определяем базовый URL
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
    const protocolHeader = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
    
    // Используем URL домена из базы данных если есть, иначе из заголовков
    let baseUrl;
    if (domain && domain.url) {
      baseUrl = domain.url.replace(/\/$/, ''); // Убираем trailing slash
      console.log(`🗺️ Генерация sitemap для домена из БД: ${baseUrl} (${domain.name})`);
    } else {
      baseUrl = `${protocol}://${host}`;
      console.log(`🗺️ Генерация sitemap для домена из заголовков: ${baseUrl}`);
    }
    
    if (!domain) {
      console.log(`⚠️ Домен не определен через middleware, используем все статьи`);
    }
    
    // Получаем статьи для данного домена
    let query = { 
      status: 'published',
      publishedAt: { $lte: new Date() },
      isParsed: { $ne: true }
    };
    let query2 = { 
      status: 'published',
      publishedAt: { $lte: new Date() },
    };
    
    if (domain) {
      query.domain = domain._id;
    }
    if (domain) {
      query2.domain = domain._id;
    }
    
    const PER_PAGE = 12; // Должен совпадать с фронтом

    // Считаем общее количество статей для расчёта пагинации
    const totalArticles = await Article.countDocuments(query2);
    const totalPages = Math.ceil(totalArticles / PER_PAGE);
    
    // Логируем информацию о домене и статьях
    if (domain) {
      console.log(`📊 Домен: ${domain.name} (${domain._id})`);
      console.log(`📄 Статей для домена: ${totalArticles}, страниц: ${totalPages}`);
    } else {
      console.log(`📊 Все домены`);
      console.log(`📄 Всего статей: ${totalArticles}, страниц: ${totalPages}`);
    }

    // Получаем статьи (ограничив 5000 для производительности)
    const articles = await Article.find(query)
      .select('slug title publishedAt updatedAt category')
      .sort({ publishedAt: -1 })
      .limit(5000);

    // Формируем XML для страниц списка статей, начиная со 2-й (первая /articles уже добавлена выше)
    let listPagesXml = '';
    for (let p = 2; p <= totalPages; p++) {
      listPagesXml += `  <url>\n    <loc>${baseUrl}/articles?page=${p}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    }
    
    console.log(`✅ Сгенерировано ${articles.length} статей для sitemap`);
    
    // Определяем статичные страницы в зависимости от домена
    const staticPages = [
      { url: '/about', changefreq: 'monthly', priority: '0.8' },
      { url: '/contacts', changefreq: 'monthly', priority: '0.8' },
      { url: '/privacy', changefreq: 'yearly', priority: '0.5' }
    ];
    
    // Генерируем sitemap
    const sitemap = generateSitemap(articles, baseUrl, listPagesXml, staticPages);
    
    // Устанавливаем правильные заголовки
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      // Полностью отключаем кеширование
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
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
router.get('/robots.txt', resolveDomain, async (req, res) => {
  try {
    // Получаем домен из middleware
    const domain = req.currentDomain;
    
    // Определяем базовый URL
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
    const protocolHeader = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
    
    // Используем URL домена из базы данных если есть, иначе из заголовков
    let baseUrl;
    if (domain && domain.url) {
      baseUrl = domain.url.replace(/\/$/, ''); // Убираем trailing slash
    } else {
      baseUrl = `${protocol}://${host}`;
    }
    
    const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /uploads

Sitemap: ${baseUrl}/sitemap.xml`;

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600' // Кэш на 24 часа
    });
    
    res.send(robotsTxt);
    
  } catch (error) {
    console.error('❌ Ошибка генерации robots.txt:', error);
    res.status(500).send('Error generating robots.txt');
  }
});

module.exports = router; 