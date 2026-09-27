/** Header: the merged A1+A2 entry on the login panel. FREE — no call, no STT/TTS. */

import { chromium } from "playwright-core";
const site = process.env.SITE || 'https://legal-voice-agent.adribmahmud.workers.dev/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
let fail = 0;
const ck = (k, v, x = "") => { if (!v) fail++; console.log(`${v ? "PASS" : "FAIL"} ${k}${x ? " :: " + x : ""}`); };

await p.goto(site + "login", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const txt = await p.evaluate(() => document.body.innerText);

ck("login panel shows the merged entry", /A1\+A2/.test(txt), "codes badge");
ck("it names both people", txt.includes("মোয়ূরী") && txt.includes("রিপন"));
ck("it says it starts the simulation", /সিমুলেশন/.test(txt));
ck("the other three are still separate", txt.includes("নাবিলা") && txt.includes("নুচিং") && txt.includes("আব্দুল মালেক"));

// The merged entry is a LINK, not a login button.
const link = p.locator('a[href*="scenario=moyuri-ripon"]').first();
ck("the merged entry navigates rather than logging in", await link.count() === 1, await link.getAttribute("href"));

// The individual ones still sign in.
const chips = await p.locator('button[aria-label*="লগইন করুন"]').count();
ck("three individual login buttons remain", chips === 3, String(chips));

// Click it and land on the right script.
await link.click();
await p.waitForLoadState("networkidle");
await p.waitForTimeout(1500);
ck("lands on the simulation page", p.url().includes("/demo/simulation"), p.url());
const sim = await p.evaluate(() => document.body.innerText);
ck("the Moyuri/Ripon script is selected", sim.includes("মোয়ূরী") && sim.includes("রিপন"));
ck("its run button is there", await p.locator('button:has-text("সিমুলেশন চালান")').count() >= 1);
ck("the 15-minute window panel is present", /১৫ মিনিট/.test(sim), "");

// And the deep link really does select it (not just the default).
await p.goto(site + "demo/simulation?scenario=nuching", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const deep = await p.evaluate(() => document.body.innerText);
ck("a deep link selects its own scenario", deep.includes("নুচিং") && !deep.includes("প্রতিনিধি হিসেবে ফোন করেছি"), "");

ck("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
await b.close();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
