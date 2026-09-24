// @ts-ignore
import nextWorker from "./.open-next/worker.js";
import { searchUniversalInquiries, getUniversalGeneralKnowledgeBlock } from "./lib/agent/knowledge/universal-inquiries_v2";
import { lookupStatute } from "./lib/agent/knowledge/statutes";

/**
 * Soniox Real-Time STT WebSocket proxy: injects the server-side SONIOX_API_KEY
 * into the session config, so the browser never holds the credential.
 * The client sends the config JSON WITHOUT api_key (or with it stripped here)
 * followed by binary PCM audio; control messages ({type:"keepalive"}/
 * {"type":"finalize"}) are forwarded verbatim.
 */
function handleSttWebSocket(request: Request, env: any): Response {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  const url = new URL(request.url);
  const language = url.searchParams.get("language") || "bn";

  // @ts-ignore
  const pair = new (globalThis as any).WebSocketPair();
  const clientWs: any = pair[0];
  const serverWs: any = pair[1];
  serverWs.accept();

  // @ts-ignore
  const upstream = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
  let configSent = false;
  let upstreamOpen = false;
  let queuedText: string[] = [];
  let queuedBin: ArrayBuffer[] = [];
  // Strict FIFO transformer for Blob → ArrayBuffer: parallel arrayBuffer()
  // promises would resolve out of order and scramble the PCM stream.
  let transformChain: Promise<void> = Promise.resolve();

  const sendNormalized = (data: string | ArrayBuffer) => {
    if (!upstreamOpen || upstream.readyState !== 1) {
      if (typeof data === "string") queuedText.push(data);
      else queuedBin.push(data);
      return;
    }
    upstream.send(data);
  };

  const sendUp = (data: any) => {
    if (data instanceof Blob) {
      transformChain = transformChain.then(() => data.arrayBuffer()).then((ab) => {
        sendNormalized(ab);
      }).catch(() => {});
      return;
    }
    sendNormalized(data);
  };

  const flushQueues = () => {
    const t = queuedText;
    const b = queuedBin;
    queuedText = [];
    queuedBin = [];
    for (const q of t) if (upstream.readyState === 1) upstream.send(q);
    for (const x of b) if (upstream.readyState === 1) upstream.send(x);
  };

  upstream.addEventListener("open", () => {
    upstreamOpen = true;
    const apiKey = env.SONIOX_API_KEY || "";
    const params = {
      api_key: apiKey,
      model: "stt-rt-v3",
      audio_format: "s16le",
      num_channels: 1,
      sample_rate: 16000,
      language_hints: [language],
      enable_endpoint_detection: true,
      endpoint_latency_adjustment_level: 1,
      endpoint_sensitivity: 0.2,
      max_endpoint_delay_ms: 1500,
    };
    upstream.send(JSON.stringify(params));
    configSent = true;
    flushQueues();
    // After queued traffic, drain any in-flight transform chain tail.
    transformChain.then(() => flushQueues()).catch(() => {});
  });

  upstream.addEventListener("message", (evt: any) => {
    if (serverWs.readyState !== 1) return;
    if (evt.data instanceof ArrayBuffer || evt.data instanceof Uint8Array) {
      serverWs.send(evt.data);
    } else {
      serverWs.send(evt.data as string);
    }
  });

  upstream.addEventListener("close", (evt: any) => {
    if (serverWs.readyState === 1) serverWs.close(evt.code || 1000, evt.reason || "");
  });
  upstream.addEventListener("error", () => {
    if (serverWs.readyState === 1) serverWs.close();
  });

  serverWs.addEventListener("message", (evt: any) => {
    try {
      const data = evt.data;
      if (data instanceof Blob) {
        // Cloudflare delivers client binary WS frames as Blob — must be
        // materialised into ArrayBuffer (strict FIFO) before forwarding
        // upstream, otherwise upstream receives text or out-of-order PCM.
        sendUp(data);
        return;
      }
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        if (upstream.readyState === 1) upstream.send(data);
        return;
      }
      if (typeof data === "string") {
        if (configSent) sendUp(data);
        return;
      }
      if (upstream.readyState === 1) upstream.send(data);
    } catch {}
  });

  serverWs.addEventListener("close", () => {
    if (upstream.readyState === 1) upstream.close();
  });

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: clientWs,
  });
}

