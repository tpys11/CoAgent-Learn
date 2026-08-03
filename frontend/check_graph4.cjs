const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  // 找"知识图谱"标题的最近容器
  const info = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, target = null;
    while (node = walker.nextNode()) {
      if (node.textContent.includes('知识图谱')) { target = node; break; }
    }
    if (!target) return { found: false };
    // 向上找 3 层
    let el = target.parentElement;
    let htmls = [];
    for (let i = 0; i < 4 && el; i++) {
      htmls.push(el.tagName + '.' + (el.className || '').slice(0, 50) + ' | text:' + el.textContent.slice(0, 60));
      el = el.parentElement;
    }
    // 图谱区域是否有 canvas 或空态文本
    const region = target.parentElement.parentElement;
    return {
      found: true,
      hasCanvas: !!document.querySelector('canvas'),
      chain: htmls,
      regionText: region.textContent.slice(0, 120)
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
