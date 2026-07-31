import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:5174';

async function testAPIs() {
  console.log('\n=== API TESTS ===');
  let passed = 0, failed = 0;

  const check = async (label, fn) => {
    try {
      const res = await fn();
      console.log(`  ✅ ${label}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${label}: ${e.message}`);
      failed++;
    }
  };

  await check('GET /api/health', async () => {
    const r = await fetch(`${API}/api/health`);
    const d = await r.json();
    if (!d.ok) throw new Error('Health check failed');
  });

  await check('GET /api/providers returns array', async () => {
    const r = await fetch(`${API}/api/providers`);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Providers not array');
  });

  await check('GET /api/projects returns array', async () => {
    const r = await fetch(`${API}/api/projects`);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Projects not array');
  });

  await check('GET /api/settings returns object', async () => {
    const r = await fetch(`${API}/api/settings`);
    const d = await r.json();
    if (typeof d !== 'object' || d === null) throw new Error('Settings not object');
    if (!d.maxRetries) throw new Error('Missing maxRetries');
  });

  await check('GET /api/rag/docs returns array', async () => {
    const r = await fetch(`${API}/api/rag/docs`);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Docs not array');
  });

  await check('GET /api/rag/stats returns stats', async () => {
    const r = await fetch(`${API}/api/rag/stats`);
    const d = await r.json();
    if (typeof d.docs !== 'number') throw new Error('Missing doc count');
  });

  await check('GET /api/chat/sessions returns array', async () => {
    const r = await fetch(`${API}/api/chat/sessions`);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Sessions not array');
  });

  await check('GET /api/progress returns progress', async () => {
    const r = await fetch(`${API}/api/progress`);
    const d = await r.json();
    if (typeof d.xp !== 'number') throw new Error('Missing xp');
  });

  await check('GET /api/analytics returns analytics', async () => {
    const r = await fetch(`${API}/api/analytics`);
    const d = await r.json();
    if (typeof d.knowledgeScore !== 'number') throw new Error('Missing knowledgeScore');
  });

  await check('GET /api/admin/overview returns overview', async () => {
    const r = await fetch(`${API}/api/admin/overview`);
    const d = await r.json();
    if (typeof d.docCount !== 'number') throw new Error('Missing docCount');
  });

  await check('GET /api/history returns history', async () => {
    const r = await fetch(`${API}/api/history`);
    const d = await r.json();
    if (!Array.isArray(d.items)) throw new Error('History items not array');
  });

  await check('GET /api/voice/status returns status', async () => {
    const r = await fetch(`${API}/api/voice/status`);
    const d = await r.json();
    if (typeof d.serverVoiceAvailable !== 'boolean') throw new Error('Missing voice status');
  });

  return { passed, failed };
}

async function testUI(browser) {
  console.log('\n=== UI TESTS ===');
  let passed = 0, failed = 0;
  const page = await browser.newPage();

  const checkUI = async (label, fn) => {
    try {
      await fn();
      console.log(`  ✅ ${label}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${label}: ${e.message}`);
      failed++;
    }
  };

  await checkUI('Homepage loads Dashboard', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Dashboard')) throw new Error(`Expected Dashboard, got "${title}"`);
  });

  await checkUI('Sidebar navigation exists', async () => {
    const links = await page.locator('nav a').count();
    if (links < 5) throw new Error(`Expected at least 5 nav links, got ${links}`);
  });

  await checkUI('Providers page loads', async () => {
    await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Providers')) throw new Error(`Expected Providers, got "${title}"`);
  });

  await checkUI('Knowledge Base page loads', async () => {
    await page.goto(`${BASE}/knowledge`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Knowledge Base')) throw new Error(`Expected Knowledge Base, got "${title}"`);
  });

  await checkUI('Study Studio page loads', async () => {
    await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Study Studio')) throw new Error(`Expected Study Studio, got "${title}"`);
  });

  await checkUI('Advanced settings page loads', async () => {
    await page.goto(`${BASE}/advanced`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Advanced')) throw new Error(`Expected Advanced, got "${title}"`);
  });

  await checkUI('AI Memory page loads', async () => {
    await page.goto(`${BASE}/memory`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Memory') && !title.includes('Learning')) throw new Error(`Expected Memory/Learning page, got "${title}"`);
  });

  await checkUI('Admin page loads', async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Admin')) throw new Error(`Expected Admin, got "${title}"`);
  });

  await checkUI('Notes page loads', async () => {
    await page.goto(`${BASE}/notes`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Notes') && !title.includes('notes')) throw new Error(`Expected Notes, got "${title}"`);
  });

  await checkUI('History page loads', async () => {
    await page.goto(`${BASE}/studio/history`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('History')) throw new Error(`Expected History, got "${title}"`);
  });

  await checkUI('Search page loads', async () => {
    await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1', { timeout: 10000 });
    const title = await page.textContent('h1');
    if (!title.includes('Search')) throw new Error(`Expected Search, got "${title}"`);
  });

  await checkUI('404 redirects to Dashboard', async () => {
    await page.goto(`${BASE}/nonexistent-page`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const url = page.url();
    if (url.includes('nonexistent')) throw new Error(`Should redirect from 404, got ${url}`);
  });

  await checkUI('Sidebar collapse toggle works', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const collapseBtn = page.locator('button:has-text("Collapse")');
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await page.waitForTimeout(300);
    }
  });

  await checkUI('Dashboard has stat cards', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const stats = page.locator('.card').first();
    const visible = await stats.isVisible();
    if (!visible) throw new Error('Dashboard cards not visible');
  });

  return { passed, failed };
}

async function testFeatureGen(browser) {
  console.log('\n=== FEATURE GENERATION TESTS ===');
  let passed = 0, failed = 0;
  const page = await browser.newPage();

  const check = async (label, fn) => {
    try {
      await fn();
      console.log(`  ✅ ${label}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${label}: ${e.message}`);
      failed++;
    }
  };

  await check('Study Studio has prompt input', async () => {
    await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
    const input = page.locator('input[placeholder*="e.g."]');
    const visible = await input.isVisible();
    if (!visible) throw new Error('Prompt input not found');
  });

  await check('Study Studio feature cards exist', async () => {
    const cards = page.locator('button.card');
    const count = await cards.count();
    if (count < 5) throw new Error(`Expected at least 5 feature cards, got ${count}`);
  });

  await check('Category tabs work', async () => {
    const tabs = page.locator('button:has-text("Practice")');
    if (await tabs.isVisible()) {
      await tabs.click();
      await page.waitForTimeout(300);
      const quizBtn = page.locator('button:has-text("Quiz")');
      const visible = await quizBtn.isVisible();
      if (!visible) throw new Error('Quiz not visible in Practice category');
    }
  });

  return { passed, failed };
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  StudyForge E2E Tests');
  console.log('═══════════════════════════════════════\n');

  let totalPassed = 0, totalFailed = 0;
  const add = (r) => { totalPassed += r.passed; totalFailed += r.failed; };

  // 1. API Tests
  const api = await testAPIs();
  add(api);

  // 2. UI Tests
  const browser = await chromium.launch({ headless: true });
  try {
    const ui = await testUI(browser);
    add(ui);

    const features = await testFeatureGen(browser);
    add(features);
  } finally {
    await browser.close();
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  RESULTS: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} total`);
  console.log('═══════════════════════════════════════\n');
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