async function handleTtsWebSocket(request: Request, env: any): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  // @ts-ignore
  const pair = new (globalThis as any).WebSocketPair();
  const clientWs: any = pair[0];
  const serverWs: any = pair[1];
  serverWs.accept();

  const apiKey =
    env.SONIOX_API_KEY || "";

  let upstreamWs: any = null;
  let upstreamConnecting: Promise<any> | null = null;
  let currentStreamId: string | null = null;
  let streamEnded = false;
  let flushSent = false;
  let streamEpoch = 0;
  let clientMessageQueue: Promise<void> = Promise.resolve();
  const model = "tts-rt-v2";
  const language = env.TTS_LANGUAGE || "bn";
  const voice = env.TTS_VOICE_ID || "Priya";

  async function ensureUpstream(): Promise<any> {
    if (upstreamWs && upstreamWs.readyState === 1) {
      return upstreamWs;
    }
    if (upstreamConnecting) {
      return upstreamConnecting;
    }
    upstreamConnecting = (async () => {
      try {
        const upstreamResp: any = await fetch("https://tts-rt.soniox.com/tts-websocket", {
          headers: { Upgrade: "websocket", Authorization: `Bearer ${apiKey}` },
        });
        if (!upstreamResp.webSocket) {
          const details = await upstreamResp.text().catch(() => "");
          throw new Error(`TTS upstream rejected: HTTP ${upstreamResp.status} ${details.slice(0, 100)}`);
        }
        const ws = upstreamResp.webSocket;
        ws.accept();
        upstreamWs = ws;

        ws.addEventListener("message", (evt: any) => {
          if (serverWs.readyState !== 1) return;
          try {
            const msg = JSON.parse(evt.data as string);
            if (msg.error_code !== undefined) {
              console.error("[TTS upstream error]", msg.error_code, msg.error_message);
              if (currentStreamId && !flushSent) {
                flushSent = true;
                serverWs.send(JSON.stringify({ type: "Flushed" }));
              }
              currentStreamId = null;
              streamEnded = false;
              return;
            }
            if (msg.stream_id === currentStreamId) {
              if (typeof msg.audio === "string") {
                const binStr = atob(msg.audio);
                const len = binStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binStr.charCodeAt(i);
                }
                serverWs.send(bytes.buffer);
              }

              if (msg.audio_end === true || msg.terminated === true) {
                currentStreamId = null;
                streamEnded = false;
                if (serverWs.readyState === 1 && !flushSent) {
                  flushSent = true;
                  serverWs.send(JSON.stringify({ type: "Flushed" }));
                }
              }
            }
          } catch {}
        });

        ws.addEventListener("close", () => {
          if (upstreamWs === ws) upstreamWs = null;
          // Resilient: Soniox closes idle WebSockets with 1001 Timeout after 10s.
          // Do NOT close serverWs! If an active stream was interrupted, send Flushed.
          if (currentStreamId && !flushSent) {
            flushSent = true;
            if (serverWs.readyState === 1) {
              serverWs.send(JSON.stringify({ type: "Flushed" }));
            }
            currentStreamId = null;
            streamEnded = false;
          }
        });

        ws.addEventListener("error", () => {
          if (upstreamWs === ws) upstreamWs = null;
          if (currentStreamId && !flushSent) {
            flushSent = true;
            if (serverWs.readyState === 1) {
              serverWs.send(JSON.stringify({ type: "Flushed" }));
            }
            currentStreamId = null;
            streamEnded = false;
          }
        });

        return ws;
      } catch (err) {
        console.error("[ensureUpstream error]", err);
        throw err;
      } finally {
        upstreamConnecting = null;
      }
    })();
    return upstreamConnecting;
  }

  // Pre-warm upstream connection in the background
  void ensureUpstream().catch(() => {});

  // Upstream keepalive every 5s to prevent 10s idle close from Soniox
  const keepAliveInterval = setInterval(() => {
    if (upstreamWs && upstreamWs.readyState === 1 && !currentStreamId) {
      try {
        upstreamWs.send(JSON.stringify({ keep_alive: true }));
      } catch {}
    }
  }, 5000);

  serverWs.addEventListener("message", (evt: any) => {
    try {
      const parsed = JSON.parse(evt.data as string);
      if (parsed.type === "Clear") {
        streamEpoch++;
        if (currentStreamId && upstreamWs && upstreamWs.readyState === 1) {
          try {
            upstreamWs.send(JSON.stringify({ stream_id: currentStreamId, cancel: true }));
          } catch {}
        }
        currentStreamId = null;
        streamEnded = false;
        flushSent = false;
        return;
      }
      if (parsed.type === "KeepAlive") {
        if (upstreamWs && upstreamWs.readyState === 1) {
          try {
            upstreamWs.send(JSON.stringify({ keep_alive: true }));
          } catch {}
        }
        return;
      }
    } catch {}

    const myEpoch = streamEpoch;
    clientMessageQueue = clientMessageQueue.then(async () => {
      if (myEpoch !== streamEpoch || serverWs.readyState !== 1) return;
      try {
        const req = JSON.parse(evt.data as string);
        if (req.type === "Speak" && typeof req.text === "string") {
          const clean = req.text.trim();
          if (!clean) return;

          const up = await ensureUpstream();
          if (myEpoch !== streamEpoch || serverWs.readyState !== 1) return;

          if (!currentStreamId || streamEnded) {
            currentStreamId = `lva-${crypto.randomUUID()}`;
            streamEnded = false;
            flushSent = false;
            up.send(
              JSON.stringify({
                api_key: apiKey,
                stream_id: currentStreamId,
                model,
                language,
                voice,
                audio_format: "pcm_s16le",
                sample_rate: 24000,
              })
            );
          }

          up.send(
            JSON.stringify({
              stream_id: currentStreamId,
              text: clean,
              text_end: false,
            })
          );
        } else if (req.type === "Flush") {
          if (currentStreamId && !streamEnded) {
            streamEnded = true;
            const up = await ensureUpstream();
            if (myEpoch !== streamEpoch || serverWs.readyState !== 1) return;
            up.send(
              JSON.stringify({
                stream_id: currentStreamId,
                text: "",
                text_end: true,
              })
            );
          } else {
            if (serverWs.readyState === 1 && !flushSent) {
              flushSent = true;
              serverWs.send(JSON.stringify({ type: "Flushed" }));
            }
          }
        }
      } catch (err) {
        console.error("[TTS clientMessageQueue error]", err);
        if (serverWs.readyState === 1 && !flushSent) {
          flushSent = true;
          serverWs.send(JSON.stringify({ type: "Flushed" }));
        }
        currentStreamId = null;
        streamEnded = false;
      }
    });
  });

  serverWs.addEventListener("close", () => {
    clearInterval(keepAliveInterval);
    if (upstreamWs && upstreamWs.readyState === 1) {
      try { upstreamWs.close(); } catch {}
    }
    upstreamWs = null;
  });

  return new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: clientWs,
  });
}

