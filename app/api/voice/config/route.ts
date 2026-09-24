import { NextResponse } from "next/server";
import { getTtsProxyInfo } from "@/server/tts-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runtime voice configuration for the browser SDK.
 *
 * Delivers the non-secret defaults plus the Deepgram STT key at runtime so it is
 * never inlined into the JS bundle. Deepgram ephemeral tokens (v1/auth/grant)
 * are unavailable for this account (403 Insufficient permissions), which is why
 * the raw STT key must reach the browser and the key stays reloadable here.
 *
 * The TTS proxy URL is derived from the *actually listening* socket (the proxy
 * falls back to an ephemeral port when the preferred port is busy), so the
 * browser never targets a stale port after a restart.
 */
export async function GET(req: Request) {
  const sttApiKey = process.env.DEEPGRAM_API_KEY ?? "";
  const proxy = getTtsProxyInfo();
  const provider = (process.env.TTS_PROVIDER ?? "soniox") === "deepgram" ? "deepgram" : "soniox";

  const reqHost = req.headers.get("host") || "";
  const isCloudflare =
    reqHost.includes(".workers.dev") ||
    reqHost.includes(".pages.dev") ||
    (Boolean(reqHost) && !reqHost.includes("localhost") && !reqHost.includes("127.0.0.1"));

  const ttsProxyUrl = isCloudflare
    ? `wss://${reqHost}/v1/tts`
    : proxy.ready
      ? process.env.TTS_PROXY_URL ?? `ws://${process.env.TTS_PROXY_HOST ?? "127.0.0.1"}:${proxy.port}/v1/tts`
      : "";

  const ttsProxyLive = isCloudflare ? true : proxy.ready;

  return NextResponse.json({
    sttProvider: "deepgram",
    sttModel: process.env.STT_MODEL ?? "nova-3-general",
    sttApiKey,
    llmModel: process.env.LLM_MODEL ?? "qwen/qwen3.8-27b",
    llmProxyUrl: process.env.LLM_PROXY_URL ?? "/api/llm",
    ttsProvider: provider,
    ttsVoiceId: process.env.TTS_VOICE_ID ?? (provider === "soniox" ? "Priya" : "aura-2-thalia-en"),
    ttsLanguage: process.env.TTS_LANGUAGE ?? (provider === "soniox" ? "bn" : "en"),
    ttsProxyUrl,
    ttsProxyLive,
    ttsProxyError: proxy.error ?? null,
    language: process.env.STT_LANGUAGE ?? "bn",
  });
}