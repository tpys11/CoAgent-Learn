const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  // 截图整个页面
  await page.screenshot({ path: 'C:/Users/21237/AppData/Local/Temp/graph_page.png' });
  // 找知识图谱区域的文本
  const graphText = await page.evaluate(() => {
    const el = document.body.innerText;
    return el.includes('知识图谱') ? '找到了知识图谱区域' : '没找到';
  });
  console.log('图谱区域:', graphText);
  console.log('JS错误数:', errors.length);
  errors.forEach(e => console.log('  ERR:', e.slice(0, 300)));
  await browser.close();
})();
