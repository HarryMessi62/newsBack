const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Article = require('../models/Article');
const Domain = require('../models/Domain');
const User = require('../models/User');
const ParserSettings = require('../models/ParserSettings');
const RSSParser = require('./rssParser');

class NewsParser {
  constructor() {
    this.settings = null;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
    ];
    this.currentProxyIndex = 0;
    this.sessionCookies = null;
  }

  // Инициализация парсера
  async init() {
    try {
      this.settings = await ParserSettings.findOne({}) || await ParserSettings.create({});
      console.log('NewsParser инициализирован');
    } catch (error) {
      console.error('Ошибка инициализации парсера:', error);
      throw error;
    }
  }

  // Получение случайного User-Agent
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // Получение улучшенных заголовков для запроса
  getRequestHeaders(referer = null) {
    const userAgent = this.getRandomUserAgent();
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    if (this.sessionCookies) {
      headers['Cookie'] = this.sessionCookies;
    }

    return headers;
  }

  // Создание сессии для обхода защиты
  async createSession() {
    try {
      console.log('🔧 Создание сессии...');
      
      // Сначала делаем запрос на главную страницу для получения cookies
      const response = await axios.get('https://cryptonews.com/', {
        headers: this.getRequestHeaders(),
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Принимаем 4xx коды
      });

      // Сохраняем cookies из ответа
      if (response.headers['set-cookie']) {
        this.sessionCookies = response.headers['set-cookie']
          .map(cookie => cookie.split(';')[0])
          .join('; ');
        console.log('🍪 Cookies сохранены');
      }

      // Небольшая задержка
      await this.delay(2000 + Math.random() * 3000);
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка создания сессии:', error.message);
      return false;
    }
  }

  // Получение списка статей с главной страницы
  async getArticleLinks(maxArticles = 10) {
    try {
      // Создаем сессию если её нет
      if (!this.sessionCookies) {
        await this.createSession();
      }

      console.log(`📰 Получение списка статей (цель: ${maxArticles})...`);
      const sourceUrl = this.settings?.parser?.sourceUrl || 'https://cointelegraph.com/news';
      
      // Пробуем разные страницы для получения большего количества статей
      const articleLinks = [];
      const processedUrls = new Set();
      
      // Основная страница
      await this.getArticleLinksFromPage(sourceUrl, articleLinks, processedUrls, maxArticles);
      
      // Если нужно больше статей, пробуем дополнительные страницы
      if (articleLinks.length < maxArticles) {
        const baseUrlObj = new URL(sourceUrl);
        const additionalPages = [
          `${sourceUrl}?page=2`,
          `${sourceUrl}?page=3`,
          `${baseUrlObj.origin}/news/latest`,
          `${baseUrlObj.origin}/news/bitcoin`,
          `${baseUrlObj.origin}/news/ethereum`,
          `${baseUrlObj.origin}/news/altcoin`,
          `${baseUrlObj.origin}/news/defi`,
          `${baseUrlObj.origin}/news/nft`,
          `${baseUrlObj.origin}/news/regulation`,
          `${baseUrlObj.origin}/news/technology`
        ];
        
        for (const pageUrl of additionalPages) {
          if (articleLinks.length >= maxArticles * 1.5) break; // Получаем с запасом
          
          try {
            await this.delay(1500); // Увеличиваем задержку между запросами
            await this.getArticleLinksFromPage(pageUrl, articleLinks, processedUrls, maxArticles);
            console.log(`📄 Всего найдено статей: ${articleLinks.length}`);
          } catch (error) {
            console.warn(`⚠️ Не удалось загрузить страницу ${pageUrl}:`, error.message);
          }
        }
      }

      console.log(`Найдено ${articleLinks.length} уникальных ссылок на статьи`);
      return articleLinks.slice(0, maxArticles);

    } catch (error) {
      console.error('Ошибка получения списка статей:', error.message);
      return [];
    }
  }

  // Вспомогательная функция для получения статей с одной страницы
  async getArticleLinksFromPage(pageUrl, articleLinks, processedUrls, maxArticles) {
    try {
      const response = await axios.get(pageUrl, {
        headers: this.getRequestHeaders(pageUrl),
        timeout: this.settings?.parser?.requestTimeout || 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const $ = cheerio.load(response.data);
      const baseUrl = new URL(pageUrl).origin;
      
      // Парсим ссылки на статьи с улучшенными селекторами для разных сайтов
      const selectors = [
        // CoinTelegraph селекторы
        'article a[href*="/news/"]', // Статьи CoinTelegraph
        'a[data-testid="article-card-link"]', // CoinTelegraph карточки статей
        '.post-card-inline a[href*="/news/"]', // Карточки постов
        
        // Универсальные селекторы
        'article h2 a', // Заголовки статей в article тегах
        'h2 a[href*="/news/"]', // Любые h2 со ссылками на новости
        'h3 a[href*="/news/"]', // Любые h3 со ссылками на новости
        '.post-item a[href*="/news/"]', // Элементы постов
        '.news-item a[href*="/news/"]', // Элементы новостей
        '.article-title a', // Заголовки статей
        '.title a[href*="/news/"]', // Элементы с классом title
        'a[href*="/news/"][title]' // Любые ссылки на новости с атрибутом title
      ];

      for (const selector of selectors) {
        if (articleLinks.length >= maxArticles) break;
        
        $(selector).each((index, element) => {
          if (articleLinks.length >= maxArticles) return false;
          
          const href = $(element).attr('href');
          let title = $(element).text().trim() || 
                     $(element).attr('title') || 
                     $(element).find('span, div').first().text().trim() || '';
          
          // Очищаем заголовок от лишних символов
          title = title.replace(/^\s*[\d\.\-\–\—]+\s*/, '').trim();
          
          if (href && title && title.length > 15 && href.includes('/news/')) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
            
            // Проверяем что это действительно ссылка на статью, а не категорию
            const isValidArticle = fullUrl.match(/\/news\/[^\/]+\/$/) || 
                                  fullUrl.match(/\/news\/[^\/]+-\d+$/) ||
                                  fullUrl.match(/\/news\/[\w-]+$/);
            
            // Проверяем уникальность URL
            if (isValidArticle && !processedUrls.has(fullUrl)) {
              processedUrls.add(fullUrl);
              articleLinks.push({
                url: fullUrl,
                title: title.substring(0, 200),
                found_at: new Date()
              });
              console.log(`Найдена статья: ${title.substring(0, 80)}...`);
            }
          }
        });
      }

    } catch (error) {
      console.warn(`Ошибка загрузки страницы ${pageUrl}:`, error.message);
    }
  }

  // Парсинг отдельной статьи
  async parseArticle(articleUrl) {
    try {
      console.log(`Парсинг статьи: ${articleUrl}`);
      
      // Задержка между запросами
      if (this.settings?.parser?.requestDelay) {
        await this.delay(this.settings.parser.requestDelay);
      }

      const response = await axios.get(articleUrl, {
        headers: this.getRequestHeaders('https://cryptonews.com/news/'),
        timeout: this.settings?.parser?.requestTimeout || 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const $ = cheerio.load(response.data);

      // Извлекаем данные статьи
      const title = this.extractTitle($);
      const content = await this.extractContent($, articleUrl);
      const excerpt = this.generateExcerpt(content);
      const images = await this.extractImages($, articleUrl);
      const publishDate = this.extractPublishDate($);
      const tags = this.extractTags($);

      // Проверяем на дубликаты
      const existingArticle = await Article.findOne({
        $or: [
          { title: title },
          { slug: this.generateSlug(title) }
        ]
      });

      if (existingArticle) {
        console.log(`Статья уже существует: ${title}`);
        return { success: false, reason: 'duplicate', title };
      }

      // Проверяем минимальную длину контента
      if (content.length < (this.settings?.content?.minContentLength || 500)) {
        console.log(`Статья слишком короткая: ${title}`);
        return { success: false, reason: 'too_short', title };
      }

      return {
        success: true,
        data: {
          title,
          content,
          excerpt,
          images,
          publishDate,
          tags,
          sourceUrl: articleUrl
        }
      };

    } catch (error) {
      console.error(`Ошибка парсинга статьи ${articleUrl}:`, error.message);
      
      // Если получили 403, пробуем повторить с новой сессией
      if (error.response?.status === 403) {
        console.log('🔄 Статья заблокирована, пересоздаем сессию...');
        this.sessionCookies = null;
        
        // Ждем случайное время
        await this.delay(3000 + Math.random() * 7000);
        
        try {
          // Создаем новую сессию
          await this.createSession();
          
          // Повторяем запрос
          const retryResponse = await axios.get(articleUrl, {
            headers: this.getRequestHeaders('https://cryptonews.com/news/'),
            timeout: this.settings?.parser?.requestTimeout || 30000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500
          });
          
          const $ = cheerio.load(retryResponse.data);
          
          // Повторяем извлечение данных
          const title = this.extractTitle($);
          const content = await this.extractContent($, articleUrl);
          const excerpt = this.generateExcerpt(content);
          const images = await this.extractImages($, articleUrl);
          const publishDate = this.extractPublishDate($);
          const tags = this.extractTags($);
          
          // Проверяем на дубликаты
          const existingArticle = await Article.findOne({
            $or: [
              { title: title },
              { slug: this.generateSlug(title) }
            ]
          });
          
          if (existingArticle) {
            console.log(`Статья уже существует: ${title}`);
            return { success: false, reason: 'duplicate', title };
          }
          
          // Проверяем минимальную длину контента
          if (content.length < (this.settings?.content?.minContentLength || 500)) {
            console.log(`Статья слишком короткая: ${title}`);
            return { success: false, reason: 'too_short', title };
          }
          
          return {
            success: true,
            data: {
              title,
              content,
              excerpt,
              images,
              publishDate,
              tags,
              sourceUrl: articleUrl
            }
          };
          
        } catch (retryError) {
          console.error(`❌ Повторная попытка парсинга также неудачна: ${retryError.message}`);
          return { success: false, reason: 'parse_error', error: retryError.message };
        }
      }
      
      return { success: false, reason: 'parse_error', error: error.message };
    }
  }

  // Извлечение заголовка
  extractTitle($) {
    const selectors = [
      'h1.article-title',
      'h1.post-title', 
      'h1.entry-title',
      '.article-header h1',
      '.post-header h1',
      'h1',
      'title'
    ];

    for (const selector of selectors) {
      const title = $(selector).first().text().trim();
      if (title && title.length > 10) {
        return title.substring(0, 200);
      }
    }

    return 'Untitled Article';
  }

  // Извлечение контента
  async extractContent($, url) {
    const selectors = [
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content',
      'article .text',
      '.article-body',
      '.post-body'
    ];

    let content = '';

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        // Удаляем ненужные элементы
        element.find('script, style, .ads, .advertisement, .social-share, .related-posts').remove();
        
        content = element.html() || '';
        if (content && content.length > 200) {
          break;
        }
      }
    }

    // Если не нашли контент, пробуем найти основной текст
    if (!content || content.length < 200) {
      $('p').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 50) {
          content += `<p>${text}</p>\n`;
        }
      });
    }

    // Обрабатываем изображения в контенте
    if (this.settings?.content?.saveImages) {
      content = await this.processImagesInContent(content, url);
    }

    return this.cleanContent(content);
  }

  // Извлечение изображений
  async extractImages($, baseUrl) {
    const images = [];
    
    if (!this.settings?.content?.saveImages) {
      return images;
    }

    const imageSelectors = [
      '.article-image img',
      '.featured-image img',
      '.post-thumbnail img',
      'article img',
      '.content img'
    ];

    for (const selector of imageSelectors) {
      $(selector).each(async (i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src && !src.includes('data:image')) {
          const fullUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
          const alt = $(img).attr('alt') || '';
          
          images.push({
            url: fullUrl,
            alt: alt,
            caption: ''
          });
        }
      });
    }

    return images.slice(0, 10); // Максимум 10 изображений
  }

  // Извлечение даты публикации
  extractPublishDate($) {
    const selectors = [
      'time[datetime]',
      '.publish-date',
      '.post-date',
      '.article-date',
      '[data-date]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const datetime = element.attr('datetime') || element.attr('data-date') || element.text();
        const date = new Date(datetime);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return new Date(); // Текущая дата, если не найдена
  }

  // Извлечение тегов
  extractTags($) {
    const tags = [];
    
    $('.tags a, .post-tags a, .article-tags a, .tag-links a').each((i, elem) => {
      const tag = $(elem).text().trim();
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    });

    return tags.slice(0, 10);
  }

  // Сохранение изображения
  async saveImage(imageUrl, articleSlug) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://cryptonews.com/'
        }
      });

      // Проверяем размер файла
      if (response.data.length > (this.settings?.content?.maxImageSize || 5 * 1024 * 1024)) {
        console.log(`Изображение слишком большое: ${imageUrl}`);
        return null;
      }

      // Получаем расширение файла
      const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
      const filename = `${articleSlug}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
      
      const uploadDir = path.join(__dirname, '../uploads/images');
      const filepath = path.join(uploadDir, filename);

      // Создаем директорию если не существует
      await fs.mkdir(uploadDir, { recursive: true });

      // Сохраняем файл
      await fs.writeFile(filepath, response.data);

      return {
        url: `/uploads/images/${filename}`,
        originalUrl: imageUrl
      };

    } catch (error) {
      console.error(`Ошибка сохранения изображения ${imageUrl}:`, error.message);
      return null;
    }
  }

  // Обработка изображений в контенте
  async processImagesInContent(content, baseUrl) {
    const $ = cheerio.load(content);
    
    const images = $('img');
    for (let i = 0; i < images.length; i++) {
      const img = images.eq(i);
      const src = img.attr('src');
      
      if (src && !src.startsWith('data:') && !src.includes('base64')) {
        const fullUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
        const savedImage = await this.saveImage(fullUrl, 'parsed');
        
        if (savedImage) {
          img.attr('src', savedImage.url);
        }
      }
    }
    
    return $.html();
  }

  // Очистка контента
  cleanContent(content) {
    if (!content) return '';
    
    // Удаляем лишние пробелы и переносы
    content = content.replace(/\n\s*\n/g, '\n');
    content = content.replace(/\s+/g, ' ');
    
    // Базовая очистка HTML
    content = content.replace(/<script[^>]*>.*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>.*?<\/style>/gi, '');
    content = content.replace(/<!--.*?-->/g, '');
    
    return content.trim();
  }

  // Генерация excerpt
  generateExcerpt(content) {
    if (!content) return '';
    
    // Удаляем HTML теги для генерации excerpt
    const text = content.replace(/<[^>]*>/g, '').trim();
    const length = this.settings?.content?.excerptLength || 200;
    
    if (text.length <= length) return text;
    
    return text.substring(0, length).replace(/\s+\S*$/, '') + '...';
  }

  // Генерация slug
  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  // Сохранение статьи в базу данных
  async saveArticle(articleData, domainId, authorId) {
    try {
      const slug = this.generateSlug(articleData.title);
      
      // Подготавливаем медиа файлы
      const media = {
        featuredImage: null,
        gallery: []
      };

      if (articleData.images && articleData.images.length > 0) {
        // Первое изображение как featured
        if (articleData.images[0]) {
          const savedImage = await this.saveImage(articleData.images[0].url, slug);
          if (savedImage) {
            media.featuredImage = {
              url: savedImage.url,
              alt: articleData.images[0].alt || articleData.title,
              caption: articleData.images[0].caption || ''
            };
          }
        }

        // Остальные в галерею
        if (articleData.images.length > 1) {
          for (let i = 1; i < Math.min(articleData.images.length, 6); i++) {
            const savedImage = await this.saveImage(articleData.images[i].url, slug);
            if (savedImage) {
              media.gallery.push({
                url: savedImage.url,
                alt: articleData.images[i].alt || '',
                caption: articleData.images[i].caption || '',
                position: i
              });
            }
          }
        }
      }

      // ---- Генерируем начальные фейковые просмотры/лайки по диапазону ----
      const rangeOrDefault = (range) => {
        const min = Number(range?.min ?? 0);
        const max = Number(range?.max ?? 0);
        if (max <= min) return min;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      };

      const fakeViews = rangeOrDefault(this.settings?.initialStats?.views);
      const fakeLikes = rangeOrDefault(this.settings?.initialStats?.likes);

      const article = new Article({
        title: articleData.title,
        slug: slug,
        content: articleData.content,
        excerpt: articleData.excerpt,
        media: media,
        category: this.settings?.publishing?.defaultCategory || 'Crypto',
        tags: articleData.tags || this.settings?.publishing?.defaultTags || [],
        status: this.settings?.publishing?.defaultStatus || 'draft',
        publishedAt: this.settings?.publishing?.autoPublish ? new Date() : null,
        author: authorId,
        domain: domainId,
        stats: {
          views: { fake: fakeViews, real: 0, total: fakeViews },
          likes: { fake: fakeLikes, real: 0, total: fakeLikes },
          comments: { fake: 0, real: 0, total: 0 },
          shares: { fake: 0, real: 0, total: 0 }
        },
        seo: {
          metaTitle: articleData.title,
          metaDescription: articleData.excerpt,
          keywords: articleData.tags || []
        }
      });

      await article.save();
      console.log(`Статья сохранена: ${articleData.title}`);
      
      return { success: true, article };

    } catch (error) {
      console.error('Ошибка сохранения статьи:', error);
      return { success: false, error: error.message };
    }
  }

  // Основной метод парсинга
  async parseNews(options = {}) {
    // Проверяем, нужно ли использовать RSS парсер
    if (options.useRSS || this.settings?.parser?.useRSS) {
      console.log('🔄 Используем RSS парсер...');
      const rssParser = new RSSParser();
      return await rssParser.parseRSSArticles(options.count || this.settings.parser.articlesPerRun);
    }
    
    // Иначе используем обычный HTML парсинг
    const startTime = new Date();
    const result = {
      startTime,
      endTime: null,
      articlesFound: 0,
      articlesProcessed: 0,
      articlesSuccess: 0,
      articlesFailed: 0,
      errors: [],
      status: 'success'
    };

    try {
      // Проверяем настройки
      if (!this.settings) {
        await this.init();
      }

      if (!this.settings.parser.enabled && !options.manual) {
        throw new Error('Парсер отключен');
      }

      // Получаем настройки доменов и автора
      const domains = await Domain.find({ _id: { $in: this.settings.domains.targetDomains.map(d => d.domainId) } });
      const defaultAuthor = await User.findById(this.settings.publishing.defaultAuthor);

      if (domains.length === 0) {
        throw new Error('Не найдены целевые домены для публикации');
      }

      if (!defaultAuthor) {
        throw new Error('Не найден автор по умолчанию');
      }

      // Получаем нужное количество новых статей
      const targetArticles = options.count || this.settings.parser.articlesPerRun;
      let duplicateCount = 0;
      let processedUrls = new Set();
      let currentBatchSize = Math.max(targetArticles * 2, 15); // Начинаем с большего размера
      let maxIterations = 5; // Максимум 5 итераций поиска
      let iteration = 0;

      console.log(`🎯 Цель: найти ${targetArticles} новых статей`);

      // Продолжаем искать статьи пока не достигнем цели
      while (result.articlesSuccess < targetArticles && iteration < maxIterations) {
        iteration++;
        console.log(`\n🔍 Итерация ${iteration}: ищем ${currentBatchSize} статей...`);
        
        // Получаем новую порцию статей
        const articleLinks = await this.getArticleLinks(currentBatchSize);
        
        // Фильтруем уже обработанные URL
        const newLinks = articleLinks.filter(link => !processedUrls.has(link.url));
        
        if (newLinks.length === 0) {
          console.log(`⚠️ Новых статей не найдено в итерации ${iteration}`);
          currentBatchSize += 10; // Увеличиваем размер для следующей итерации
          continue;
        }
        
        console.log(`📄 Найдено ${newLinks.length} новых статей для обработки`);
        result.articlesFound += newLinks.length;

        // Обрабатываем новые статьи
        for (const link of newLinks) {
          // Прерываем если достигли цели
          if (result.articlesSuccess >= targetArticles) {
            console.log(`🎉 Достигнута цель: ${targetArticles} статей!`);
            break;
          }

          processedUrls.add(link.url);

          try {
            result.articlesProcessed++;
            
            const parseResult = await this.parseArticle(link.url);
            
            if (parseResult.success) {
              // Выбираем домен для публикации
              const domain = this.selectDomain(domains);
              
              const saveResult = await this.saveArticle(
                parseResult.data,
                domain._id,
                defaultAuthor._id
              );

              if (saveResult.success) {
                result.articlesSuccess++;
                console.log(`✅ Успешно спарсена: ${parseResult.data.title.substring(0, 60)}... (${result.articlesSuccess}/${targetArticles})`);
              } else {
                result.articlesFailed++;
                result.errors.push(`Ошибка сохранения: ${saveResult.error}`);
              }
            } else {
              // Считаем дубликаты отдельно (не как ошибки)
              if (parseResult.reason === 'duplicate') {
                duplicateCount++;
                console.log(`⏭️ Дубликат: ${parseResult.title.substring(0, 60)}... (${duplicateCount} дубликатов)`);
                // Дубликаты НЕ считаем как неудачные - это нормально
              } else {
                // Только реальные ошибки считаем как неудачные
                result.articlesFailed++;
                result.errors.push(`${link.title}: ${parseResult.reason}`);
              }
            }

          } catch (error) {
            result.articlesFailed++;
            result.errors.push(`${link.url}: ${error.message}`);
            console.error(`❌ Ошибка обработки статьи ${link.url}:`, error);
          }
        }

        // Если достигли цели, выходим из цикла
        if (result.articlesSuccess >= targetArticles) {
          break;
        }

        // Адаптивно увеличиваем размер следующей порции
        const successRate = result.articlesSuccess / Math.max(result.articlesProcessed, 1);
        if (successRate < 0.3) { // Если успешность меньше 30%
          currentBatchSize = Math.min(currentBatchSize + 15, 50); // Увеличиваем размер порции
          console.log(`📈 Низкая успешность (${(successRate * 100).toFixed(1)}%), увеличиваем размер порции до ${currentBatchSize}`);
        }

        // Небольшая задержка между итерациями
        if (iteration < maxIterations) {
          await this.delay(2000);
        }
      }

      // Финальный отчет
      if (result.articlesSuccess < targetArticles) {
        console.log(`⚠️ Не удалось достичь цели: ${result.articlesSuccess}/${targetArticles} статей после ${iteration} итераций`);
        console.log(`📊 Статистика: ${duplicateCount} дубликатов, ${result.articlesProcessed} обработано`);
      } else {
        console.log(`🎉 Цель достигнута: ${result.articlesSuccess}/${targetArticles} статей!`);
      }

      result.endTime = new Date();
      
      // Правильно определяем статус: успех если достигли цели
      if (result.articlesSuccess >= targetArticles) {
        result.status = 'success';
      } else if (result.articlesSuccess > 0) {
        result.status = 'partial';
      } else {
        result.status = 'failed';
      }

      // Обновляем статистику
      await this.settings.updateStats(result);

      console.log(`🏁 Парсинг завершен: ${result.articlesSuccess}/${targetArticles} новых статей, ${duplicateCount} дубликатов, ${result.articlesFailed} ошибок`);
      return result;

    } catch (error) {
      result.endTime = new Date();
      result.status = 'failed';
      result.errors.push(error.message);
      
      console.error('Критическая ошибка парсинга:', error);
      
      if (this.settings) {
        await this.settings.updateStats(result);
      }
      
      throw error;
    }
  }

  // Выбор домена для публикации
  selectDomain(domains) {
    if (domains.length === 1) return domains[0];

    const strategy = this.settings?.domains?.distributionStrategy || 'round_robin';
    
    switch (strategy) {
      case 'random':
        return domains[Math.floor(Math.random() * domains.length)];
      
      case 'weighted':
        // Реализация взвешенного выбора
        const totalWeight = this.settings.domains.targetDomains.reduce((sum, d) => sum + d.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const domainConfig of this.settings.domains.targetDomains) {
          random -= domainConfig.weight;
          if (random <= 0) {
            return domains.find(d => d._id.toString() === domainConfig.domainId.toString());
          }
        }
        break;
        
      default: // round_robin
        const index = (this.settings.stats.totalSuccess || 0) % domains.length;
        return domains[index];
    }
    
    return domains[0];
  }

  // Вспомогательная функция задержки
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Проверка нужности запуска парсера
  static async shouldRun() {
    try {
      const settings = await ParserSettings.findOne({});
      if (!settings || !settings.parser.enabled) return false;
      
      if (!settings.stats.nextRunAt) return true;
      
      return new Date() >= settings.stats.nextRunAt;
    } catch (error) {
      console.error('Ошибка проверки планировщика:', error);
      return false;
    }
  }
}

module.exports = NewsParser; 