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
- `scripts/verify_chat.mjs` — no voice, but makes 1–2 real DeepInfra chat calls (a few cents). Runs free of Soniox/Groq.

Free — safe to run routinely:
- `scripts/verify_sheet_nav.mjs`, `scripts/verify_portal_a11y.mjs`, `scripts/verify_identity.mjs`
- `scripts/verify_verification_steps.mjs`, `scripts/verify_progress_visible.mjs`, `scripts/verify_face_capture.mjs`
- `npm run test:semantic`, `npm run test:identity`

Default regression sweep for ordinary UI/portal work: the free suites + `npx tsc --noEmit`.

## Case tracking (root menu option 3)

- Menu: `1` general inquiry, `2` problem/application, `3` case tracking. Key `3`
  used to be a hardcoded mock docket readout; it is now real tracking.
- The four-digit voice login PIN is keyed digit by digit, exactly like the phone
  number, so no new gesture is taught. Three wrong PINs close the call.
- `POST /api/voice/case-status` resolves the PIN to a case and returns
  `state: "filed" | "application"`. Filed means enrolled with an advocate
  assigned; a fresh voice intake is an application. The response deliberately
  carries no name, phone, address or problem statement, and an unknown PIN is
  shaped identically to a wrong one.
- The mic is muted while a PIN is keyed, so the query/warn/hangup inactivity
  escalation has nothing to listen for. The tracking branch instead uses one
  longer grace window and then plays the recorded `inactivity_hangup` sign-off.
- Only static prompts are pre-recorded. The wrong-PIN and result prompts stay on
  TTS because they embed a remaining-attempts count or a docket number, and a
  fixed clip would drop that on every replay. Regenerate with
  `node scripts/generate_audio_prompts.mjs <name-filter>`.
- Test fixtures: PIN `1234` is a submitted application, PIN `5678` is a filed
  case. Both are `is_mock` rows.

## Universal chatbot (visitors + citizens)

- Model: DeepInfra `deepseek-ai/DeepSeek-V4-Flash` (`lib/chat/deepinfra.ts`).
- Memory is data, not code: `lib/chat/memory/*` over D1 tables from migration `0014`.
  The data control centre pushes batches to `POST /api/chat/memory/ingest`
  (`x-memory-key: $MEMORY_INGEST_KEY`, or any non-citizen staff session).
  Ingestion is idempotent on `(source, external_id)`; re-pushes are safe.
- Prompt cache retention: the stable prefix (instructions + core memory) carries
  `prompt_cache_breakpoint`; question-specific retrieval and history go after it.
  A `ttl` is sent only to open the window, at most once every 4 minutes, because
  re-sending it re-bills the cache-write premium. `usage.prompt_tokens_details`
  is surfaced so the saving is measurable. DeepInfra's docs list retention for
  Nemotron-3-Ultra and Kimi-K2.7-Code only, but V4-Flash does cache in practice.
- Web search is a deterministic server decision (`needsWebSearch`), not a model
  tool call: this model answered from its own knowledge and invented helpline
  16430 instead of calling the tool. Search fires only inside legal-aid scope.
- Access is gated to visitors and citizens; `DlaoShell`/`LawyerShell` do not
  mount the widget and `/api/chat` returns 403 for staff.
- The launcher stacks above the 16699 call button (bottom 84px, panel 148px) so
  the portal's primary action keeps its exact position.

