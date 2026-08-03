const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => logs.push('PAGEERROR: ' + err.message));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  // 截图
  await page.screenshot({ path: 'C:/Users/21237/AppData/Local/Temp/graph_full.png', fullPage: false });
  // 打印图谱区域 DOM
  const info = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.textContent && el.textContent.includes('知识图谱') && el.children.length < 10) {
        const parent = el.closest('aside') || el;
        return {
          tag: el.tagName,
          text: el.textContent.slice(0, 100),
          hasCanvas: !!parent.querySelector('canvas'),
          parentHTML: parent.outerHTML.slice(0, 500)
        };
      }
    }
    return null;
  });
  console.log('图谱信息:', JSON.stringify(info, null, 2));
  console.log('--- console 日志 ---');
  logs.forEach(l => console.log(l.slice(0, 200)));
  await browser.close();
})();
