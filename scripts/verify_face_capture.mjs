import { chromium } from 'playwright-core';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
  const page = await ctx.newPage();
  const results = {};
  const check = (k, v, extra = '') => {
    results[k] = v;
    if (!v) console.log(`  FAIL ${k} ${extra}`);
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `fc-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'ক্যামেরা পরীক্ষা',
        phone: '01729292929',
        problem: 'ক্যামেরা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });
  await page.evaluate(async () => {
    await fetch('/api/portal/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ documentType: 'nid', documentNumber: '19927451234022222' }),
    });
  });

  // ---------- face capture ----------
  await page.goto(`${site}citizen/verify/face`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await page.waitForTimeout(2500);

  const frame = await page.evaluate(() => {
    const video = document.querySelector('video');
    // the capture frame is the element that wraps the video
    const holder = video?.parentElement;
    const style = holder ? getComputedStyle(holder) : null;
    const rect = holder?.getBoundingClientRect();
    return {
      hasVideo: !!video,
      playing: video ? !video.paused : false,
      w: video?.videoWidth,
      h: video?.videoHeight,
      radius: style?.borderTopLeftRadius,
      ratio: style?.aspectRatio,
      square: rect ? Math.abs(rect.width - rect.height) < 6 : false,
      maxW: rect ? Math.round(rect.width) : 0,
    };
  });
  check('camera stream live', frame.hasVideo && frame.playing, JSON.stringify(frame));
  check('face frame is square', frame.square, JSON.stringify(frame));
  check('face frame is circular', parseFloat(frame.radius) >= 140, `radius=${frame.radius}`);
  check('face frame is constrained in width', frame.maxW <= 330, `w=${frame.maxW}`);

  // rear camera is the default
  const defaultFacing = await page.evaluate(() => {
    const track = document.querySelector('video')?.srcObject?.getVideoTracks?.()[0];
    return track?.getSettings?.().facingMode ?? 'unknown';
  });
  check('defaults to rear camera', defaultFacing !== 'user', `facingMode=${defaultFacing}`);

  const switchBtn = page.getByRole('button', { name: /ক্যামেরা পরিবর্তন করুন/ });
  check('switch button present', (await switchBtn.count()) === 1);
  check('switch button announces active camera', /পিছনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));

  await switchBtn.click();
  await page.waitForTimeout(2500);
  const afterSwitch = await page.evaluate(() => {
    const track = document.querySelector('video')?.srcObject?.getVideoTracks?.()[0];
    const video = document.querySelector('video');
    return { facingMode: track?.getSettings?.().facingMode ?? 'unknown', playing: video ? !video.paused : false };
  });
  check('switching restarts the stream', afterSwitch.playing, JSON.stringify(afterSwitch));
  check('switch button label updates', /সামনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));
  await page.screenshot({ path: '/tmp/opencode/face-circle.png' });

  // switching back returns to the rear camera
  await switchBtn.click();
  await page.waitForTimeout(2000);
  const backAgain = await page.evaluate(() => {
    const track = document.querySelector('video')?.srcObject?.getVideoTracks?.()[0];
    return track?.getSettings?.().facingMode ?? 'unknown';
  });
  check('can switch back to rear', backAgain !== 'user', `facingMode=${backAgain}`);

  // ---------- document capture must stay rectangular ----------
  await page.goto(`${site}citizen/verify`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.getByRole('tab', { name: /ছবি তুলে যাচাই/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await page.waitForTimeout(2500);
  const docFrame = await page.evaluate(() => {
    const holder = document.querySelector('video')?.parentElement;
    const rect = holder?.getBoundingClientRect();
    const style = holder ? getComputedStyle(holder) : null;
    return { w: rect ? Math.round(rect.width) : 0, h: rect ? Math.round(rect.height) : 0, radius: style?.borderTopLeftRadius };
  });
  const docRatio = docFrame.w / Math.max(1, docFrame.h);
  check('document frame stays landscape', docRatio > 1.4, `ratio=${docRatio.toFixed(2)} ${docFrame.w}x${docFrame.h}`);
  check('document frame is not circular', parseFloat(docFrame.radius) < 100, `radius=${docFrame.radius}`);
  check('document frame is wider than tall', docFrame.w > docFrame.h, `${docFrame.w}x${docFrame.h}`);
  await page.screenshot({ path: '/tmp/opencode/doc-rect.png' });

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
