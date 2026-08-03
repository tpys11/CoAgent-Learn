const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  // 找 <aside>（RightPanel 根）
  const info = await page.evaluate(async () => {
    const aside = document.querySelector('aside');
    if (!aside) return { found: false };
    const texts = [];
    // 找所有文本节点，看图谱区域
    const walker = document.createTreeWalker(aside, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t && t.length < 60) texts.push(t);
    }
    return {
      found: true,
      hasCanvas: !!aside.querySelector('canvas'),
      texts: texts.slice(0, 20),
      asideHTML: aside.outerHTML.slice(0, 800)
    };
  });
  console.log(JSON.stringify(info, null, 2));
  // 截图只截 aside 区域
  const aside = await page.$('aside');
  if (aside) await aside.screenshot({ path: 'C:/Users/21237/AppData/Local/Temp/graph_aside.png' });
  await browser.close();
})();
