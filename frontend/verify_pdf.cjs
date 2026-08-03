const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const pid = await page.evaluate(() => localStorage.getItem('coagent-default-project'));
  console.log('项目:', pid);
  // 生成一个真实 PDF 文件（用后端 reportlab 生成，playwright 直接构造不行——用最小合法 PDF 字节）
  // 最小 PDF：直接后端生成，前端只测上传链路
  // 用 playwright 上传一个 .docx 测试？docx 是 zip。改用 txt 走 onFile？txt 走 onChange。
  // 关键测：pdf 走 onFile → upload-file。构造一个简单 PDF。
  const pdfBytes = await page.evaluate(async (pid) => {
    // 先经后端生成测试 PDF（用现有 reportlab）
    const gen = await fetch('/api/knowledge/upload-file', { method: 'POST' }).catch(() => null)
    return null
  }, pid);
  // 直接用后端生成的 PDF：先手动生成再传给 playwright
  await browser.close();
  console.log('准备单独测试');
})();
