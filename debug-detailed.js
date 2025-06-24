const axios = require('axios');
const cheerio = require('cheerio');

async function debugDetailedParsing() {
  try {
    console.log('🔍 Детальная отладка парсинга CoinDesk...\n');

    const url = 'https://www.coindesk.com/markets/2025/06/22/bitcoin-slips-below-usd100k-hinting-oil-led-risk-off-on-wall-street';
    
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
    
    const response = await axios.get(url, {
      headers: enhancedHeaders,
      timeout: 30000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    
    console.log('📄 Анализируем селектор "main p"...\n');
    
    const mainParagraphs = $('main p');
    console.log(`Найдено параграфов в main: ${mainParagraphs.length}`);
    
    mainParagraphs.each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      const html = $el.html();
      
      if (text.length > 20) { // Показываем только значимые параграфы
        console.log(`\n--- Параграф ${index + 1} ---`);
        console.log(`Длина текста: ${text.length} символов`);
        console.log(`Текст: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        console.log(`HTML: "${html ? html.substring(0, 150) : 'нет HTML'}${html && html.length > 150 ? '...' : ''}"`);
      }
    });
    
    // Тестируем объединение всех параграфов
    const allParagraphs = $('main p').map((i, el) => $(el).html()).get().join('');
    const allText = $('main p').map((i, el) => $(el).text().trim()).get().join(' ');
    
    console.log(`\n📊 ИТОГО:`);
    console.log(`Объединенный HTML: ${allParagraphs.length} символов`);
    console.log(`Объединенный текст: ${allText.length} символов`);
    console.log(`Первые 300 символов текста: "${allText.substring(0, 300)}"`);
    
  } catch (error) {
    console.error('❌ Ошибка отладки:', error.message);
  }
}

debugDetailedParsing(); 