/**
 * Legal Voice Agent — Web SDK (Cloud Models)
 *
 * Shared type definitions for the ported Feros/Vocom DirectSession cloud-only
 * voice pipeline. Keeps the same shapes as the upstream `voice-sdk-bundle`
 * so the pipeline modules remain recognizable.
 *
 * Secrets are kept server-side: the LLM goes through a Next.js SSE proxy and
 * STT/TTS through same-origin WebSocket proxies.
 */

import type { SessionUser } from "../auth/roles";

export type SessionMode = "direct";

export interface SdkConfig {
  mode?: SessionMode;
  /** Override the STT provider. Only "soniox" is supported in this port. */
  sttProvider?: "soniox";
  /** Optional override of the Soniox model id. */
  sttModel?: string;
  /** Optional override of the STT listen language code (default: bn). */
  language?: string;
  /** OpenAI-compatible chat completions base URL. Cloud-only port always
   *  routes through the local SSE proxy; this is retained for testing. */
  llmBaseUrl?: string;
  /** Next.js route that proxies to the LLM provider (default: /api/llm). */
  llmProxyUrl?: string;
  /** Optional override of the LLM model id (default: openai/gpt-oss-120b). */
  llmModel?: string;
  /** Local WebSocket TTS proxy URL (default: ws://<host>:8200/v1/tts). */
  ttsProxyUrl?: string;
  /** Optional override of the TTS voice (default: Daniel, Soniox built-in). */
  voiceId?: string;
  /** Min words a barge-in transcript needs before it's committed (default: 2).
   *  Single-word echoes/noises are rejected to prevent self barge-in. */
  minBargeInWords?: number;
  /** Half-duplex mode: mutes mic to STT/VAD while assistant speaks to prevent barge-in and echo feedback while keeping hardware AEC alive (default: true). */
  halfDuplex?: boolean;
  /** System prompt the agent should follow. */
  systemPrompt?: string;
  /** Immediately spoken on session start once the pipeline is live. */
  greeting?: string;
  /** Secondary message / IVR menu spoken immediately after greeting. */
  secondaryPrompt?: string;
}

export type SdkEvent =
  | { type: "state_changed"; state: string }
  | { type: "mic_mute_changed"; muted: boolean }
  | { type: "transcript"; role: string; text: string }
  | { type: "transcript_chunk"; role: string; text: string }
  | { type: "tool_activity"; tool_name?: string; message?: string }
  | {
      type: "latency_metrics";
      stt_ms: number;
      llm_ttft_ms: number;
      sentence1_gen_ms: number;
      tts_synthesis_ms: number;
      tts_first_audio_ms: number;
      total_voice_latency_ms: number;
      route?: string;
      reason?: string;
    }
  | {
      type: "intake_step_changed";
      step: "idle" | "problem" | "disability" | "gender" | "name" | "address" | "complete";
      data: {
        problem?: string;
        hasDisability?: boolean | null;
        gender?: string | null;
        callerName?: string | null;
        address?: string | null;
      };
    }
  | { type: "intake_complete"; docketId: string; user: SessionUser }
  | { type: "error"; message: string }
  | { type: "system"; text: string };

export type EventEmitter = (evt: SdkEvent) => void;

export interface VoiceSession {
  start(config: SdkConfig): Promise<void>;
  stop(): void;
}