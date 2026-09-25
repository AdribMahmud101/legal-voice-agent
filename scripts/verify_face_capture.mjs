import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';

// Chromium's fake device labels are opaque ("fake_device_0"), so a label-based
// front/back guess cannot be trusted here. Everything below asserts on the
// deviceId the browser actually hands back, which is ground truth.
async function seedSession(page) {
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
}

const activeDevice = (page) =>
  page.evaluate(() => {
    const track = document.querySelector('video')?.srcObject?.getVideoTracks?.()[0];
    return {
      deviceId: track?.getSettings?.().deviceId ?? null,
      playing: document.querySelector('video') ? !document.querySelector('video').paused : false,
      label: track?.label ?? '',
    };
  });

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
  await seedSession(page);

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

  const cameraCount = await page.evaluate(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput').length;
  });

  const before = await activeDevice(page);
  check('a camera device is pinned', !!before.deviceId, JSON.stringify(before));

  const switchBtn = page.getByRole('button', { name: /ক্যামেরা পরিবর্তন করুন/ });
  check('switch button present when >1 camera', cameraCount > 1 ? (await switchBtn.count()) === 1 : true, `cameras=${cameraCount}`);
  check('switch button announces active camera', /পিছনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));

  // The regression that matters: the browser must report a DIFFERENT device.
  await switchBtn.click();
  await page.waitForTimeout(2500);
  const after = await activeDevice(page);
  check('switching restarts the stream', after.playing, JSON.stringify(after));
  check('switch actually changes the camera device', !!after.deviceId && after.deviceId !== before.deviceId, `before=${before.deviceId} after=${after.deviceId}`);
  check('switch button label updates', /সামনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));
  await page.screenshot({ path: '/tmp/opencode/face-circle.png' });

  // switching back returns to the original device
  await switchBtn.click();
  await page.waitForTimeout(2000);
  const backAgain = await activeDevice(page);
  check('can switch back to the first camera', backAgain.deviceId === before.deviceId, `expected=${before.deviceId} got=${backAgain.deviceId}`);

  // ---------- single-camera device must not offer a switch ----------
  const singleCtx = await browser.newContext({ viewport: { width: 430, height: 1000 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
  await singleCtx.addInitScript(() => {
    const real = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => {
      const all = await real();
      return all.filter((d) => d.kind !== 'videoinput').concat(all.filter((d) => d.kind === 'videoinput').slice(0, 1));
    };
  });
  const singlePage = await singleCtx.newPage();
  await singlePage.goto(site, { waitUntil: 'networkidle' });
  await seedSession(singlePage);
  await singlePage.goto(`${site}citizen/verify/face`, { waitUntil: 'networkidle' });
  await singlePage.waitForTimeout(1800);
  await singlePage.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await singlePage.waitForTimeout(2500);
  const singleSwitch = singlePage.getByRole('button', { name: /ক্যামেরা পরিবর্তন করুন/ });
  check('switch button hidden on single-camera device', (await singleSwitch.count()) === 0, `count=${await singleSwitch.count()}`);
  const singleLive = await activeDevice(singlePage);
  check('single-camera device still captures', singleLive.playing, JSON.stringify(singleLive));
  await singleCtx.close();

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