async function handleLlmRequest(request: Request, env: any): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const messages = body.messages || [];
  const groqApiKey = env.GROQ_API_KEY || "";
  const model = env.LLM_MODEL || "openai/gpt-oss-120b";

  // Extract caller's latest query to dynamically match universal legal inquiries
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  let lastUserText = "";
  if (lastUserMsg) {
    if (typeof lastUserMsg.content === "string") {
      lastUserText = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.content)) {
      lastUserText = lastUserMsg.content
        .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
        .join(" ");
    }
  }

  const matched = lastUserText ? searchUniversalInquiries(lastUserText, 2) : [];
  const matchedStatute = lastUserText ? lookupStatute(lastUserText) : null;
  let statuteContext = "";
  if (matchedStatute) {
    statuteContext = `
[প্রযোজ্য আইন ও ধারা]:
আইন: ${matchedStatute.actTitleBn} (${matchedStatute.actTitle})
ধারা: ${matchedStatute.sections.slice(0, 2).join("; ")}
সংক্ষিপ্ত প্রতিকার: ${matchedStatute.remedySummaryBn}
`;
  }

  let runtimeInquiryBlock = "";
  if (matched.length > 0) {
    runtimeInquiryBlock = `
[তাৎক্ষণিক প্রাসঙ্গিক সরকারি তথ্য]:
${matched
  .map(
    (item, idx) =>
      `${idx + 1}. বিষয়: ${item.categoryBn}\n   প্রশ্ন: ${item.questionBn}\n   সরকারি তথ্য: ${item.answerBn}`,
  )
  .join("\n")}
`;
  }


  const systemPrompt = `আপনি "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইন (১৬৬৯৯)"-এর অত্যন্ত আন্তরিক, সহানুভূতিশীল ও অভিজ্ঞ ভার্চুয়াল আইনি পরামর্শক।
কলার একজন সাধারণ নাগরিক যিনি ফোনে আপনার সাথে সরাসরি কথা বলছেন।

আপনার মূল আচরণবিধি (Voice Guidelines):
১. মানুষের সাথে কথা বলার মতো অত্যন্ত সহজ, আন্তরিক, মিষ্টি ও কথ্য বাংলায় (Spoken Bengali) কথা বলুন।
২. কলারের প্রশ্নের সরাসরি ১ থেকে ৩ বাক্যে সহায়ক ও সংক্ষিপ্ত উত্তর দিন।
৩. প্রাসঙ্গিক হলে সর্বোচ্চ একটি আইনের নাম এবং একটি ধারা উল্লেখ করুন; পুরো আইন, সব ধারা বা দীর্ঘ তালিকা পড়বেন না। তথ্য নিশ্চিত না হলে স্পষ্টভাবে বলুন যে DLAO/আইনজীবীর যাচাই প্রয়োজন।
৪. কোনো বুলেট পয়েন্ট, তারকা (*), হ্যাশ (#) বা জটিল তালিকা ব্যবহার করবেন না। টেক্সটটি সরাসরি স্পিচ সিনথেসাইজার (TTS) দিয়ে পাঠ করা হবে।
৫. কলারকে আশ্বস্ত করুন এবং স্পষ্ট ও সঠিক তথ্য দিন।


${getUniversalGeneralKnowledgeBlock()}
${statuteContext}
${runtimeInquiryBlock}
`;

  // Filter client-side system prompts, use our authoritative systemPrompt
  const userAndAssistantMsgs = messages.filter((m: any) => m.role !== "system");
  const conversation = [{ role: "system", content: systemPrompt }, ...userAndAssistantMsgs];

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Background stream processor - Direct high-speed streaming for sub-300ms TTFT
  (async () => {
    try {
      const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: conversation,
          temperature: 0.3,
          max_tokens: 250,
          stream: true,
        }),
      });

      if (!groqResp.ok || !groqResp.body) {
        throw new Error(`Groq HTTP ${groqResp.status}: ${await groqResp.text().catch(() => "")}`);
      }

      const reader = groqResp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const j = JSON.parse(dataStr);
            const token = j.choices?.[0]?.delta?.content || "";
            if (token) {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: token } }],
                  })}\n\n`,
                ),
              );
            }
          } catch {}
        }
      }

      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      console.error("[worker-entry] LLM execution error:", err);
      // Fallback spoken response in Bengali
      const fallback =
        "জি, ১৬৬৯৯ হেল্পলাইনের মাধ্যমে আপনি সম্পূর্ণ বিনামূল্যে সরকারি আইনি সহায়তা ও পরামর্শ পেতে পারেন। আপনার নির্দিষ্ট সমস্যাটি আমাকে বলুন।";
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: fallback } }],
          })}\n\n`,
        ),
      );
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

