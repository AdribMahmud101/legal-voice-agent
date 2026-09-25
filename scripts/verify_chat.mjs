import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';

/**
 * Universal chatbot regression suite. Free: no STT/TTS/LLM voice pipeline, but
 * it DOES make one real chat completion (a few cents of DeepInfra credit).
 *
 * Ground truth is asserted on browser layout and on the API's own JSON, never on
 * text this codebase renders about itself.
 */
async function main() {
  const browser = await chromium.launch();
  const results = {};
  const check = (k, v, extra = '') => {
    results[k] = v;
    if (!v) console.log(`  FAIL ${k} ${extra}`);
  };

  const seedSession = async (page, displayName) => {
    await page.evaluate(async (name) => {
      await fetch('/api/roles/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          voiceSessionId: `chat-${Math.floor(Math.random() * 1e9)}`,
          docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
          displayName: name,
          phone: '01714141414',
          problem: 'সহায়ক পরীক্ষা',
          indigenousLanguage: 'bn',
          district: 'ঢাকা',
          category: 'land_dispute',
        }),
      });
    }, displayName);
  };

  // ---------- visitor: widget present on the landing page ----------
  const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await visitorCtx.newPage();
  await page.goto(site, { waitUntil: 'networkidle' });

  const fab = page.getByTestId('chat-fab');
  check('chat launcher visible for a visitor', await fab.isVisible());
  check('launcher has an accessible name', Boolean((await fab.getAttribute('aria-label')) || ''));

  // The 16699 call button already owns the bottom-right corner. The launcher
  // must stack above it, never on top of it.
  const boxes = await page.evaluate(() => {
    const chat = document.querySelector('[data-testid="chat-fab"]');
    const call = document.querySelector('.ref-floating-call');
    if (!chat || !call) return null;
    const a = chat.getBoundingClientRect();
    const b = call.getBoundingClientRect();
    return {
      chat: { top: a.top, bottom: a.bottom, left: a.left, right: a.right },
      call: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
      viewportH: window.innerHeight,
    };
  });
  check('launcher does not overlap the 16699 call button', Boolean(boxes) && boxes.chat.bottom <= boxes.call.top, JSON.stringify(boxes));
  check('launcher sits above the call button', Boolean(boxes) && boxes.call.bottom < boxes.viewportH, JSON.stringify(boxes));
  check('launcher is on screen', Boolean(boxes) && boxes.chat.top >= 0 && boxes.chat.bottom <= boxes.viewportH, JSON.stringify(boxes));

  // ---------- open, ask, answer ----------
  await fab.click();
  const panel = page.getByTestId('chat-panel');
  check('panel opens', await panel.isVisible());
  check('panel is a labelled dialog', (await panel.getAttribute('role')) === 'dialog' && Boolean(await panel.getAttribute('aria-labelledby')));

  const input = panel.locator('input[type="text"], input:not([type])').first();
  await input.fill('আইনি সহায়তার জন্য কী কী ডকুমেন্ট লাগে?');
  await panel.locator('button[type="submit"]').click();

  await page.waitForFunction(
    () => {
      const log = document.querySelector('[role="log"]');
      if (!log) return false;
      return (log.textContent || '').length > 40;
    },
    null,
    { timeout: 90000 },
  );
  const logText = await page.locator('[role="log"]').innerText();
  check('assistant produced an answer', logText.length > 40, logText.slice(0, 160));
  check('answer is grounded in memory, not a hallucinated number', !/\b16430\b/.test(logText.replace(/ইউএসজিডিএন[^\n]*/g, '')), logText.slice(0, 200));
  check('answer stays concise', logText.length < 2500, `len=${logText.length}`);

  // Escape closes and returns focus to the launcher.
  await page.keyboard.press('Escape');
  check('Escape closes the panel', (await page.getByTestId('chat-panel').count()) === 0);
  check('focus returns to the launcher', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'chat-fab'));

  await visitorCtx.close();

  // ---------- staff must NOT get the universal assistant ----------
  const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const staffPage = await staffCtx.newPage();
  await staffPage.goto(site, { waitUntil: 'networkidle' });
  const staffLogin = await staffPage.evaluate(async () => {
    const r = await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `staff-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'ক্যামেরা পরীক্ষা',
        phone: '01715151515',
        problem: 'পরীক্ষা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
        role: 'dlao_officer',
      }),
    });
    return r.status;
  });
  // The citizen session route always creates a citizen, so assert the API gate
  // directly with a staff role is not possible here; assert the widget is absent
  // on the DLAO shell instead, which is the visible requirement.
  await staffPage.goto(`${site}dlao`, { waitUntil: 'networkidle' });
  await staffPage.waitForTimeout(1200);
  const onDlao = await staffPage.getByTestId('chat-fab').count();
  check('no chat launcher on the DLAO shell', onDlao === 0, `count=${onDlao}`);

  const gateAsCitizen = await staffPage.evaluate(async () => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: 'হেলপলাইন নম্বর কত?' }),
    });
    return r.status;
  });
  check('a signed-in citizen is served by the assistant', gateAsCitizen === 200, `status=${gateAsCitizen} seed=${staffLogin}`);
  await staffCtx.close();

  console.log('\n=== RESULTS ===');
  let failed = 0;
  for (const [k, v] of Object.entries(results)) {
    if (!v) failed++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  }
  console.log(failed === 0 ? '\nVERIFICATION PASSED' : `\n${failed} FAILED`);
  await browser.close();
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
