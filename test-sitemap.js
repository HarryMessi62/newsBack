const axios = require('axios');

const testUrls = [
  'http://localhost:5000/sitemap.xml',
  'http://localhost:5000/robots.txt'
];

const testHeaders = [
  { 'X-Domain-Context': 'infocryptoxcom' },
  { 'X-Domain-Context': 'ozxinfo' },
  { 'X-Domain-Context': 'crypto-modern' },
  {}
];

async function testSitemap() {
  console.log('🧪 Тестирование sitemap с разными доменами...\n');
  
  for (const url of testUrls) {
    console.log(`📄 Тестируем: ${url}`);
    
    for (const headers of testHeaders) {
      const domainContext = headers['X-Domain-Context'] || 'без домена';
      console.log(`  🌐 Домен: ${domainContext}`);
      
      try {
        const response = await axios.get(url, { headers });
        console.log(`  ✅ Статус: ${response.status}`);
        console.log(`  📏 Размер: ${response.data.length} символов`);
        
        if (url.includes('sitemap.xml')) {
          const urlCount = (response.data.match(/<url>/g) || []).length;
          console.log(`  🔗 Количество URL в sitemap: ${urlCount}`);
        }
        
      } catch (error) {
        console.log(`  ❌ Ошибка: ${error.message}`);
      }
      console.log('');
    }
    console.log('---\n');
  }
}

testSitemap().catch(console.error); 