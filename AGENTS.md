User identity: adribmahmud101 — GitHub account AdribMahmud101 (https://github.com/AdribMahmud101/legal-voice-agent.git), HTTPS remote `origin`, push to `main`.

Deploy: `npx opennextjs-cloudflare build && npx wrangler deploy` (site: legal-voice-agent.adribmahmud.workers.dev). Typecheck first: `npx tsc --noEmit`.
STT/TTS: Soniox only. TTS needs `Authorization: Bearer` on WS handshake (worker proxy handles it); keepalive `{"keep_alive":true}`/`{"type":"KeepAlive"}` every 20s; stale sockets handled by `speakWhenReady` in `lib/voice-sdk/direct/ws_tts.ts`.

## Verification cost — IMPORTANT

Some `scripts/verify_*.mjs` suites drive the real voice pipeline over the network, which
**spends paid Soniox (STT/TTS) and Groq (LLM) credits**. Opening a call connects the
STT stream and plays prompts, so a suite that clicks "কল করুন" is a billing event even
if it never asserts on a transcript.

**Never run a suite in the SPENDS section without asking first.** If the work is not
voice-related, do not run them at all — say they were skipped and why.

### SPENDS CREDITS — ask before running

Opens a real call:
- `scripts/verify_transcription_latency.mjs` — **the most expensive of the three.**
  Synthesises one TTS clip AND streams STT **twice** (clean + 0 dB) per run.
- `scripts/verify_keypad_routes.mjs` — opens a call and drives the on-screen keypad;
  prompts are pre-recorded so there is no TTS synthesis, but STT still streams.
- `scripts/verify_language_audio.mjs` — opens a call, all prompts pre-recorded.

Full voice conversation (STT + TTS + LLM):
- `scripts/verify_intake_e2e.mjs` — full voice intake. Most expensive overall.
- `scripts/verify_dialpad_intake.mjs` — full intake via keypad.
- `scripts/verify_intake_chain.mjs` — drives the whole intake chain.
- `scripts/verify_full_voice_pipeline.mjs` — end-to-end pipeline.
- `scripts/verify_general_to_problem.mjs` — several real LLM turns.
- `scripts/verify_problem_ack.mjs` — speaks prompts (some TTS).
- `scripts/verify_landing_and_softphone.mjs` — exercises the softphone.
- `scripts/verify_chat.mjs` — no voice, but 1–2 real DeepInfra calls (a few cents).

### FREE — safe to run routinely

Confirmed by grep: none of these click "কল করুন" or touch `/v1/stt` or `/v1/tts`.
- `scripts/verify_sheet_nav.mjs`, `scripts/verify_portal_a11y.mjs`, `scripts/verify_identity.mjs`
- `scripts/verify_verification_steps.mjs`, `scripts/verify_progress_visible.mjs`, `scripts/verify_face_capture.mjs`
- `scripts/verify_manual_application.mjs` — honours `SITE`
- `npm run test:semantic`, `npm run test:identity`
- `npm run test:case-rules` — case/SLA/guard/audit/role business rules. Pure, no network.
- `npm run test:case-flows` — the approval flows end to end against the 0016 rules. Pure.

Re-check that list with
`cd scripts && grep -cE "কল করুন|\.start\(|/v1/stt|/v1/tts" verify_*.mjs`
before trusting it after adding a suite.

Default regression sweep for ordinary UI/portal work: the free suites + `npx tsc --noEmit`.

## Voice prompt sequence — say each thing once

- The opening is **one clip**, `greeting_language.wav`: welcome + recording notice +
  the language question. It is 10.8s; as two separate clips (`greeting.wav` +
  `language_select.wav`) it was 19.6s before the caller could act on anything.
- `MERGED_GREETING_PROMPT` in `direct_session.ts` must match the clip text exactly.
  **Editing the string does not change what callers hear** — the audio is
  pre-recorded. Re-synthesize with
  `node scripts/generate_audio_prompts.mjs greeting_language` (it borrows the
  deployed worker's TTS proxy, so no local Soniox key is needed).
- After the opening the agent goes **straight to voice input** — no second prompt.
  `languageSelectionPending` keeps the mic live, and `enterDtmfWait()` returns
  early in that state, so nothing gates the caller.
- The 1/2/3 root menu is a separate clip, `ivr_menu.wav`, played exactly once after
  the language is known. It must never be merged into the opening: both the language
  keys and the menu keys are 1/2/3, so one breath asking for a language and
  announcing the menu is genuinely ambiguous. No acknowledgement is spoken after
  the language keypress — the keypress is its own acknowledgement, and a short
  silence before a DTMF wait is normal IVR.
- `ROOT_MENU_PROMPT` is a module constant reused by the greeting path and the
  post-language-selection prompt so those cannot drift apart. Do not re-inline it.
## General query must be voice-reachable, not keypad-only

- The loop is: caller speaks → general-query LLM turn → spoken answer → repeat →
  inactivity or a cut-call intent ends it, with a deterministic offer to switch into
  the problem phase along the way.
- `generalQueryMode` used to be set in exactly one place — the keypad branch of
  `sendUserMessageInternal` that matches `১ (সাধারণ তথ্য ও নিয়মাবলী)`. Everything
  downstream is gated on that flag: `armOfferFromAssistantTurn` (the switch-to-problem
  offer), `armInactivityTimer`, the post-turn inactivity re-arm in
  `flushAccumulatedUtterance`, and `handleSeverityInput`. So a caller who *spoke*
  instead of pressing 1 still got an LLM answer, but the rest of the loop was dead —
  no offer to switch, no inactivity escalation, no cut-call handling, and the call
  could hang forever.
- `flushAccumulatedUtterance` now enters `generalQueryMode` silently when a
  committed utterance lands at the root menu (`intakeStep === "idle"`, not case
  tracking). Silent is deliberate: the caller has already stated the problem, so
  re-prompting "আপনার প্রশ্নটি বলুন, আমি শুনছি" would just repeat themselves. The
  keypad path still speaks that prompt, which is correct there because the caller
  has not said anything yet.
- `looksLikePersonalProblem` (personal pronoun + problem keyword) is what arms the
  offer. The offer question itself must never depend on the LLM's wording, only the
  arming signal does.
- Testing this needs speech **followed by silence**. A looping clip never lets a turn
  close, so nothing commits and the loop looks broken when it is merely mid-utterance.
  Build the fixture as speech + ~6s of appended silence.

## STT input gating — the root menu is voice-first

- **There is no DTMF *detection* anywhere in this codebase.** `lib/audio/dtmf.ts` is
  a *synthesiser* (`playDtmfTone`) for the softphone's on-screen keypad, and
  `handleDialKeyPress` turns that click into `sendMessage(...)`. Nothing decodes a
  real DTMF tone out of the mic stream. So "the caller pressed 1" is only ever true
  for someone using the browser keypad.
- `enterDtmfWait()` therefore **must not** be a mic gate. It used to mute the
  worklet *and* the half-duplex guard dropped every chunk while `waitingForDtmf`,
  which meant a real 16699 caller dialling from a phone — or anyone who spoke
  instead of pressing a key — was silenced with no route forward. The reported
  symptom was "transcription is not working"; the server and Soniox were both fine.
- The half-duplex guard now drops audio only for `isAssistantSpeaking` and
  `greetingActive`. During the root-menu hold the agent is silent, so there is no
  echo to reject, and the mic stays live. `flushAccumulatedUtterance` calls
  `exitDtmfWait()` so a committed utterance releases the hold, matching the keypad
  path in `sendUserMessageInternal`.
- `enterDtmfWait()` is used **only** for the root menu (two call sites). Case
  tracking emits `dtmf_wait` without it, so the 4-digit PIN step is unaffected —
  keep it that way; the PIN is security-sensitive and must not accept ambient speech.
- A silent caller during language selection is re-asked with `LANGUAGE_REASK_PROMPT`
  (language question only, via TTS). Replaying the full merged intro would add
  another 10.8s on top of the wait.
- Server-side STT is `wss://stt-rt.soniox.com/transcribe-websocket` behind the
  `/v1/stt` proxy, which injects `SONIOX_API_KEY`. It survives a crowded room: fed
  Bangla speech at 0dB SNR it still returned correct text, degrading only to
  `৩ চাপুন` → `৩টা পথ`. When transcription "breaks", suspect the client gate or the
  VAD before suspecting the provider.
- `language_hints_strict: true` is set with `bn` as the only hint, so non-Bengali
  speech can return nothing at all. That is a plausible cause of an empty
  transcript and is the first thing to relax if a caller reports it.
- `language_select.wav` and the three `language_confirmed_{bn,marma,chakma}.wav`
  clips are retired — deleted from disk, from the generator list, and from the
  AudioKind/cache/path plumbing. That is ~1.9 MB off the deploy. `greeting.wav`
  stays, because the non-fresh path still speaks it before the menu.
- `scripts/verify_language_audio.mjs` asserts the whole shape: one merged opening
  clip, no separate greeting, no separate language clip, no menu during the opening,
  exactly one `ivr_menu.wav` after selection, and no TTS anywhere. Note
  `audioFetched` there is cumulative, so it must compare the **delta**, not the total.

## Transcription must be visible fast, and commit fast

Two failures that look identical from the caller's seat but are not the same bug:

- **Perceived.** `handleSttInterim` used to assign `currentTranscript` and emit
  nothing, so Soniox's streaming partials were thrown away and the caller saw a
  blank panel until the whole sentence appeared at commit. Worse, the transcript
  sits behind a tab whose default view is the docket, which shows only
  "অপেক্ষা করা হচ্ছে…" placeholders — so by default the caller saw no transcription
  at all. `handleSttInterim` now emits `interim_transcript` (throttled to 250ms,
  replacement not delta) and the softphone renders a persistent live strip *above*
  the tabs, so it is visible on every tab. Measured 30–90ms after the first token.
- **Real.** `attemptFlush` waited on the local VAD even after the engine had
  emitted `<end>`/`<fin>`. The VAD decides "speech stopped" from spectral energy
  against an adaptive noise floor, so in a crowded room the floor rises, the
  silence detector never fires, and every turn stalled: ~6.2s endpoint-to-commit.
  `attemptFlush` now takes `engineEnded` and, once the engine has ended the turn,
  stops blocking on the VAD after a 900ms grace — bounded, so a genuine
  mid-sentence pause is still not cut off and later clauses still join the same
  turn. Measured 1.01s endpoint-to-commit, and identical clean vs 0dB (0ms skew).
- The idle-finalize fallback in `soniox_stt.ts` is 1400ms (was 2000ms). It only
  fires when no token has arrived for that long, so it is a backstop for the
  engine failing to endpoint, not the normal path.
- **Do not** retune `max_endpoint_delay_ms`, `endpoint_sensitivity` or the VAD
  thresholds to chase speed. Those were calibrated for Bangla accuracy; the noise
  problem is solved by trusting the engine's endpoint, not by loosening them.
- `scripts/verify_transcription_latency.mjs` guards all of it: interim visible
  within 600ms of the first token, commit within 2200ms of the endpoint, and
  clean-vs-crowded commit skew under 700ms. It synthesises its own fixture through
  the worker's TTS proxy and appends a silent tail — a clip that never goes quiet
  never lets a turn close, so the commit assertion would measure nothing.

## Case domain — business rules live in ONE place

- `lib/case/domain.ts` is the single answer to "which case actions are legal right
  now" (`caseActionState`) and "what is overdue" (`assessSla` / `slaScan`). Pure and
  dependency-free so it is testable without a browser and reusable from an API
  route, a server component or a client component. **Never re-derive these rules in a
  screen** — that centralisation is the most valuable property in the
  "DLAS Dashboards — Feature & Implementation Guide".
- Reason keys are stable and machine-readable (`closed`, `mandatory`, `medLate`,
  `needFailedMed`, `needEligibility`, `lawyerAlready`, `nothingBillable`,
  `medNotAccepted`, `workStarted`, `transferPending`). Branch on these, not on prose.
- `settled` / `unresolved` are terminal: every action returns `closed`.
- Appellate (`sclao`) and Labour (`labour`) tracks skip mediation entirely and
  substitute an eligibility check (`needEligibility`). They must NOT inherit a
  district persona. The mandatory-mediation rule does not hijack these tracks.
- A Special Mediator is not payable for merely being asked — `requestPay` needs
  `mediatorAccepted`.
- SLA is computed once per load and written as log rows; badges count rows rather
  than recomputing per render, so a breach that happened unobserved still shows.
  Mediation ages on its own 60/90-day clock, everything else on 14/30.
- `npm run test:case-rules` covers all of it (102 checks, free, no network).

## Case operations tables (migration 0016)

- `migrations/0016_case_operations.sql` adds the tables the approval flows need:
  `case_stage_history`, `mediations`, `mediator_requests`, `settlements`, `payments`,
  `tranches`, `transfers`, `lawyer_requests`, `lawyer_apps`, `panel_lawyers`,
  `misconduct_cases`, `sla_log`, `case_facts`, `case_reps`, `safe_profiles`,
  `safe_contact_destinations`, `message_outbox`, `audit_log`, `assist_decisions`.
- It is **strictly additive**: every object is `CREATE ... IF NOT EXISTS` and the only
  `ALTER`s are `ADD COLUMN`, which SQLite supports without a rebuild. Nothing is
  dropped, renamed or re-typed, so no live query can break. That is the whole reason
  it is shaped this way — see the 0015 note about D1 refusing table rebuilds.
- `cases.status` was deliberately left alone. It is the portal-facing status that
  existing screens and `mapPortalCase` already read. `cases.stage` is the case
  lifecycle the domain rules operate on, constrained to the 7 values in
  `CASE_STATUSES`. Two columns, two jobs — do not collapse them.
- `case_facts` is keyed on `ref`, not a foreign key to `cases`, on purpose: a fact can
  belong to an *application* that has not been accepted yet. Verified — deleting a case
  cascades its payments/mediations/tranches but deliberately leaves its facts.
- `safe_contact_destinations` is `UNIQUE (ref, channel)`: one rule per channel, so a
  second row cannot silently disagree with the first.
- `mediations` is repeatable (one row per attempt) because the lawyer gate reads the
  *last* outcome specifically — that is what distinguishes `medLate` from
  `needFailedMed`.
## Roles, screen guard, and the audit trail

- `lib/auth/roles.ts` holds the registry. The canonical keys are the short ones
  (`dlao`, `chief`, `chairman`, …); the old long keys are kept as **legacy aliases**
  so the ~27 existing `role === 'x'` comparisons keep working untouched.
- `users.role`'s CHECK **cannot be widened**: SQLite has no ALTER for a CHECK and D1
  rejects `DROP TABLE users` because of the foreign keys (verified — plain DROP and
  `PRAGMA defer_foreign_keys` both fail). So migration `0015` is additive:
  `users.role_key` holds the real role, `users.role` keeps a generic staff seat, and
  session resolution prefers `role_key` and falls back to `role`. `panel_lawyer` was
  in `APP_ROLES` but missing from the original CHECK, so it could never be persisted.
- `lib/auth/screen-guard.ts` is the route-level guard, not per-component `if`s.
  `whichScreen` decides where to *bounce* someone; `canAccessScreen` decides a hard
  deny. The Chief console renders both `chief` and `chairman` variants, and they
  differ only on Panel list (Chief proposes, Chairman approves) and Misconduct
  (committee only).
- `lib/case/audit.ts` models the things that gate access or money. Sensitive-case
  opens, ID verification, AI-assist overrides, payment decisions, misconduct actions
  and message sends are **log records, not state flags** — retrofitting this is the
  expensive path. `decideSend` is the only way to contact an applicant and it fails
  closed, so blocked attempts still reach the log.

## Manual application (portal "নতুন আবেদন করুন")

- The apply modal in `components/portal-view.tsx` used to be a **stub**:
  `submitApplication` read no field, posted nothing, flashed a success message and
  opened the softphone. Every answer a visitor typed was discarded. It is now
  `components/apply-wizard.tsx` backed by `POST /api/portal/applications`.
- The wizard asks the **same slots in the same order** as the 16699 voice intake:
  problem → disability (+type when yes) → gender → name → phone → address/district.
  Anything the voice flow infers from a dial pad or from caller tone is deliberately
  absent — no "is this your primary number?" (the number is typed), and the district
  is picked rather than detected from speech.
- The **language question is not asked on the web form**. The voice intake needs it
  because it must know how to interpret speech; a web applicant types in Bangla, and
  asking cost them a whole step. So the form is 6 steps (7 when a disability is
  disclosed) and always files `language: "bn"`. The route still accepts `marma` and
  `chakma` server-side, so an indigenous-language statement stays supported for any
  caller that can supply one — it is just no longer reachable from this form.
- `POST /api/roles/complete` stays the **voice** endpoint. The portal route is a
  separate Next route so it works under `next dev` as well as the Worker, and it
  writes `source = 'manual'` (the schema already allowed `voice|portal|manual`).
- Enrichment runs **server-side**, not from the browser: `classifySeverity` and
  `inferLegalCategory` are deterministic keyword passes, so urgency/priority/
  severity and the legal category cannot be asserted by a client. Severity was
  previously only ever derived from the voice path.
- An indigenous-language problem statement is interpreted server-side and must be
  confirmed in Bangla before it is filed, mirroring `semantic_confirmation`. The
  client's `semanticConfirmed` is only consent to store; the values stored are the
  server's own.
- Registration **auto-logs the applicant in**: the route inserts an `auth_sessions`
  row and returns the same `auth_session` cookie the voice path sets. No login step.
- The four-digit voice PIN is issued exactly as on the phone (never a leading
  zero) so a web applicant can use 16699 case tracking later. A web user has no SMS
  to receive it in, so the receipt is shown in the modal *and* written to the
  simulated SMS inbox.
- Submitting is idempotent on a client-generated `sessionId`, mapped to
  `cases.voice_session_id`. A double submit re-issues the session but does not open
  a second case.
- After submitting, the applicant lands on `/citizen`, which already renders
  `পরিচয় যাচাই — ৩ ধাপ` and the same document → face → signature steps a voice
  caller gets. Those three endpoints exist **only in `worker-entry.ts`**, so they
  are unreachable under `next dev`; the wizard itself works locally, its submit
  returns 503 without a D1 binding.
- `lib/legal/districts.ts` and `lib/legal/category.ts` are now shared by the voice
  session and the portal, so a case is categorised and located identically whichever
  way it arrives. The district list was **missing বান্দরবান, খাগড়াছড়ি, রাঙ্গামাটি
  and রাজবাড়ী** — a caller in one of those four silently fell back to ঢাকা. All 64
  are listed now, with the four appended at the end: `extractDistrict` returns the
  first substring hit, so reordering existing names could change a live match, and
  none of the four shadows an existing entry in either direction.
- `inferLegalCategory` is run on the semantic bridge's **Bangla reading**, not the
  raw transcript. The keywords it matches (`স্বামী`, `তালাক`) exist only in the
  translation, so a Marma domestic-violence report was being filed as
  `general_civil` while severity correctly said `emergency`.
- `scripts/verify_manual_application.mjs` covers the validation matrix, the
  registration, the auto-login, the filed case, the 0-of-3 verification progress and
  the idempotent re-submit. It probes for D1 and skips the persistence phase under
  `next dev` rather than reporting false failures. The full pass needs a real D1 —
  `wrangler d1 migrations apply legal-voice-db --local` then
  `npx wrangler dev --local` and `SITE=http://localhost:8787 node scripts/verify_manual_application.mjs`.

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

