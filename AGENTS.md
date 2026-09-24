User identity: adribmahmud101 — GitHub account AdribMahmud101 (https://github.com/AdribMahmud101/legal-voice-agent.git), HTTPS remote `origin`, push to `main`.

Deploy: `npx opennextjs-cloudflare build && npx wrangler deploy` (site: legal-voice-agent.adribmahmud.workers.dev). Typecheck first: `npx tsc --noEmit`.
STT/TTS: Soniox only. TTS needs `Authorization: Bearer` on WS handshake (worker proxy handles it); keepalive `{"keep_alive":true}`/`{"type":"KeepAlive"}` every 20s; stale sockets handled by `speakWhenReady` in `lib/voice-sdk/direct/ws_tts.ts`.
