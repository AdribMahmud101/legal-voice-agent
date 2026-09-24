/**
 * Legal Voice Agent — Web SDK Client Orchestrator (Cloud Models)
 *
 * Resolves runtime configuration (model ids, voice, Deepgram STT key) from the
 * local /api/voice/config endpoint, merges caller overrides, validates that the
 * server-side prerequisites exist, and drives a DirectSession voice pipeline.
 */

import { DirectSession } from "./direct/direct_session";
import { EventEmitter, SdkConfig, VoiceSession } from "./types";

export interface VoiceRuntimeConfig {
  sttProvider: string;
  sttModel: string;
  sttApiKey: string;
  llmModel: string;
  llmProxyUrl: string;
  ttsProvider: string;
  ttsVoiceId: string;
  ttsLanguage: string;
  ttsProxyUrl: string;
  ttsProxyLive: boolean;
  ttsProxyError: string | null;
  language: string;
}

const DEFAULT_CONFIG_URL = "/api/voice/config";

export class VoiceAgent implements VoiceSession {
  private emit: EventEmitter;
  private session: DirectSession | null = null;

  constructor(emit: EventEmitter) {
    this.emit = emit;
  }

  async start(config: SdkConfig): Promise<void> {
    this.stop();

    this.emit({ type: "system", text: "Loading voice runtime config..." });

    const runtime = await this.fetchRuntimeConfig();

    // Merge: explicit caller overrides win over the fetched defaults.
    const merged: SdkConfig = {
      ...config,
      sttProvider: "deepgram",
      sttModel: config.sttModel ?? runtime.sttModel,
      deepgramApiKey: config.deepgramApiKey ?? runtime.sttApiKey,
      llmModel: config.llmModel ?? runtime.llmModel,
      llmProxyUrl: config.llmProxyUrl ?? runtime.llmProxyUrl,
      voiceId: config.voiceId ?? runtime.ttsVoiceId,
      ttsProxyUrl: config.ttsProxyUrl ?? runtime.ttsProxyUrl,
      language: config.language ?? runtime.language,
      halfDuplex: config.halfDuplex ?? true,
    };

    if (!merged.deepgramApiKey) {
      this.emit({
        type: "error",
        message: "Deepgram STT key missing. Configure DEEPGRAM_API_KEY in the server.",
      });
      return;
    }

    if (!merged.ttsProxyUrl) {
      if (runtime.ttsProxyError) {
        this.emit({
          type: "error",
          message: `TTS proxy unavailable: ${runtime.ttsProxyError}. Restart?`,
        });
      } else {
        this.emit({
          type: "error",
          message: "TTS proxy is not running. Restart the server and try again.",
        });
      }
      return;
    }

    const session = new DirectSession(this.emit);
    this.session = session;
    await session.start(merged);
  }

  stop(): void {
    if (this.session) {
      this.session.stop();
      this.session = null;
    }
  }

  async sendUserMessage(text: string): Promise<void> {
    if (this.session) {
      await this.session.sendUserMessage(text);
    }
  }

  get sessionId(): string | null {
    return this.session?.sessionId ?? null;
  }

  private async fetchRuntimeConfig(): Promise<VoiceRuntimeConfig> {
    const res = await fetch(DEFAULT_CONFIG_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Voice config request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as VoiceRuntimeConfig;
  }
}