import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function runTests() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  const results = [];
  
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  
  page.on('pageerror', error => {
    pageErrors.push(error.toString());
  });
  
  try {
    console.log('=== TEST 1: Navigate to http://localhost:3001 ===');
    await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    const homeUrl = page.url();
    const homeTitle = await page.title();
    console.log('URL: ' + homeUrl);
    console.log('Title: ' + homeTitle);
    console.log('Console errors: ' + pageErrors.length);
    
    await page.screenshot({ path: './01-home.png', fullPage: true });
    console.log('Screenshot saved: ./01-home.png');
    results.push({ page: 'Home', url: homeUrl, status: 'OK', errors: pageErrors.length });
    
    const tabs = [
      { name: 'Workflows', href: '/' },
      { name: 'Knowledge Graph', href: '/graph' },
      { name: 'Memory Graph', href: '/memory' },
      { name: 'Learning', href: '/learning' },
      { name: 'Models', href: '/models' },
      { name: 'Config', href: '/config' },
      { name: 'Health', href: '/health' },
      { name: 'Docs', href: '/docs' }
    ];
    
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      console.log('\n=== TEST ' + (i + 2) + ': Navigate to ' + tab.name + ' (' + tab.href + ') ===');
      
      try {
        await page.goto('http://localhost:3001' + tab.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        
        const currentUrl = page.url();
        const currentTitle = await page.title();
        console.log('URL: ' + currentUrl);
        console.log('Title: ' + currentTitle);
        console.log('Page errors: ' + pageErrors.length);
        
        const screenshotName = './' + String(i + 2).padStart(2, '0') + '-' + tab.name.toLowerCase().replace(/\s+/g, '-') + '.png';
        await page.screenshot({ path: screenshotName, fullPage: true });
        console.log('Screenshot saved: ' + screenshotName);
        results.push({ page: tab.name, url: currentUrl, status: 'OK', errors: pageErrors.length });
        
      } catch (error) {
        console.log('ERROR navigating to ' + tab.name + ': ' + error.message);
        results.push({ page: tab.name, url: 'http://localhost:3001' + tab.href, status: 'TIMEOUT', errors: error.message });
      }
    }
    
    console.log('\n=== FINAL CONSOLE LOGS ===');
    consoleLogs.forEach(log => {
      console.log('[' + log.type + '] ' + log.text);
    });
    
    writeFileSync('./test-results.json', JSON.stringify({ results, consoleLogs, pageErrors }, null, 2));
    console.log('\nResults saved to ./test-results.json');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

runTests();
