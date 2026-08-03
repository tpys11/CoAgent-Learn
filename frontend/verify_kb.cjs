const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  // 拿到固定项目 ID
  const pid = await page.evaluate(() => localStorage.getItem('coagent-default-project'));
  console.log('项目 ID:', pid);
  // 通过后端 API 上传一段知识库内容（模拟用户上传）
  const up = await page.evaluate(async (pid) => {
    const r = await fetch('/api/knowledge/upload', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({project_id: pid, text: '牛顿第二定律是F=ma。欧姆定律I=U/R。', source: '物理测试.md'})
    });
    return await r.json();
  }, pid);
  console.log('上传结果:', JSON.stringify(up));
  // 直接查列表接口
  const list = await page.evaluate(async (pid) => {
    const r = await fetch('/api/knowledge/list?project_id=' + encodeURIComponent(pid));
    return await r.json();
  }, pid);
  console.log('上传后列表:', JSON.stringify(list));
  // 刷新页面
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  // 刷新后查列表
  const list2 = await page.evaluate(async (pid) => {
    const r = await fetch('/api/knowledge/list?project_id=' + encodeURIComponent(pid));
    return await r.json();
  }, pid);
  console.log('刷新后列表:', JSON.stringify(list2));
  await browser.close();
})();
