import { chromium } from 'playwright-core';

// ============================================================================
//  COSTS PAID CREDITS — drives the real voice pipeline (Soniox STT/TTS + Groq LLM).
//  Do not run as part of a routine regression sweep. See AGENTS.md.
// ============================================================================
const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

async function main() {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['microphone']);
  const page = await ctx.newPage();

  const ttsSpoken = [];
  const audioFetched = [];

  page.on('websocket', (ws) => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', (f) => {
        try {
          const p = JSON.parse(f.payload.toString());
          if (p.type === 'Speak' && p.text) ttsSpoken.push(p.text);
        } catch {}
      });
    }
  });
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (u.pathname.startsWith('/audio/') && res.status() === 200) {
      audioFetched.push(u.pathname);
    }
  });

  const send = async (msg, wait = 3000) => {
    await page.evaluate((m) => window.__voiceAgent?.sendUserMessage(m), msg);
    await page.waitForTimeout(wait);
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(5000);

  const afterGreeting = { audio: [...audioFetched], tts: [...ttsSpoken] };
  console.log('\n=== AFTER GREETING (language selection pending) ===');
  console.log('pre-recorded fetched:', afterGreeting.audio);
  console.log('TTS synthesized    :', afterGreeting.tts.length === 0 ? '(none)' : afterGreeting.tts);

  const selectViaTts = afterGreeting.tts.some((t) => t.includes('ভাষা নির্বাচন'));

  // Marma = 2
  await send('২', 4000);
  const afterMarma = [...audioFetched];
  console.log('\n=== AFTER SELECTING MARMA (2) ===');
  console.log('pre-recorded fetched:', afterMarma);

  const results = {
    languagePrompt_prerecorded: afterGreeting.audio.includes('/audio/language_select.wav'),
    languagePrompt_notTTS: !selectViaTts,
    marmaAck_prerecorded: afterMarma.includes('/audio/language_confirmed_marma.wav'),
  };

  console.log('\n=== RESULTS ===');
  for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v ? 'PASS' : 'FAIL'}`);
  const pass = Object.values(results).every(Boolean);
  console.log(pass ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
