User identity: adribmahmud101 — GitHub account AdribMahmud101 (https://github.com/AdribMahmud101/legal-voice-agent.git), HTTPS remote `origin`, push to `main`.

Deploy: `npx opennextjs-cloudflare build && npx wrangler deploy` (site: legal-voice-agent.adribmahmud.workers.dev). Typecheck first: `npx tsc --noEmit`.
STT/TTS: Soniox only. TTS needs `Authorization: Bearer` on WS handshake (worker proxy handles it); keepalive `{"keep_alive":true}`/`{"type":"KeepAlive"}` every 20s; stale sockets handled by `speakWhenReady` in `lib/voice-sdk/direct/ws_tts.ts`.

## Verification cost — IMPORTANT

Some `scripts/verify_*.mjs` suites drive the real voice pipeline over the network, which
**spends paid Soniox (STT/TTS) and Groq (LLM) credits**. Do NOT run these on every change;
run them only when the voice pipeline itself was modified, or when the user explicitly asks.

Costs real credits (avoid unless relevant):
- `scripts/verify_intake_e2e.mjs` — full voice intake, TTS + STT + LLM. Most expensive.
- `scripts/verify_dialpad_intake.mjs` — full intake via keypad.
- `scripts/verify_general_to_problem.mjs` — several real LLM turns.
- `scripts/verify_problem_ack.mjs` — speaks prompts (some TTS).
- `scripts/verify_language_audio.mjs` — opens a call, but mostly asset fetches.

Free — safe to run routinely:
- `scripts/verify_sheet_nav.mjs`, `scripts/verify_portal_a11y.mjs`, `scripts/verify_identity.mjs`
- `scripts/verify_verification_steps.mjs`, `scripts/verify_progress_visible.mjs`, `scripts/verify_face_capture.mjs`
- `npm run test:semantic`, `npm run test:identity`

Default regression sweep for ordinary UI/portal work: the free suites + `npx tsc --noEmit`.