const AUTH_COOKIE_NAME = "auth_session";
const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function readAuthCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  return value ? value.slice(AUTH_COOKIE_NAME.length + 1) : null;
}

function authCookie(token: string, expiresAt: Date): string {
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${AUTH_SESSION_TTL_SECONDS}; Expires=${expiresAt.toUTCString()}`;
}

async function hashAuthToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getAuthenticatedUser(request: Request, db: any): Promise<any | null> {
  const token = readAuthCookie(request);
  if (!token || !db) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.role, u.display_name, u.status, u.verification_status, u.is_mock
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(await hashAuthToken(token))
    .first();
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    verificationStatus: row.verification_status,
    isMock: Boolean(row.is_mock),
  };
}

async function handleAuthSessionRequest(request: Request, env: any): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  return jsonResponse({ ok: true, user: await getAuthenticatedUser(request, env.DB) });
}

async function handleRoleCompleteRequest(request: Request, env: any): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: "Database unavailable" }, 503);

  try {
    const body = (await request.json()) as Record<string, any>;
    const voiceSessionId = String(body.voiceSessionId || "").trim();
    const docketId = String(body.docketId || "").trim();
    const displayName = String(body.displayName || "").trim();
    if (!voiceSessionId || !docketId || !displayName) {
      return jsonResponse({ ok: false, error: "voiceSessionId, docketId, and displayName are required" }, 400);
    }

    const existing = await db
      .prepare(
        `SELECT c.citizen_user_id, u.role, u.display_name, u.status, u.verification_status, u.is_mock
         FROM cases c JOIN users u ON u.id = c.citizen_user_id
         WHERE c.voice_session_id = ? OR c.docket_id = ?
         LIMIT 1`,
      )
      .bind(voiceSessionId, docketId)
      .first();

    const userId = existing?.citizen_user_id || `CIT-${crypto.randomUUID()}`;
    const token = `sess-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000);
    const tokenHash = await hashAuthToken(token);

    if (!existing) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO users (id, role, display_name, phone, status, verification_status, is_mock)
             VALUES (?, 'citizen', ?, ?, 'active', ?, 0)`,
          )
          .bind(userId, displayName, body.phone ? String(body.phone) : null, body.phone ? "pending" : "unverified"),
        db
          .prepare(
            `INSERT INTO cases
             (id, docket_id, citizen_user_id, voice_session_id, problem, has_disability, gender, district, thana, category, status, is_demo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0)`,
          )
          .bind(
            `CASE-${crypto.randomUUID()}`,
            docketId,
            userId,
            voiceSessionId,
            String(body.problem || ""),
            body.hasDisability === true || body.hasDisability === 1 ? 1 : body.hasDisability === false || body.hasDisability === 0 ? 0 : null,
            body.gender ? String(body.gender) : null,
            body.district ? String(body.district) : null,
            body.thana ? String(body.thana) : null,
            body.category ? String(body.category) : null,
          ),
        db
          .prepare(
            `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
             VALUES (?, ?, ?)`,
          )
          .bind(tokenHash, userId, expiresAt.toISOString()),
      ]);
    } else {
      await db
        .prepare(
          `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
           VALUES (?, ?, ?)`,
        )
        .bind(tokenHash, userId, expiresAt.toISOString())
        .run();
    }

    const user = await db
      .prepare(
        `SELECT id, role, display_name, status, verification_status, is_mock
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(userId)
      .first();

    return jsonResponse(
      {
        ok: true,
        docketId,
        user: {
          id: user.id,
          displayName: user.display_name,
          role: user.role,
          status: user.status,
          verificationStatus: user.verification_status,
          isMock: Boolean(user.is_mock),
        },
      },
      200,
      { "Set-Cookie": authCookie(token, expiresAt) },
    );
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

