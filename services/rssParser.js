const axios = require('axios');
const xml2js = require('xml2js');
const Article = require('../models/Article');
const ParserSettings = require('../models/ParserSettings');

class RSSParser {
  constructor() {
    this.sources = [
      {
        name: 'Decrypt',
        url: 'https://decrypt.co/feed',
        weight: 3, // Лучший источник - хороший парсинг контента
        baseUrl: 'https://decrypt.co'
      },
      {
        name: 'CoinDesk',
        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        weight: 3, // Качественный источник
        baseUrl: 'https://www.coindesk.com'
      },
      {
        name: 'U.Today',
        url: 'https://u.today/rss',
        weight: 2,
        baseUrl: 'https://u.today'
      },
      {
        name: 'NewsBTC',
        url: 'https://www.newsbtc.com/feed/',
        weight: 2,
        baseUrl: 'https://www.newsbtc.com'
      },
      {
        name: 'BeInCrypto',
        url: 'https://beincrypto.com/feed/',
        weight: 2,
        baseUrl: 'https://beincrypto.com'
      },
      {
        name: 'CryptoPotato',
        url: 'https://cryptopotato.com/feed/',
        weight: 2,
        baseUrl: 'https://cryptopotato.com'
      },
      {
        name: 'CryptoSlate',
        url: 'https://cryptoslate.com/feed/',
        weight: 2,
        baseUrl: 'https://cryptoslate.com'
      },
      {
        name: 'CoinTelegraph',
        url: 'https://cointelegraph.com/rss',
        weight: 1, // Понижен приоритет из-за блокировки контента
        baseUrl: 'https://cointelegraph.com'
      }
    ];
    
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    };
  }

  async fetchRSSFeed(source) {
    try {
      console.log(`📡 Получаем RSS фид: ${source.name}`);
      
      const response = await axios.get(source.url, {
        headers: this.headers,
        timeout: 15000,
        maxRedirects: 5
      });

      const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });

      const result = await parser.parseStringPromise(response.data);
      
      // Поддерживаем разные форматы RSS/Atom
      let items = [];
      if (result.rss && result.rss.channel && result.rss.channel.item) {
        items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
      } else if (result.feed && result.feed.entry) {
        items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
      }

      console.log(`📚 Найдено ${items.length} статей в ${source.name}`);
      return { source, items };

    } catch (error) {
      console.error(`❌ Ошибка получения RSS ${source.name}:`, error.message);
      return { source, items: [], error: error.message };
    }
  }

  async parseRSSArticles(targetCount = 5) {
    console.log(`🎯 Цель: получить ${targetCount} новых статей из RSS фидов`);
    
    const result = {
      articlesSuccess: 0,
      articlesFailed: 0,
      duplicates: 0,
      errors: [],
      startTime: new Date(),
      endTime: null,
      status: 'running'
    };

    try {
      // Получаем все RSS фиды параллельно
      const feedPromises = this.sources.map(source => this.fetchRSSFeed(source));
      const feedResults = await Promise.all(feedPromises);

      // Собираем все статьи из всех источников
      const allArticles = [];
      
      for (const feedResult of feedResults) {
        if (feedResult.items.length > 0) {
          for (const item of feedResult.items) {
            const article = this.parseRSSItem(item, feedResult.source);
            if (article) {
              allArticles.push({
                ...article,
                sourceWeight: feedResult.source.weight,
                sourceName: feedResult.source.name
              });
            }
          }
        }
      }

      console.log(`📊 Всего статей получено: ${allArticles.length}`);

      // Сортируем по приоритету источника и дате
      allArticles.sort((a, b) => {
        // Сначала по весу источника
        if (b.sourceWeight !== a.sourceWeight) {
          return b.sourceWeight - a.sourceWeight;
        }
        // Затем по дате (новые первыми)
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });

      // Обрабатываем статьи до достижения цели
      let processed = 0;
      for (const articleData of allArticles) {
        if (result.articlesSuccess >= targetCount) {
          break;
        }

        processed++;
        console.log(`🔄 Обрабатываем статью ${processed}/${allArticles.length}: ${articleData.title.substring(0, 60)}...`);

        try {
          // Проверяем на дубликаты
          const existingArticle = await Article.findOne({
            $or: [
              { title: articleData.title },
              { slug: articleData.slug },
              { sourceUrl: articleData.sourceUrl }
            ]
          });

          if (existingArticle) {
            result.duplicates++;
            console.log(`⏭️ Дубликат: ${articleData.title.substring(0, 60)}... (${result.duplicates} дубликатов)`);
            continue;
          }

          // Добавляем задержку между запросами для избежания блокировки
          if (processed > 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды задержки
          }
          
          // Получаем полный контент статьи
          const fullArticle = await this.fetchFullArticleContent(articleData);
          
          if (fullArticle && fullArticle.content) {
            // Сохраняем статью
            const savedArticle = await this.saveArticle(fullArticle);
            if (savedArticle) {
              result.articlesSuccess++;
              console.log(`✅ Успешно сохранена: ${fullArticle.title.substring(0, 60)}... (${result.articlesSuccess}/${targetCount})`);
            }
          } else {
            result.articlesFailed++;
            result.errors.push(`${articleData.title}: Не удалось получить полный контент`);
            console.log(`❌ Не удалось получить контент: ${articleData.title.substring(0, 60)}...`);
          }

        } catch (error) {
          result.articlesFailed++;
          result.errors.push(`${articleData.title}: ${error.message}`);
          console.error(`❌ Ошибка обработки статьи:`, error.message);
        }
      }

      result.endTime = new Date();
      result.articlesFound = allArticles.length;
      result.articlesProcessed = processed;
      
      if (result.articlesSuccess >= targetCount) {
        result.status = 'success';
      } else if (result.articlesSuccess > 0) {
        result.status = 'partial';
      } else {
        result.status = 'failed';
      }

      // Обновляем статистику в настройках парсера
      try {
        const settings = await ParserSettings.getSettings();
        await settings.updateStats(result);
        console.log(`📊 Статистика обновлена в истории парсера`);
      } catch (error) {
        console.error('❌ Ошибка обновления статистики:', error.message);
      }

      console.log(`🏁 RSS парсинг завершен: ${result.articlesSuccess}/${targetCount} новых статей, ${result.duplicates} дубликатов, ${result.articlesFailed} ошибок`);
      return result;

    } catch (error) {
      console.error('❌ Критическая ошибка RSS парсера:', error);
      result.endTime = new Date();
      result.status = 'failed';
      result.errors.push(`Критическая ошибка: ${error.message}`);
      return result;
    }
  }

  parseRSSItem(item, source) {
    try {
      // Извлекаем данные из RSS элемента
      let title = item.title || '';
      let link = item.link || '';
      let description = item.description || item.summary || '';
      let pubDate = item.pubDate || item.published || item['dc:date'] || '';
      let categories = item.category || item.categories || [];

      // Очищаем заголовок от CDATA
      if (typeof title === 'string') {
        title = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      }

      // Очищаем описание от HTML тегов
      if (typeof description === 'string') {
        description = description.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
                                .replace(/<[^>]*>/g, '')
                                .trim();
      }

      // Извлекаем теги из RSS
      let tags = [];
      if (categories) {
        if (Array.isArray(categories)) {
          tags = categories.map(cat => {
            if (typeof cat === 'string') return cat;
            if (cat._ || cat.$?.term) return cat._ || cat.$.term;
            return cat.toString();
          }).filter(tag => tag && tag.length > 0);
        } else if (typeof categories === 'string') {
          tags = [categories];
        }
      }

      // Добавляем базовые теги на основе источника и контента
      const baseTags = ['crypto', 'news', source.name.toLowerCase()];
      
      // Извлекаем дополнительные теги из заголовка и описания
      const contentTags = this.extractTagsFromContent(title + ' ' + description);
      
      // Объединяем и очищаем теги
      tags = [...new Set([...baseTags, ...tags, ...contentTags])]
        .filter(tag => tag && tag.length > 1 && tag.length < 30)
        .slice(0, 10); // Ограничиваем количество тегов

      // Обрабатываем ссылку
      if (typeof link === 'object' && link.$) {
        link = link.$.href || link;
      }
      if (typeof link === 'object' && link._) {
        link = link._;
      }

      // Проверяем обязательные поля
      if (!title || !link) {
        return null;
      }

      // Создаем slug из заголовка
      const slug = title.toLowerCase()
                       .replace(/[^a-z0-9\s-]/g, '')
                       .replace(/\s+/g, '-')
                       .replace(/-+/g, '-')
                       .substring(0, 100);

      return {
        title: title.substring(0, 255),
        slug,
        excerpt: description.substring(0, 500),
        sourceUrl: link,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
        source: source.name,
        category: 'Crypto',
        status: 'published',
        tags: tags
      };

    } catch (error) {
      console.error('❌ Ошибка парсинга RSS элемента:', error);
      return null;
    }
  }

  extractTagsFromContent(content) {
    const cryptoTerms = [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 
      'defi', 'nft', 'solana', 'sol', 'cardano', 'ada', 'polkadot', 
      'dot', 'chainlink', 'link', 'binance', 'bnb', 'ripple', 'xrp',
      'dogecoin', 'doge', 'shiba', 'avalanche', 'avax', 'polygon',
      'matic', 'uniswap', 'uni', 'trading', 'investment', 'price',
      'market', 'bullish', 'bearish', 'mining', 'staking', 'yield',
      'exchange', 'wallet', 'token', 'coin', 'altcoin', 'hodl',
      'regulation', 'sec', 'etf', 'institutional', 'adoption'
    ];

    const lowerContent = content.toLowerCase();
    const foundTerms = cryptoTerms.filter(term => 
      lowerContent.includes(term) && 
      // Проверяем что это отдельное слово, а не часть другого слова
      new RegExp(`\\b${term}\\b`).test(lowerContent)
    );

    return foundTerms.slice(0, 5); // Максимум 5 тегов из контента
  }

  async fetchFullArticleContent(articleData) {
    try {
      console.log(`📄 Получаем полный контент: ${articleData.sourceUrl}`);
      
      // Улучшенные заголовки для обхода блокировки
      const enhancedHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.google.com/'
      };
      
      const response = await axios.get(articleData.sourceUrl, {
        headers: enhancedHeaders,
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status < 500; // Принимаем даже 4xx ошибки
        }
      });

      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);

      let content = '';
      let featuredImage = null;

      // Селекторы для разных сайтов
      const contentSelectors = {
        'cointelegraph.com': {
          content: '.post-content, .post__content, article .content, .article-content',
          image: '.post__lead-image img, .post-cover img, .article-image img'
        },
        'decrypt.co': {
          content: '.post-content, .article-content, [data-module="ArticleBody"]',
          image: '.featured-image img, .post-featured-image img'
        },
        'coindesk.com': {
          content: '.at-content .at-text, .articleBody, .story-body, .at-body .at-text, [data-module="ArticleBody"], .article-content, .post-content p, .entry-content p',
          image: '.featured-image img, .lead-image img, .article-hero img, .hero-image img, .at-image img'
        },
        'u.today': {
          content: '.article-body, .post-content, .content',
          image: '.article-image img, .featured-image img'
        },
        'newsbtc.com': {
          content: '.entry-content, .post-content, .article-content',
          image: '.featured-image img, .post-thumbnail img'
        },
        'beincrypto.com': {
          content: '.post-content, .article-content, .entry-content',
          image: '.featured-image img, .post-image img'
        },
        'cryptopotato.com': {
          content: '.post-content, .article-content, .entry-content',
          image: '.featured-image img, .post-thumbnail img'
        },
        'cryptoslate.com': {
          content: '.post-content, .article-content, .entry-content',
          image: '.featured-image img, .post-image img'
        }
      };

      // Определяем домен
      const domain = new URL(articleData.sourceUrl).hostname;
      const selectors = contentSelectors[domain] || {
        content: '.post-content, .article-content, .entry-content, .content, article p',
        image: '.featured-image img, .post-image img, .article-image img, img[class*="featured"]'
      };

      // Извлекаем контент
      const contentElement = $(selectors.content).first();
      if (contentElement.length > 0) {
        // Убираем ненужные элементы
        contentElement.find('script, style, .advertisement, .ads, .social-share, .related-posts').remove();
        content = contentElement.html() || contentElement.text();
      }

      // Если контент не найден, пробуем альтернативные селекторы
      if (!content || content.length < 200) {
        console.log(`🔍 Пробуем альтернативные селекторы для ${domain}...`);
        
        const alternativeSelectors = [
          // Специфичные для CoinDesk (более точные)
          '.at-content .at-text',
          '.at-body .at-text',
          '.story-body',
          '.articleBody',
          // Общие селекторы для контента статей
          'article .content',
          'article .text',
          'article .body',
          '.post-content',
          '.entry-content',
          '.article-content',
          // Менее специфичные (только если ничего не найдено)
          'article p',
          '.post p',
          '.entry p',
          'main p'
        ];

        for (const selector of alternativeSelectors) {
          let text = '';
          let html = '';
          
          if (selector.includes(' p')) {
            // Для селекторов с параграфами объединяем все найденные параграфы
            const paragraphs = $(selector);
            if (paragraphs.length > 0) {
              // Убираем ненужные элементы
              paragraphs.find('script, style, .advertisement, .ads, .social-share, .related-posts').remove();
              
              const validParagraphs = paragraphs.filter((i, el) => {
                const pText = $(el).text().trim();
                return pText.length > 20; // Только значимые параграфы
              });
              
              if (validParagraphs.length > 0) {
                html = validParagraphs.map((i, el) => $(el).html()).get().join('</p><p>');
                html = `<p>${html}</p>`;
                text = validParagraphs.map((i, el) => $(el).text().trim()).get().join(' ');
              }
            }
          } else {
            // Для обычных селекторов
            const element = $(selector);
            if (element.length > 0) {
              // Убираем ненужные элементы
              element.find('script, style, .advertisement, .ads, .social-share, .related-posts, nav, header, footer, .sidebar').remove();
              
              text = element.text().trim();
              html = element.html();
            }
          }
          
          if (text.length > 300) { // Увеличиваем минимальную длину
            console.log(`✅ Найден контент через селектор: ${selector} (${text.length} символов)`);
            
            // Проверяем на нежелательный контент сразу
            const unwantedPatterns = [
              'TRX$', 'DOGE$', 'ADA$', 'HYPE$', 'WBT$',
              '+0.01%', '-2.12%', '-7.26%',
              'BTC$', 'ETH$', 'SOL$', 'XRP$',
              'USDC$', 'USDT$'
            ];
            
            const unwantedCount = unwantedPatterns.filter(pattern => text.includes(pattern)).length;
            if (unwantedCount > 3) {
              console.log(`⚠️ Найдено ${unwantedCount} паттернов цен, пропускаем этот селектор`);
              continue; // Пробуем следующий селектор
            }
            
            content = html || text;
            break;
          }
        }
      }

      // Извлекаем изображение (расширенный поиск)
      let imageElement = $(selectors.image).first();
      
      // Если не найдено, пробуем дополнительные селекторы
      if (imageElement.length === 0) {
        const additionalImageSelectors = [
          'img[src*="featured"]',
          'img[src*="hero"]',
          'img[src*="banner"]',
          'img[src*="cover"]',
          'img[src*="thumb"]',
          '.hero img',
          '.banner img',
          '.cover img',
          '.thumbnail img',
          'article img:first',
          '.content img:first',
          'img[width="1200"]',
          'img[width="1434"]',
          'img[height="600"]'
        ];
        
        for (const selector of additionalImageSelectors) {
          imageElement = $(selector).first();
          if (imageElement.length > 0) break;
        }
      }
      
      if (imageElement.length > 0) {
        let imageSrc = imageElement.attr('src') || 
                      imageElement.attr('data-src') || 
                      imageElement.attr('data-lazy-src') ||
                      imageElement.attr('data-original');
        
        if (imageSrc) {
          // Преобразуем относительные URL в абсолютные
          if (imageSrc.startsWith('//')) {
            imageSrc = 'https:' + imageSrc;
          } else if (imageSrc.startsWith('/')) {
            const baseUrl = new URL(articleData.sourceUrl);
            imageSrc = baseUrl.protocol + '//' + baseUrl.host + imageSrc;
          }
          
          // Проверяем что это не маленькая иконка
          const width = imageElement.attr('width');
          const height = imageElement.attr('height');
          if (width && height && (parseInt(width) < 200 || parseInt(height) < 200)) {
            console.log(`⚠️ Пропускаем маленькое изображение: ${width}x${height}`);
          } else {
            featuredImage = imageSrc;
            console.log(`🖼️ Найдено изображение: ${imageSrc.substring(0, 80)}...`);
          }
        }
      }
      
      // Если изображение все еще не найдено, пробуем извлечь из meta тегов
      if (!featuredImage) {
        const metaImage = $('meta[property="og:image"]').attr('content') ||
                         $('meta[name="twitter:image"]').attr('content') ||
                         $('meta[property="og:image:url"]').attr('content');
        
        if (metaImage) {
          featuredImage = metaImage.startsWith('//') ? 'https:' + metaImage : metaImage;
          console.log(`🖼️ Найдено изображение в meta: ${featuredImage.substring(0, 80)}...`);
        }
      }

      // Очищаем контент от лишних элементов
      if (content) {
        const originalLength = content.replace(/<[^>]*>/g, '').trim().length;
        content = content
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<style[^>]*>.*?<\/style>/gi, '')
          .replace(/<!--.*?-->/g, '')
          .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
          .trim();
        
        const cleanedLength = content.replace(/<[^>]*>/g, '').trim().length;
        console.log(`🧹 Очистка контента: ${originalLength} → ${cleanedLength} символов`);
      }

      // Проверяем минимальную длину контента и качество
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      
      // Проверяем на блокированный контент от CoinTelegraph и других сайтов
      const blockedPatterns = [
        'bg-charcoal-25 absolute left-0 top-0',
        'Please enable JavaScript',
        'Access denied',
        'Cloudflare',
        'Loading...',
        'Subscribe to continue',
        'Register to read'
      ];
      
      // Проверяем на нежелательный контент (виджеты, цены криптовалют)
      const unwantedPatterns = [
        'TRX$', 'DOGE$', 'ADA$', 'HYPE$', 'WBT$', // Цены криптовалют
        '+0.01%', '-2.12%', '-7.26%', // Процентные изменения
        'BTC$', 'ETH$', 'SOL$', 'XRP$', // Популярные криптовалюты с ценами
        'USDC$', 'USDT$' // Стейблкоины
      ];
      
      const isBlocked = blockedPatterns.some(pattern => 
        content.toLowerCase().includes(pattern.toLowerCase())
      );
      
      const isUnwantedContent = unwantedPatterns.filter(pattern => 
        textContent.includes(pattern)
      ).length > 3; // Если найдено больше 3 паттернов цен - это виджет
      
      if (textContent.length < 200 || isBlocked || isUnwantedContent) {
        if (isUnwantedContent) {
          console.log(`⚠️ Найден виджет с ценами криптовалют вместо статьи, используем описание из RSS`);
        }
        console.log(`⚠️ Контент заблокирован или слишком мал (${textContent.length} символов), используем описание из RSS`);
        
        // Расширяем описание из RSS если оно есть
        let expandedContent = articleData.excerpt || '';
        
        // Добавляем информацию о том, что это краткое описание
        if (expandedContent) {
          expandedContent = `<p><strong>Краткое описание:</strong></p><p>${expandedContent}</p>`;
          expandedContent += `<p><em>Полный текст статьи доступен по <a href="${articleData.sourceUrl}" target="_blank" rel="noopener">ссылке на источник</a>.</em></p>`;
        } else {
          expandedContent = `<p><em>Полный текст статьи доступен по <a href="${articleData.sourceUrl}" target="_blank" rel="noopener">ссылке на источник</a>.</em></p>`;
        }
        
        content = expandedContent;
      }

      return {
        ...articleData,
        content: content || articleData.excerpt || 'Контент статьи доступен по ссылке.',
        media: {
          featuredImage: featuredImage ? {
            url: featuredImage,
            alt: articleData.title,
            caption: ''
          } : null
        }
      };

    } catch (error) {
      console.error(`❌ Ошибка получения контента для ${articleData.sourceUrl}:`, error.message);
      // В случае ошибки возвращаем данные из RSS
      return {
        ...articleData,
        content: articleData.excerpt || 'Контент статьи доступен по ссылке.',
        media: {
          featuredImage: null
        }
      };
    }
  }

  async saveArticle(articleData) {
    try {
      // Получаем настройки парсера
      const settings = await ParserSettings.getSettings();
      
      // Получаем домен и автора
      const Domain = require('../models/Domain');
      const User = require('../models/User');
      
      const domains = await Domain.find({ _id: { $in: settings.domains.targetDomains.map(d => d.domainId) } });
      const defaultAuthor = await User.findById(settings.publishing.defaultAuthor);
      
      if (domains.length === 0) {
        throw new Error('Не найдены целевые домены для публикации');
      }
      
      if (!defaultAuthor) {
        throw new Error('Не найден автор по умолчанию');
      }
      
      // Выбираем первый доступный домен
      const selectedDomain = domains[0];
      
      // ---- Генерируем начальные фейковые просмотры/лайки по диапазону ----
      const rangeOrDefault = (range) => {
        const min = Number(range?.min ?? 0);
        const max = Number(range?.max ?? 0);
        if (max <= min) return min;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      };

      const fakeViews = rangeOrDefault(settings?.initialStats?.views);
      const fakeLikes = rangeOrDefault(settings?.initialStats?.likes);

      const article = new Article({
        title: articleData.title,
        slug: articleData.slug,
        content: articleData.content,
        excerpt: articleData.excerpt,
        category: articleData.category,
        status: 'published', // RSS статьи публикуем сразу
        author: defaultAuthor._id,
        domain: selectedDomain._id,
        isParsed: true,
        sourceUrl: articleData.sourceUrl,
        publishedAt: articleData.publishedAt,
        media: articleData.media || {},
        source: articleData.source,
        tags: articleData.tags || [],
        stats: {
          views: { fake: fakeViews, real: 0, total: fakeViews },
          likes: { fake: fakeLikes, real: 0, total: fakeLikes },
          comments: { fake: 0, real: 0, total: 0 },
          shares: { fake: 0, real: 0, total: 0 }
        }
      });

      const savedArticle = await article.save();
      return savedArticle;

    } catch (error) {
      console.error('❌ Ошибка сохранения статьи:', error);
      throw error;
    }
  }
}

module.exports = RSSParser; 