async function handleCitizensRequest(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ ok: false, error: "Cloudflare D1 database binding 'DB' not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (request.method === "GET") {
    try {
      const id = url.searchParams.get("id");
      const phone = url.searchParams.get("phone");
      const nid = url.searchParams.get("nid");

      if (id) {
        const stmt = db.prepare("SELECT * FROM citizens WHERE Citizen_ID = ? LIMIT 1").bind(id);
        const citizen = await stmt.first();
        return new Response(JSON.stringify({ ok: true, citizen }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (phone) {
        const stmt = db.prepare("SELECT * FROM citizens WHERE Phone = ? ORDER BY created_at DESC LIMIT 10").bind(phone);
        const { results } = await stmt.all();
        return new Response(JSON.stringify({ ok: true, citizens: results }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (nid) {
        const stmt = db.prepare("SELECT * FROM citizens WHERE NID = ? LIMIT 1").bind(nid);
        const citizen = await stmt.first();
        return new Response(JSON.stringify({ ok: true, citizen }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      const { results } = await db.prepare("SELECT * FROM citizens ORDER BY created_at DESC LIMIT 50").all();
      return new Response(JSON.stringify({ ok: true, citizens: results }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message || String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (request.method === "POST") {
    try {
      const body: any = await request.json();
      const citizenId = body.Citizen_ID || `CIT-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const name = body.Name || "";
      const nid = body.NID || "";
      const address = body.Address || "";
      const phone = body.Phone || "";
      const approxIncome = typeof body.approx_income === "number" ? body.approx_income : parseFloat(body.approx_income || "0");

      if (!name || !phone) {
        return new Response(JSON.stringify({ ok: false, error: "Name and Phone are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const query = `
        INSERT INTO citizens (Citizen_ID, Name, NID, Address, Phone, approx_income, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(Citizen_ID) DO UPDATE SET
          Name=excluded.Name,
          NID=excluded.NID,
          Address=excluded.Address,
          Phone=excluded.Phone,
          approx_income=excluded.approx_income,
          updated_at=CURRENT_TIMESTAMP
      `;

      await db.prepare(query).bind(citizenId, name, nid, address, phone, approxIncome).run();

      const saved = await db.prepare("SELECT * FROM citizens WHERE Citizen_ID = ?").bind(citizenId).first();

      return new Response(JSON.stringify({ ok: true, citizen: saved }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message || String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/tts") {
      return handleTtsWebSocket(request, env);
    }
    if (url.pathname === "/v1/stt") {
      return handleSttWebSocket(request, env);
    }
    if (url.pathname === "/api/llm" && request.method === "POST") {
      return handleLlmRequest(request, env);
    }
    if (url.pathname === "/api/auth/session") {
      return handleAuthSessionRequest(request, env);
    }
    if (url.pathname === "/api/roles/complete") {
      return handleRoleCompleteRequest(request, env);
    }
    if (url.pathname === "/api/citizens") {
      return handleCitizensRequest(request, env);
    }
    return nextWorker.fetch(request, env, ctx);
  },
};
