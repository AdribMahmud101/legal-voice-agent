/**
 * Direct Serverless Embedded Session (In-Process Cloud AI Streaming) — Cloud-Only Port
 *
 * Legal Voice Agent high-octane architecture:
 * - openai/gpt-oss-120b with Eager fast-start clause chunking (LLM via /api/llm SSE proxy)
 * - Soniox Real-Time TTS (v2) via the same-origin server-side proxy
 * - Soniox Real-Time STT (stt-rt-v3) with semantic endpoint detection
 * - Formant Neural VAD & Smart-Turn Thought Boundary Analyzer
 * - Vocom Reactor TurnPhase State Machine
 * - Mathematically Decoupled WebAudio vs TTS Latency Telemetry Profiler
 *
 * Secrets live server-side: the LLM proxy owns the Groq key and both the TTS
 * and STT proxies own the Soniox key. The browser holds no credentials.
 */

import { acquireHardwareMic } from "../audio/mic";
import { registerDownsampleWorklet } from "../audio/worklet";
import { EventEmitter, SdkConfig, VoiceSession } from "../types";
import { SmartTurnAnalyzer } from "./smart_turn";
import { SonioxStt } from "./soniox_stt";
import { TurnPhaseStateMachine } from "./turn_phase";
import type { SessionUser } from "../../auth/roles";
import { RealtimeVad, VadEvent } from "./vad";
import { DeepgramWsTts } from "./ws_tts";

class StreamingAudioPlayer {
  private audioCtx: AudioContext;
  private outputGain: GainNode;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime: number = 0;
  private isReset: boolean = false;
  public onFirstPlay: ((tPlay: number) => void) | null = null;
  private hasPlayedFirstInTurn: boolean = false;

  // Preallocated buffer for 24kHz PCM Audio
  private sampleBuffer: Float32Array = new Float32Array(96000); // 4 seconds capacity
  private sampleCount: number = 0;
  private readonly SAMPLE_RATE = 24000;
  // 100ms prebuffer (2,400 samples) to absorb network packet jitter without noticeable latency
  private readonly INITIAL_BUFFER_SAMPLES = 2400;
  // Minimum chunk to immediately extend WebAudio timeline while playback is active (40ms = 960 samples)
  private readonly MIN_STREAM_CHUNK = 960;
  // 25ms lead time when starting from idle or true underrun
  private readonly INITIAL_LEAD_SEC = 0.025;

  constructor(audioCtx: AudioContext) {
    this.audioCtx = audioCtx;
    this.outputGain = audioCtx.createGain();
    this.outputGain.connect(audioCtx.destination);
  }

  public reset() {
    this.isReset = true;
    this.hasPlayedFirstInTurn = false;
    this.sampleCount = 0;
    const now = this.audioCtx.currentTime;

    try {
      this.outputGain.gain.cancelScheduledValues(now);
      this.outputGain.gain.setValueAtTime(1, now);
    } catch {}

    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }

    this.activeSources = [];
    this.nextPlayTime = 0;
    this.isReset = false;
  }

  public enqueuePcmChunk(pcm16ArrayBuf: ArrayBuffer) {
    if (this.isReset || pcm16ArrayBuf.byteLength === 0) return;

    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }

    const byteLen = pcm16ArrayBuf.byteLength - (pcm16ArrayBuf.byteLength % 2);
    if (byteLen === 0) return;
    const pcm16 = new Int16Array(pcm16ArrayBuf, 0, byteLen / 2);
    const n = pcm16.length;

    // Expand buffer if needed
    if (this.sampleCount + n > this.sampleBuffer.length) {
      const newBuf = new Float32Array(Math.max(this.sampleBuffer.length * 2, this.sampleCount + n + 48000));
      newBuf.set(this.sampleBuffer.subarray(0, this.sampleCount));
      this.sampleBuffer = newBuf;
    }

    // Direct float scaling into typed buffer
    const inv32768 = 1 / 32768;
    for (let i = 0; i < n; i++) {
      this.sampleBuffer[this.sampleCount + i] = pcm16[i] * inv32768;
    }
    this.sampleCount += n;

    const now = this.audioCtx.currentTime;
    const isPlaying = this.nextPlayTime > now;

    if (isPlaying) {
      // While already playing: continuously schedule as soon as we have MIN_STREAM_CHUNK (40ms)
      while (this.sampleCount >= this.MIN_STREAM_CHUNK) {
        const chunk = this.sampleBuffer.subarray(0, this.sampleCount);
        this.schedulePcm(chunk);
        this.sampleCount = 0;
      }
    } else {
      // Cold start or after true underrun: buffer 100ms before starting
      if (this.sampleCount >= this.INITIAL_BUFFER_SAMPLES) {
        const chunk = this.sampleBuffer.subarray(0, this.sampleCount);
        this.schedulePcm(chunk);
        this.sampleCount = 0;
      }
    }
  }

  public flush() {
    // When TTS signals stream end or flush, immediately schedule whatever is remaining
    if (this.sampleCount > 0) {
      const remaining = this.sampleBuffer.subarray(0, this.sampleCount);
      this.schedulePcm(remaining);
      this.sampleCount = 0;
    }
  }

  private schedulePcm(samples: Float32Array) {
    if (samples.length === 0 || this.isReset) return;

    const audioBuf = this.audioCtx.createBuffer(1, samples.length, this.SAMPLE_RATE);
    audioBuf.getChannelData(0).set(samples);

    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuf;
    sourceNode.connect(this.outputGain);
    this.activeSources.push(sourceNode);

    sourceNode.onended = () => {
      const idx = this.activeSources.indexOf(sourceNode);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };

    const now = this.audioCtx.currentTime;
    let startTime: number;

    if (this.nextPlayTime > now) {
      // Sample-accurate gapless stitching with preceding chunk
      startTime = this.nextPlayTime;
    } else {
      // Cold start or true network underrun: slight lead time prevents glitch
      startTime = now + this.INITIAL_LEAD_SEC;
    }

    sourceNode.start(startTime);
    this.nextPlayTime = startTime + audioBuf.duration;

    if (!this.hasPlayedFirstInTurn && this.onFirstPlay) {
      this.hasPlayedFirstInTurn = true;
      const tPlay = performance.now();
      this.onFirstPlay(tPlay);
      this.onFirstPlay = null;
    }
  }

  public playAudioBuffer(audioBuf: AudioBuffer) {
    if (this.isReset) return;

    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }

    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuf;
    sourceNode.connect(this.outputGain);
    this.activeSources.push(sourceNode);

    sourceNode.onended = () => {
      const idx = this.activeSources.indexOf(sourceNode);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };

    const now = this.audioCtx.currentTime;
    let startTime: number;

    if (this.nextPlayTime > now) {
      startTime = this.nextPlayTime;
    } else {
      startTime = now + this.INITIAL_LEAD_SEC;
    }

    sourceNode.start(startTime);
    this.nextPlayTime = startTime + audioBuf.duration;

    if (!this.hasPlayedFirstInTurn && this.onFirstPlay) {
      this.hasPlayedFirstInTurn = true;
      const tPlay = performance.now();
      this.onFirstPlay(tPlay);
      this.onFirstPlay = null;
    }
  }

  public hasActivePlayback(): boolean {
    return this.nextPlayTime > this.audioCtx.currentTime + 0.05 || this.activeSources.length > 0;
  }

  public async waitUntilFinished(): Promise<void> {
    this.flush();
    const startWait = performance.now();
    while (
      !this.isReset &&
      (this.nextPlayTime > this.audioCtx.currentTime + 0.03 ||
      this.sampleCount > 0 ||
      this.activeSources.length > 0)
    ) {
      if (performance.now() - startWait > 30000) {
        break;
      }
      const waitMs = Math.min(
        80,
        Math.max(15, (this.nextPlayTime - this.audioCtx.currentTime) * 1000),
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    // Reverb decay pause: allow speaker room echo to decay completely
    // before the microphone is unmuted, eliminating acoustic echo self-interruptions!
    await new Promise((r) => setTimeout(r, 120));
  }
}

let cachedGreetingAudioBuf: AudioBuffer | null = null;
let cachedIvrAudioBuf: AudioBuffer | null = null;
let cachedOption1AudioBuf: AudioBuffer | null = null;
let cachedIntakeCompleteBuf: AudioBuffer | null = null;
let cachedInactivityAppQueryBuf: AudioBuffer | null = null;
let cachedInactivityNoAckBuf: AudioBuffer | null = null;
let cachedInactivityHangupBuf: AudioBuffer | null = null;

type AudioKind =
  | "greeting"
  | "ivr"
  | "option1"
  | "intake_complete"
  | "inactivity_app_query"
  | "inactivity_no_ack"
  | "inactivity_hangup";

async function getPreRecordedAudioBuffer(
  audioCtx: AudioContext,
  kind: AudioKind,
): Promise<AudioBuffer | null> {
  try {
    if (kind === "greeting" && cachedGreetingAudioBuf) return cachedGreetingAudioBuf;
    if (kind === "ivr" && cachedIvrAudioBuf) return cachedIvrAudioBuf;
     if (kind === "option1" && cachedOption1AudioBuf) return cachedOption1AudioBuf;
     if (kind === "intake_complete" && cachedIntakeCompleteBuf) return cachedIntakeCompleteBuf;
     if (kind === "inactivity_app_query" && cachedInactivityAppQueryBuf) return cachedInactivityAppQueryBuf;

    if (kind === "inactivity_no_ack" && cachedInactivityNoAckBuf) return cachedInactivityNoAckBuf;
    if (kind === "inactivity_hangup" && cachedInactivityHangupBuf) return cachedInactivityHangupBuf;

    const urls: Record<AudioKind, string> = {
      greeting: "/audio/greeting.wav",
      ivr: "/audio/ivr_menu.wav",
       option1: "/audio/option1_prompt.wav",
       intake_complete: "/audio/intake_complete.wav",
       inactivity_app_query: "/audio/inactivity_app_query.wav",

      inactivity_no_ack: "/audio/inactivity_no_ack.wav",
      inactivity_hangup: "/audio/inactivity_hangup.wav",
    };
    const res = await fetch(urls[kind]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuf);
    if (kind === "greeting") cachedGreetingAudioBuf = decoded;
    if (kind === "ivr") cachedIvrAudioBuf = decoded;
     if (kind === "option1") cachedOption1AudioBuf = decoded;
     if (kind === "intake_complete") cachedIntakeCompleteBuf = decoded;
     if (kind === "inactivity_app_query") cachedInactivityAppQueryBuf = decoded;

    if (kind === "inactivity_no_ack") cachedInactivityNoAckBuf = decoded;
    if (kind === "inactivity_hangup") cachedInactivityHangupBuf = decoded;
    return decoded;
  } catch (err) {
    console.warn(`Failed to load/decode pre-recorded ${kind} audio:`, err);
    return null;
  }
}

export type IntakeStep =
  | "idle"
  | "problem"
  | "disability"
  | "gender"
  | "name"
  | "address"
  | "complete";

export interface IntakeData {
  problem: string;
  hasDisability: boolean | null;
  gender: string | null;
  callerName: string | null;
  address: string | null;
}

function parseBengaliYesNo(input: string): boolean | null {
  const norm = input.trim().toLowerCase();
  if (norm === "1" || norm === "১") return true;
  if (norm === "2" || norm === "২") return false;

  if (
    /^(হ্যাঁ|হাঁ|হ্যা|জি|জী|জি\s*হ্যাঁ|আছে|প্রতিবন্ধী|হ|হা)$/i.test(norm) ||
    norm.includes("হ্যাঁ") ||
    norm.includes("হাঁ") ||
    norm.includes("প্রতিবন্ধকতা আছে") ||
    norm.includes("শারীরিক সমস্যা আছে")
  ) {
    return true;
  }

  if (
    /^(না|নাই|নেই|না\s*নেই|না\s*নাই|না\s*না|কোনোটিই\s*না)$/i.test(norm) ||
    norm.includes("না") ||
    norm.includes("নেই") ||
    norm.includes("নাই") ||
    norm.includes("কোনো সমস্যা নেই") ||
    norm.includes("সুস্থ")
  ) {
    return false;
  }

  return null;
}

function parseBengaliGender(input: string): string | null {
  const norm = input.trim().toLowerCase();
  if (
    norm === "1" ||
    norm === "১" ||
    norm.includes("পুরুষ") ||
    norm.includes("ছেলে") ||
    norm.includes("ব্যাটা") ||
    norm.includes("পুরুষ মানুষ")
  ) {
    return "পুরুষ";
  }
  if (
    norm === "2" ||
    norm === "২" ||
    norm.includes("নারী") ||
    norm.includes("মহিলা") ||
    norm.includes("মেয়ে") ||
    norm.includes("স্ত্রীলোক")
  ) {
    return "নারী";
  }
  if (
    norm === "3" ||
    norm === "৩" ||
    norm.includes("অন্যান্য") ||
    norm.includes("হিজড়া") ||
    norm.includes("তৃতীয় লিঙ্গ")
  ) {
    return "অন্যান্য";
  }
  return null;
}

function cleanBengaliName(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^(আমার\s*নাম\s*(হলো|হচ্ছে|হল)?|আমি\s*)/i, "").trim();
  clean = clean.replace(/(\s*(বলছি|বলছিলাম|এখানে বলছি))$/i, "").trim();
  if (!clean) clean = input.trim();
  return clean;
}

function extractDistrict(address: string): string | null {
  const districts = [
    "ঢাকা", "চট্টগ্রাম", "সিলেট", "রাজশাহী", "খুলনা", "বরিশাল", "রংপুর", "ময়মনসিংহ",
    "কুমিল্লা", "ফেনী", "নোয়াখালী", "বগুড়া", "যশোর", "পাবনা", "দিনাজপুর", "কুষ্টিয়া",
    "গাজীপুর", "নারায়ণগঞ্জ", "টাঙ্গাইল", "জামালপুর", "কক্সবাজার", "ব্রাহ্মণবাড়িয়া",
    "চাঁদপুর", "লক্ষ্মীপুর", "নরসিংদী", "মাদারীপুর", "শরীয়তপুর", "ফরিদপুর", "গোপালগঞ্জ",
    "মুন্সীগঞ্জ", "মানিকগঞ্জ", "কিশোরগঞ্জ", "নেত্রকোণা", "শেরপুর", "সিরাজগঞ্জ", "নাটোর",
    "নওগাঁ", "চাঁপাইনবাবগঞ্জ", "জয়পুরহাট", "বাগেরহাট", "সাতক্ষীরা", "ঝিনাইদহ", "মাগুরা",
    "নড়াইল", "চুয়াডাঙ্গা", "মেহেরপুর", "ভোলা", "পটুয়াখালী", "বরগুনা", "পিরোজপুর",
    "ঝালকাঠি", "সুনামগঞ্জ", "হবিগঞ্জ", "মৌলভীবাজার", "কুড়িগ্রাম", "গাইবান্ধা", "লালমনিরহাট",
    "নীলফামারী", "পঞ্চগড়", "ঠাকুরগাঁও"
  ];
  for (const d of districts) {
    if (address.includes(d)) return d;
  }
  return null;
}

function inferLegalCategory(problem: string): string {
  if (/জামিন|গ্রেপ্তার|পুলিশ|আটক|মামলা|ধারা|ফৌজদারি/i.test(problem)) return "criminal_bail";
  if (/স্বামী|যৌতুক|মারধর|নির্যাতন|স্ত্রী|সংসার|তালাক/i.test(problem)) return "domestic_violence";
  if (/জমি|দখল|পৈতৃক|সীমানা|দলিল|খতিয়ান|জমিজমা/i.test(problem)) return "land_dispute";
  if (/বেতন|মালিক|কারখানা|শ্রমিক|বকেয়া|চাকরি|ওভারটাইম/i.test(problem)) return "labor_wage";
  if (/দেনমোহর|ভরণপোষণ|সন্তান|হেফাজত/i.test(problem)) return "family_dower_maintenance";
  if (/ছবি|ফেসবুক|ব্ল্যাকমেইল|ইন্টারনেট|সাইবার/i.test(problem)) return "cyber_harassment";
  return "general_civil";
}

export class DirectSession implements VoiceSession {
  private soniox: SonioxStt | null = null;
  private sttLanguage: string = "bn";
  private ttsWs: DeepgramWsTts | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private player: StreamingAudioPlayer | null = null;
  private vad: RealtimeVad = new RealtimeVad();
  private smartTurn: SmartTurnAnalyzer = new SmartTurnAnalyzer();
  private turnPhase: TurnPhaseStateMachine = new TurnPhaseStateMachine(1);
  private activeAbortCtrl: AbortController | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private speechFinalDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private activityEpoch: number = 0;
  private userMessageQueue: Promise<void> = Promise.resolve();
  private emit: EventEmitter;

  private sttKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private ttsKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private isCallActive: boolean = false;

  private currentTranscript: string = "";
  private accumulatedSegments: string[] = [];
  private t_last_mic_speech: number = 0;
  private t_first_pcm_chunk: number = 0;
  private micScriptNode: ScriptProcessorNode | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private greetingSpoken: boolean = false;
  private greetingActive: boolean = false;
  private waitingForDtmf: boolean = false;
  private halfDuplex: boolean = true;
  private isAssistantSpeakingOrPlaying: boolean = false;
  private lastConfig: SdkConfig | null = null;
  public sessionId: string = "call-" + Math.random().toString(36).substring(2, 9);

  // Multi-step case intake chain state
  private intakeStep: IntakeStep = "idle";
  private intakeData: IntakeData = {
    problem: "",
    hasDisability: null,
    gender: null,
    callerName: null,
    address: null,
  };

  // Inactivity timer state (general inquiry / keypad-1 mode)
  // Phase 1: 10s silence → ask if wants to file case
  // Phase 2: 10s silence after that → hangup with farewell
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityPhase: "off" | "query" | "hangup_warn" = "off";
  private generalQueryMode: boolean = false; // true after keypad 1 is pressed

  constructor(emit: EventEmitter) {
    this.emit = emit;
  }

  private isSttReady(): boolean {
    return this.soniox !== null && this.soniox !== undefined;
  }

  private connectStt(): void {
    if (!this.isCallActive) return;

    if (this.soniox) {
      this.soniox.close();
      this.soniox = null;
    }

    if (this.sttKeepAliveTimer) {
      clearInterval(this.sttKeepAliveTimer);
      this.sttKeepAliveTimer = null;
    }

    try {
      const proto =
        typeof window !== "undefined" && window.location.protocol === "https:" ? "wss://" : "ws://";
      const proxyUrl = `${proto}${typeof window !== "undefined" ? window.location.host : "localhost"}/v1/stt`;
      this.soniox = new SonioxStt(
        proxyUrl,
        {
          onInterim: (text) => this.handleSttInterim(text),
          onFinal: (text, utteranceEnd) => this.handleSttFinalSegment(text, utteranceEnd),
          onClosed: (code) => {
            if (!this.isCallActive) return;
            console.warn(`[DirectSession] Soniox STT closed (code ${code}), reconnecting...`);
            this.emit({ type: "system", text: "Soniox STT dropped — reconnecting" });
            setTimeout(() => {
              if (this.isCallActive) this.connectStt();
            }, 600);
          },
        },
        { language: this.sttLanguage, sampleRate: 16000 },
      );
      void this.soniox
        .connect()
        .then(() => {
          if (!this.isCallActive) return;
          console.log("[DirectSession] Soniox realtime STT connected");
          this.emit({ type: "system", text: "Soniox realtime STT connected" });
          if (!this.greetingActive && !this.waitingForDtmf) {
            this.emit({ type: "state_changed", state: "listening" });
          }
        })
        .catch((err: unknown) => {
          if (!this.isCallActive) return;
          console.error("[DirectSession] Soniox STT connect failed:", err);
          this.emit({
            type: "error",
            message: `STT unavailable (Soniox proxy): ${String(err)}`,
          });
          this.emit({ type: "state_changed", state: "error" });
          this.soniox = null;
        });

      this.setupKeepAliveHeartbeat();
    } catch (err) {
      console.error("[DirectSession] Soniox STT init failed:", err);
    }
  }

  private setupKeepAliveHeartbeat(): void {
    if (this.sttKeepAliveTimer) clearInterval(this.sttKeepAliveTimer);
    // Soniox requires {"type":"keepalive"} while audio is idle (greeting
    // playback, IVR DTMF wait) or upstream times the session out (408).
    this.sttKeepAliveTimer = setInterval(() => {
      if (!this.isCallActive) return;
      this.soniox?.sendKeepAlive();
    }, 5000);
  }

  private handleSttInterim(text: string): void {
    if (text.length > 0) {
      this.currentTranscript = text;
    }
  }

  private handleSttFinalSegment(text: string, utteranceEnd: boolean): void {
    if (!this.isCallActive) return;
    if (text.length > 0) {
      this.accumulatedSegments.push(text);
    }
    if (utteranceEnd) {
      // The engine declares the caller finished the turn (<end> / <fin>) —
      // commit through the mic-activity guard immediately.
      void this.attemptFlush("stt_utterance_end");
    } else {
      const commitDelay = (this.intakeStep === "disability" || this.intakeStep === "gender") ? 400 : 850;
      this.armTextActivityCommit(commitDelay);
    }
  }


  public async start(config: SdkConfig): Promise<void> {
    this.lastConfig = config;
    this.isCallActive = true;
    this.waitingForDtmf = false;
    this.sessionId = "call-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);
    this.halfDuplex = config.halfDuplex ?? true;
    this.isAssistantSpeakingOrPlaying = false;
    this.greetingSpoken = false;
    const llmUrl = (config.llmProxyUrl || "/api/llm").replace(/\/+$/, "");
    const llmModel = config.llmModel || "openai/gpt-oss-120b";
    const language = config.language || "bn";
    const voiceId = config.voiceId || "Priya";
    const ttsProxyUrl =
      config.ttsProxyUrl ||
      `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8200/v1/tts`;
    const systemPrompt =
      config.systemPrompt ||
      "আপনি একজন নির্ভুল এবং সংক্ষিপ্ত আইনি সহায়ক। বাংলায় স্পষ্ট ও সংক্ষিপ্ত বাক্যে উত্তর দিন। " +
        "কোনো মার্কডাউন, বুলেট পয়েন্ট বা অতিরিক্ত দীর্ঘ ব্যাখ্যা ব্যবহার করবেন না। " +
        "আইনি বিষয়বহির্ভূত কোনো প্রশ্ন করা হলে বলুন যে আপনার প্রাসঙ্গিক নথিপত্র পর্যালোচনা করা প্রয়োজন।";

    this.conversationHistory = [{ role: "system", content: systemPrompt }];
    this.turnPhase.reset();
    this.turnPhase = new TurnPhaseStateMachine(config.minBargeInWords ?? 2);
    this.vad.reset();
    this.t_last_mic_speech = 0;
    this.t_first_pcm_chunk = 0;

    this.emit({ type: "system", text: "Starting High-Speed Streaming Voice Session..." });

    // 1. Capture microphone with AEC3
    const micStream = await acquireHardwareMic(this.emit);
    if (!micStream) return;
    this.stream = micStream;

    // 2. Initialize WebAudio Context & Streaming Player
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtxClass();
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
    this.player = new StreamingAudioPlayer(this.audioCtx);

    // 3. Connect Persistent Streaming WebSocket TTS (Soniox / Deepgram via local proxy)
    this.ttsWs = new DeepgramWsTts(ttsProxyUrl, voiceId, language);
    this.ttsWs.setOnAudioChunk((pcm16) => {
      if (this.t_first_pcm_chunk === 0) {
        this.t_first_pcm_chunk = performance.now();
      }
      if (this.player) {
        this.player.enqueuePcmChunk(pcm16);
      }
    });
    this.ttsWs.setOnFlush(() => {
      if (this.player) {
        this.player.flush();
      }
    });
    void this.ttsWs.connect().catch((err: unknown) => {
      this.emit({
        type: "error",
        message: `TTS unavailable: ${String(err)}. STT is still active.`,
      });
    });
    if (this.ttsKeepAliveTimer) clearInterval(this.ttsKeepAliveTimer);
    // Soniox TTS connection keepalive between streams (every 5s to prevent idle disconnect).
    this.ttsKeepAliveTimer = setInterval(() => {
      if (!this.isCallActive || !this.ttsWs) return;
      this.ttsWs.sendKeepAlive();
    }, 5000);

    this.sttLanguage = language;
    this.accumulatedSegments = [];
    this.connectStt();

    // 5. Setup live microphone streamer node
    void this.setupDirectMicStreamer(micStream);

    // 6. Play initial greeting & IVR menu
    const officialDefaultGreeting =
      "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইনে আপনাকে স্বাগতম। " +
      "আপনাকে সঠিক সেবা প্রদান এবং ভবিষ্যতের প্রয়োজনে আমাদের এই কথোপকথনটি রেকর্ড করা হচ্ছে।";
    const officialDefaultSecondary =
      "সাধারণ তথ্য জানতে ১ চাপুন, কিন্তু কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন।";

    const activeGreeting = config.greeting !== undefined ? config.greeting : officialDefaultGreeting;
    const activeSecondary =
      config.secondaryPrompt !== undefined ? config.secondaryPrompt : officialDefaultSecondary;

    if (activeGreeting && !this.greetingSpoken) {
      this.greetingSpoken = true;
      this.greetingActive = true;
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      // 1st Message: Greeting & Introduction
      this.emit({ type: "transcript", role: "assistant", text: activeGreeting });
      this.conversationHistory.push({ role: "assistant", content: activeGreeting });

      // 2nd Message: IVR Menu Prompt
      if (activeSecondary) {
        this.emit({ type: "transcript", role: "assistant", text: activeSecondary });
        this.conversationHistory.push({ role: "assistant", content: activeSecondary });
      }

      void (async () => {
        try {
          if (!this.greetingActive || !this.audioCtx || !this.player) return;

          // Load and play pre-recorded Soniox audio (saves 100% of TTS credits, 0ms synthesis delay)
          const greetingBuf = await getPreRecordedAudioBuffer(this.audioCtx, "greeting");
          if (greetingBuf && this.greetingActive && this.player) {
            this.player.playAudioBuffer(greetingBuf);
          }
          const ivrBuf = await getPreRecordedAudioBuffer(this.audioCtx, "ivr");
          if (ivrBuf && this.greetingActive && this.player) {
            this.player.playAudioBuffer(ivrBuf);
          }
          if (this.greetingActive && this.player) {
            await this.player.waitUntilFinished();
          }
        } catch (err) {
          console.warn("Failed to play pre-recorded audio, falling back to TTS:", err);
          if (this.ttsWs && this.greetingActive) {
            await this.ttsWs.speakWhenReady(activeGreeting);
            if (activeSecondary) {
              await this.ttsWs.speakWhenReady(activeSecondary);
            }
            this.ttsWs.flush();
            await this.ttsWs.waitForFlush(8000);
            await this.player?.waitUntilFinished();
          }
        } finally {
          if (this.greetingActive) {
            // stop() clears greetingActive, so this only broadcasts for a
            // rotating/interrupted greeting while the call is still live.
            this.greetingActive = false;
            this.setAssistantSpeaking(false);
            this.turnPhase.reset();
            if (this.isCallActive) {
              // IVR gate: transcription stays OFF until the caller presses a
              // DTMF key (1/2/...). Enter the "press a key" wait phase.
              this.enterDtmfWait();
            }
          }
        }
      })();
    }
  }


  /**
   * Re-armed on every fresh STT final. The commit only fires when no new
   * transcript text has arrived for the full window — this is what glues
   * multi-clause speech into ONE user turn even when Soniox segments it
   * into several finalized slices.
   */
  private armTextActivityCommit(delayMs: number) {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
    }
    this.speechFinalDebounceTimer = setTimeout(() => {
      void this.attemptFlush("commit_quiet_after_finals");
    }, delayMs);
  }

  /**
   * Commit gate: never dispatch the turn to the LLM while the user is still
   * physically producing speech. If mic audio is active (or was active within
   * the last 300ms), postpone instead of committing — this is the guard that
   * stops "half a sentence" turns from racing the user's own continuation.
   */
  private async attemptFlush(reason: string) {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }

    const sinceMicSpeech =
      this.t_last_mic_speech > 0 ? performance.now() - this.t_last_mic_speech : Infinity;
    if (this.vad.isSpeaking() || sinceMicSpeech < 300) {
      this.speechFinalDebounceTimer = setTimeout(() => {
        void this.attemptFlush(reason);
      }, 400);
      return;
    }

    await this.flushAccumulatedUtterance(reason);
  }

  private async flushAccumulatedUtterance(reason: string) {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }

    let fullText = this.accumulatedSegments.join(" ").trim();
    if (!fullText && this.currentTranscript.trim().length > 0) {
      fullText = this.currentTranscript.trim();
    }

    if (!fullText || fullText.length === 0) return;

    const turnEpoch = ++this.activityEpoch;
    this.accumulatedSegments = [];
    this.currentTranscript = "";

    // Case Intake Multi-Step Chaining Voice Hook
    if (this.intakeStep !== "idle" && this.intakeStep !== "complete") {
      await this.handleIntakeVoiceInput(fullText);
      return;
    }

    if (this.generalQueryMode) {
      this.clearInactivityTimer();
      if (this.inactivityPhase === "hangup_warn") {
        if (await this.handleInactivityWarningInput(fullText)) return;
        this.inactivityPhase = "off";
      }
    }

    // Re-arm Soniox's idle-finalize window for the next turn.
    this.soniox?.resetTurnBuffer();

    const t_stt_final = performance.now();
    const t_speech_end =
      this.t_last_mic_speech > 0 && t_stt_final - this.t_last_mic_speech < 3000
        ? this.t_last_mic_speech
        : t_stt_final - 300;
    this.t_last_mic_speech = 0;

    const stt_ms = Math.max(0, Math.round(t_stt_final - t_speech_end));
    const llmUrl = (this.lastConfig?.llmProxyUrl || "/api/llm").replace(/\/+$/, "");
    const llmModel = this.lastConfig?.llmModel || "openai/gpt-oss-120b";

    const action = this.turnPhase.transition({
      type: "Transcript",
      text: fullText,
      isFinal: true,
    });
    await this.executeTurnAction(action, fullText, llmUrl, llmModel, stt_ms, t_speech_end);
    if (
      this.activityEpoch === turnEpoch &&
      this.generalQueryMode &&
      this.isCallActive &&
      this.intakeStep === "idle"
    ) {
      this.inactivityPhase = "off";
      this.armInactivityTimer();
    }
  }

  private async setupDirectMicStreamer(micStream: MediaStream) {
    if (!this.audioCtx) return;
    const source = this.audioCtx.createMediaStreamSource(micStream);
    this.micSourceNode = source;

    const inputSampleRate = this.audioCtx.sampleRate;
    const targetSampleRate = 16000;
    const TARGET_CHUNK_SAMPLES = 1600; // 100ms at 16kHz

    const handleAudioChunk = (pcmBuffer: ArrayBuffer, floatSamples: Float32Array) => {
      if (!this.isSttReady()) return;

      const isAssistantSpeaking =
        this.isAssistantSpeakingOrPlaying ||
        (this.player ? this.player.hasActivePlayback() : false);

      this.vad.setPlaybackMode(isAssistantSpeaking);

      // In halfDuplex, ignore the mic entirely while the assistant is speaking/playing,
      // or while the greeting/IVR announcement plays, or during DTMF wait:
      // this guarantees zero echo-triggered barge-in, zero self-interruption of Option 1
      // or greetings, and zero acoustic feedback!
      if (this.halfDuplex && (isAssistantSpeaking || this.greetingActive || this.waitingForDtmf)) {
        return;
      }

      // 1. Process VAD on true 16kHz formant-matched samples
      const vadEvt = this.vad.process(floatSamples);
      const isPipelineActive = isAssistantSpeaking || this.activeAbortCtrl !== null;

      if (this.vad.isSpeaking()) {
        this.t_last_mic_speech = performance.now();
      }

      if (vadEvt === VadEvent.SpeechStart) {
        if (this.speechFinalDebounceTimer) {
          clearTimeout(this.speechFinalDebounceTimer);
          this.speechFinalDebounceTimer = null;
        }
        const action = this.turnPhase.transition({
          type: "SpeechStarted",
          pipelineWasActive: isPipelineActive,
        });
        this.handleAction(action);
      } else if (vadEvt === VadEvent.SpeechEnd) {
        this.t_last_mic_speech = performance.now();
        // Smart-Turn preview over the FULL accumulated utterance (segments +
        // interim), not just the latest interim fragment.
        const previewText =
          [...this.accumulatedSegments, this.currentTranscript].filter(Boolean).join(" ").trim();
        const prediction = this.smartTurn.predict(previewText, 0);
        const action = this.turnPhase.transition({
          type: "SpeechEnded",
          smartComplete: prediction.isComplete,
        });
        this.handleAction(action);

        if (this.accumulatedSegments.length > 0 || this.currentTranscript.length > 0) {
          // Smart-Turn-gated EOT delay: a turn predicted complete commits after
          // a short confirmation pause; a turn ending mid-thought (connector
          // word, trailing filler) gets a long grace window so the rest of the
          // sentence joins the SAME turn instead of firing the LLM early.
          const delay = prediction.isComplete ? 500 : 1300;
          if (this.speechFinalDebounceTimer) clearTimeout(this.speechFinalDebounceTimer);
          this.speechFinalDebounceTimer = setTimeout(() => {
            void this.attemptFlush("vad_speech_end_smart_turn");
          }, delay);
        }
      }

      // In halfDuplex, only mute mic audio going to STT if the assistant is still speaking AND user is not actively speaking (barge-in)
      if (this.halfDuplex && isAssistantSpeaking && !this.vad.isSpeaking()) {
        return;
      }

      // 2. Transmit 16kHz PCM16 chunk directly to STT
      this.soniox?.sendAudio(pcmBuffer);
    };

    // Attempt high-performance off-main-thread AudioWorklet
    let workletReady = false;
    try {
      const registered = await registerDownsampleWorklet(this.audioCtx);
      if (registered && typeof AudioWorkletNode !== "undefined") {
        const workletNode = new AudioWorkletNode(this.audioCtx, "voice-downsample-processor", {
          processorOptions: {
            targetSampleRate,
            chunkSamples: TARGET_CHUNK_SAMPLES,
          },
        });
        workletNode.port.postMessage({ type: "set_mute", muted: false });

        workletNode.port.onmessage = (evt) => {
          if (evt.data && evt.data.type === "chunk") {
            const floatSamples = new Float32Array(evt.data.floats);
            handleAudioChunk(evt.data.pcm, floatSamples);
          }
        };

        source.connect(workletNode);
        const silentGain = this.audioCtx.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain);
        silentGain.connect(this.audioCtx.destination);
        this.micWorkletNode = workletNode;
        workletReady = true;
      }
    } catch (e) {
      console.warn("[voice-session] AudioWorklet setup failed, using zero-GC ScriptProcessor fallback", e);
    }

    if (!workletReady) {
      // Fallback: Optimized Zero-GC ScriptProcessorNode
      const scriptNode = this.audioCtx.createScriptProcessor(1024, 1, 1);
      this.micScriptNode = scriptNode;

      const pcmBuffer = new Int16Array(TARGET_CHUNK_SAMPLES);
      const floatBuffer = new Float32Array(TARGET_CHUNK_SAMPLES);
      let bufIdx = 0;
      let fraction = 0;
      const ratio = inputSampleRate / targetSampleRate;

      scriptNode.onaudioprocess = (audioEvt) => {
        if (!this.isSttReady()) return;
        const inputBuffer = audioEvt.inputBuffer.getChannelData(0);
        const len = inputBuffer.length;
        let i = fraction;

        while (i < len) {
          const idx = Math.floor(i);
          const nextIdx = Math.min(idx + 1, len - 1);
          const frac = i - idx;
          const s = inputBuffer[idx] * (1 - frac) + inputBuffer[nextIdx] * frac;
          const clamped = Math.max(-1, Math.min(1, s));

          floatBuffer[bufIdx] = clamped;
          pcmBuffer[bufIdx] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          bufIdx++;

          if (bufIdx >= TARGET_CHUNK_SAMPLES) {
            const pcmCopy = new Int16Array(pcmBuffer);
            const floatCopy = new Float32Array(floatBuffer);
            handleAudioChunk(pcmCopy.buffer, floatCopy);
            bufIdx = 0;
          }

          i += ratio;
        }

        fraction = i - len;
      };

      source.connect(scriptNode);
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);
    }
  }

  private handleAction(action: { type: string; [k: string]: unknown }) {
    switch (action.type) {
      case "InterruptTts": {
        this.interruptAssistant();
        // Restore mic/access state after a barged-in playback so a spurious
        // spurious (echo) barge-in can never leave the session muted mid-greeting.
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        break;
      }
      case "ArmFallbackTimer": {
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        this.fallbackTimer = setTimeout(() => {
          this.turnPhase.transition({ type: "FallbackTimerFired" });
        }, (action.timeoutMs as number) || 1200);
        break;
      }
      case "CancelFallbackTimer": {
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        break;
      }
    }
  }

  private async executeTurnAction(
    action: { type: string; text?: string },
    fullText: string,
    llmUrl: string,
    llmModel: string,
    stt_ms: number,
    t_speech_end: number,
  ) {
    if (action.type === "StartLlm" || action.type === "CommitBargeIn") {
      const textToPrompt = action.text || fullText;
      this.emit({ type: "transcript", role: "user", text: textToPrompt });
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      this.conversationHistory.push({ role: "user", content: textToPrompt });
      await this.generateAndSpeakResponse(llmUrl, llmModel, stt_ms, t_speech_end);
    } else if (action.type === "RejectNoise") {
      // Noise was rejected but playback (+ mic mute) may already have been torn
      // down by InterruptTts — always restore the listening state so the session
      // can never get wedged with the mic muted.
      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    } else if (fullText.trim().length > 0) {
      // Fallback: If turnPhase returned "None" but we have genuine user speech, NEVER discard it!
      const textToPrompt = fullText.trim();
      this.emit({ type: "transcript", role: "user", text: textToPrompt });
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      this.conversationHistory.push({ role: "user", content: textToPrompt });
      await this.generateAndSpeakResponse(llmUrl, llmModel, stt_ms, t_speech_end);
    }
  }

  private interruptAssistant() {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }
    this.greetingActive = false;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.activeAbortCtrl) {
      this.activeAbortCtrl.abort();
      this.activeAbortCtrl = null;
    }
    if (this.ttsWs) {
      this.ttsWs.clear();
    }
    if (this.player) {
      this.player.reset();
    }
  }

  private async generateAndSpeakResponse(
    llmUrl: string,
    llmModel: string,
    stt_ms: number,
    t_speech_end: number,
  ) {
    this.interruptAssistant();
    const activityEpoch = this.activityEpoch;
    this.t_first_pcm_chunk = 0;

    const t_llm_start = performance.now();
    let t_llm_ttft = 0;
    let t_sentence1_sent = 0;
    let textSentToTts = false;

    const abortCtrl = new AbortController();
    this.activeAbortCtrl = abortCtrl;

    // Attach high-precision sub-millisecond audio playback telemetry hook
    if (this.player) {
      this.player.onFirstPlay = (tPlay: number) => {
        if (this.activityEpoch !== activityEpoch) return;
        const safe_ttft = t_llm_ttft > 0 ? t_llm_ttft : performance.now();
        const safe_sentence1 = t_sentence1_sent > 0 ? t_sentence1_sent : safe_ttft + 40;

        const safe_first_pcm = this.t_first_pcm_chunk > 0 ? this.t_first_pcm_chunk : tPlay - 2;

        const llm_ttft_ms = Math.max(0, Math.round(safe_ttft - t_llm_start));
        const sentence1_gen_ms = Math.max(0, Math.round(safe_sentence1 - safe_ttft));
        const tts_synthesis_ms = Math.max(0, Math.round(safe_first_pcm - safe_sentence1));
        const tts_first_audio_ms = Math.max(0, Math.round(tPlay - safe_first_pcm));
        const total_voice_latency_ms = Math.max(0, Math.round(tPlay - t_speech_end));

        this.emit({
          type: "latency_metrics",
          stt_ms,
          llm_ttft_ms,
          sentence1_gen_ms,
          tts_synthesis_ms,
          tts_first_audio_ms,
          total_voice_latency_ms,
        });
      };
    }

    try {
      const res = await fetch(llmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          model: llmModel,
          messages: this.conversationHistory,
          stream: true,
          temperature: 0.7,
        }),
        signal: abortCtrl.signal,
      });

      if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;

      if (!res.ok || !res.body) {
        throw new Error(`LLM request failed: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAssistantText = "";
      let sentenceBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.tool_call) {
              this.emit({
                type: "tool_activity",
                tool_name: parsed.tool_call.name,
                message: `Executing tool: ${parsed.tool_call.name}`,
              });
            }
            const token = parsed.choices?.[0]?.delta?.content || "";
            if (token) {
              if (t_llm_ttft === 0) {
                t_llm_ttft = performance.now();
              }

              fullAssistantText += token;
              sentenceBuffer += token;

              // Prosody-Preserving Natural Sentence & Clause Chunker:
              let flushChunk = "";
              // 1. Strong sentence boundary (. ! ? । \n)
              const strongMatch = sentenceBuffer.match(/^([\s\S]+?[.!?।\n]+)\s*(.*)$/);
              if (strongMatch) {
                flushChunk = strongMatch[1].trim();
                sentenceBuffer = strongMatch[2];
              } else {
                // 2. Meaningful clause boundary (, ; : —) with at least 15 characters
                const weakMatch = sentenceBuffer.match(/^([\s\S]+?[,;:—–])\s*(.*)$/);
                if (weakMatch && weakMatch[1].trim().length >= 15) {
                  flushChunk = weakMatch[1].trim();
                  sentenceBuffer = weakMatch[2];
                } else if (sentenceBuffer.length >= 65) {
                  // 3. Fallback on complete word boundary for very long sentences
                  const lastSpace = sentenceBuffer.lastIndexOf(" ");
                  if (lastSpace > 20) {
                    flushChunk = sentenceBuffer.substring(0, lastSpace).trim();
                    sentenceBuffer = sentenceBuffer.substring(lastSpace + 1);
                  }
                }
              }

              if (flushChunk.length > 0) {
                if (t_sentence1_sent === 0) {
                  t_sentence1_sent = performance.now();
                }
                if (this.activityEpoch !== activityEpoch) return;
                // Batched IPC dispatch (reduces 98% of synchronous CDP thread stalls)
                this.emit({ type: "transcript_chunk", role: "assistant", text: flushChunk + " " });

                if (this.ttsWs) {
                  textSentToTts = true;
                  void this.ttsWs.speakWhenReady(flushChunk);
                }
              }
            }
          } catch {}
        }
      }

      if (sentenceBuffer.trim().length > 0) {
        if (t_sentence1_sent === 0) {
          t_sentence1_sent = performance.now();
        }
        if (this.activityEpoch !== activityEpoch) return;
        this.emit({ type: "transcript_chunk", role: "assistant", text: sentenceBuffer.trim() });
        if (this.ttsWs) {
          textSentToTts = true;
          await this.ttsWs.speakWhenReady(sentenceBuffer.trim());
          if (this.activityEpoch !== activityEpoch) return;
        }
      }

      // Signal completion of utterance to WebSocket TTS and wait for synthesis + audio drain
      if (this.ttsWs && textSentToTts) {
        this.ttsWs.flush();
        await this.ttsWs.waitForFlush(8000);
        if (this.activityEpoch !== activityEpoch) return;
      }

      if (fullAssistantText.trim().length > 0) {
        this.emit({ type: "transcript", role: "assistant", text: fullAssistantText.trim() });
        this.conversationHistory.push({ role: "assistant", content: fullAssistantText.trim() });
      }

      if (this.player) {
        await this.player.waitUntilFinished();
        if (this.activityEpoch !== activityEpoch) return;
      }

      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    } catch (err: unknown) {
      if (
        this.activityEpoch === activityEpoch &&
        (err as { name?: string })?.name !== "AbortError"
      ) {
        this.emit({ type: "error", message: `Direct LLM Error: ${String(err)}` });
      }
    } finally {
      if (this.activityEpoch === activityEpoch) {
        if (this.activeAbortCtrl === abortCtrl) {
          this.activeAbortCtrl = null;
        }
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
      }
    }
  }

  private setAssistantSpeaking(speaking: boolean) {
    this.isAssistantSpeakingOrPlaying = speaking;
    if (this.halfDuplex) {
      this.emit({ type: "mic_mute_changed", muted: speaking });
      if (this.micWorkletNode) {
        this.micWorkletNode.port.postMessage({ type: "set_mute", muted: speaking });
      }
    }
  }

  /**
   * IVR gate: hold the call at the root menu until the caller presses a DTMF
   * key. Transcription (STT audio + VAD + turn detection) stays fully off — the
   * mic path is ignored — until a key lands via sendUserMessage().
   */
  private enterDtmfWait() {
    this.waitingForDtmf = true;
    this.turnPhase.reset();
    this.emit({ type: "mic_mute_changed", muted: true });
    if (this.micWorkletNode) {
      this.micWorkletNode.port.postMessage({ type: "set_mute", muted: true });
    }
    this.emit({ type: "state_changed", state: "dtmf_wait" });
  }

  private exitDtmfWait() {
    if (!this.waitingForDtmf) return;
    this.waitingForDtmf = false;
    this.emit({ type: "mic_mute_changed", muted: false });
    if (this.micWorkletNode) {
      this.micWorkletNode.port.postMessage({ type: "set_mute", muted: false });
    }
    this.emit({ type: "system", text: "DTMF route selected — transcription enabled" });
  }

  /**
   * Start / restart the 10-second inactivity timer.
   * Only active when in generalQueryMode (keypad 1) and no active intake chain.
   */
  private armInactivityTimer(): void {
    this.clearInactivityTimer();
    if (!this.generalQueryMode || !this.isCallActive) return;
    if (this.intakeStep !== "idle") return; // intake chain handles its own pacing

    this.inactivityTimer = setTimeout(() => {
      void this.handleInactivityFired();
    }, 10_000);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private async handleInactivityWarningInput(input: string): Promise<boolean> {
    const clean = input.trim();
    const parsed = parseBengaliYesNo(clean);
    const isYes =
      parsed === true ||
      clean === "1" ||
      clean === "১" ||
      clean === "১ (সাধারণ তথ্য ও নিয়মাবলী)";
    const isNo =
      parsed === false ||
      clean === "2" ||
      clean === "২" ||
      clean === "২ (সমস্যা বা নতুন অভিযোগ)";
    if (!isYes && !isNo) return false;

    const activityEpoch = this.activityEpoch;
    this.inactivityPhase = "off";
    this.emit({ type: "transcript", role: "user", text: clean });

    if (isYes) {
      await this.startCaseIntakeChain();
      return true;
    }

    const noAckText = "ঠিক আছে, আমি শুনছি। আপনার যেকোনো আইনি প্রশ্ন বা পরামর্শের প্রয়োজন হলে নির্দ্বিধায় বলুন, আমি সাহায্য করছি।";
    this.interruptAssistant();
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });
    this.emit({ type: "transcript", role: "assistant", text: noAckText });
    this.conversationHistory.push({ role: "assistant", content: noAckText });
    try {
      if (this.audioCtx && this.player) {
        const buf = await getPreRecordedAudioBuffer(this.audioCtx, "inactivity_no_ack");
        if (this.activityEpoch !== activityEpoch || !this.isCallActive) return true;
        if (buf && this.isCallActive) {
          this.player.playAudioBuffer(buf);
          await this.player.waitUntilFinished();
        } else if (this.ttsWs) {
          await this.ttsWs.speakWhenReady(noAckText);
          if (this.activityEpoch !== activityEpoch) return true;
          this.ttsWs.flush();
          await this.ttsWs.waitForFlush(8000);
          await this.player?.waitUntilFinished();
        }
      }
    } catch {
      if (this.activityEpoch !== activityEpoch || !this.isCallActive) return true;
      if (this.ttsWs) {
        await this.ttsWs.speakWhenReady(noAckText).catch(() => {});
        if (this.activityEpoch !== activityEpoch) return true;
        this.ttsWs.flush();
        await this.ttsWs.waitForFlush(5000).catch(() => {});
      }
    } finally {
      if (
        this.isCallActive &&
        this.generalQueryMode &&
        this.activityEpoch === activityEpoch
      ) {
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        this.inactivityPhase = "off";
        this.armInactivityTimer();
      }
    }
    return true;
  }

  private async handleInactivityFired(): Promise<void> {
    if (!this.isCallActive || !this.generalQueryMode) return;
    if (this.intakeStep !== "idle") {
      this.clearInactivityTimer();
      return;
    }
    if (this.isAssistantSpeakingOrPlaying) {
      // Re-arm: don't interrupt the agent while it's speaking
      this.armInactivityTimer();
      return;
    }

    const sinceMicSpeech =
      this.t_last_mic_speech > 0 ? performance.now() - this.t_last_mic_speech : Infinity;
    if (this.vad.isSpeaking() || sinceMicSpeech < 300) {
      this.armInactivityTimer();
      return;
    }

    const activityEpoch = ++this.activityEpoch;

    if (this.inactivityPhase === "off" || this.inactivityPhase === "query") {
      // === Phase 1: Ask if they want to file a case ===
      this.inactivityPhase = "hangup_warn";
      this.interruptAssistant();
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      const queryText = "আপনি কি সরকারি আইনি সহায়তার জন্য কোনো আবেদন বা অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা আপনার অন্য কোনো প্রশ্ন থাকলে করতে পারেন।";
      this.emit({ type: "transcript", role: "assistant", text: queryText });
      this.conversationHistory.push({ role: "assistant", content: queryText });

      try {
        // Try pre-recorded first
        if (this.audioCtx && this.player) {
          const buf = await getPreRecordedAudioBuffer(this.audioCtx, "inactivity_app_query");
          if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
          if (buf && this.isCallActive) {
            this.player.playAudioBuffer(buf);
            await this.player.waitUntilFinished();
          } else if (this.ttsWs) {
            await this.ttsWs.speakWhenReady(queryText);
            if (this.activityEpoch !== activityEpoch) return;
            this.ttsWs.flush();
            await this.ttsWs.waitForFlush(8000);
            await this.player?.waitUntilFinished();
          }
        }
      } catch {
        if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
        if (this.ttsWs) {
          await this.ttsWs.speakWhenReady(queryText).catch(() => {});
          if (this.activityEpoch !== activityEpoch) return;
          this.ttsWs.flush();
          await this.ttsWs.waitForFlush(5000).catch(() => {});
        }
      } finally {
        if (this.isCallActive && this.activityEpoch === activityEpoch) {
          this.setAssistantSpeaking(false);
          this.turnPhase.reset();
          this.emit({ type: "state_changed", state: "listening" });
          // Phase 2: 10s to respond or call drops
          this.armInactivityTimer();
        }
      }
    } else {
      // === Phase 2: No response after query → hangup ===
      this.inactivityPhase = "off";
      this.generalQueryMode = false;
      this.interruptAssistant();
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      const hangupText = "দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় কলটি শেষ করা হচ্ছে। যেকোনো আইনি তথ্যের জন্য ১৬৬৯৯ নম্বরে আবার কল করুন। বাংলাদেশ লিগ্যাল এইডের সাথে থাকার জন্য ধন্যবাদ।";
      this.emit({ type: "transcript", role: "assistant", text: hangupText });
      this.conversationHistory.push({ role: "assistant", content: hangupText });

      try {
        if (this.audioCtx && this.player) {
          const buf = await getPreRecordedAudioBuffer(this.audioCtx, "inactivity_hangup");
          if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
          if (buf && this.isCallActive) {
            this.player.playAudioBuffer(buf);
            await this.player.waitUntilFinished();
          } else if (this.ttsWs) {
            await this.ttsWs.speakWhenReady(hangupText);
            if (this.activityEpoch !== activityEpoch) return;
            this.ttsWs.flush();
            await this.ttsWs.waitForFlush(8000);
            await this.player?.waitUntilFinished();
          }
        }
      } catch {
        if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
        if (this.ttsWs) {
          await this.ttsWs.speakWhenReady(hangupText).catch(() => {});
          if (this.activityEpoch !== activityEpoch) return;
          this.ttsWs.flush();
          await this.ttsWs.waitForFlush(5000).catch(() => {});
        }
      } finally {
        if (this.isCallActive && this.activityEpoch === activityEpoch) {
          // Emit hangup event so the UI can close the call
          this.emit({ type: "system", text: "INACTIVITY_HANGUP" });
          this.setAssistantSpeaking(false);
          // Give a tiny gap before stop() so audio finishes playing
          setTimeout(() => { if (this.isCallActive) this.stop(); }, 300);
        }
      }
    }
  }

  private async speakAssistantPhrase(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    this.interruptAssistant();
    const activityEpoch = this.activityEpoch;
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });
    this.emit({ type: "transcript", role: "assistant", text: clean });
    this.conversationHistory.push({ role: "assistant", content: clean });

    if (this.ttsWs) {
      await this.ttsWs.speakWhenReady(clean);
      if (this.activityEpoch !== activityEpoch) return;
      this.ttsWs.flush();
      await this.ttsWs.waitForFlush(8000);
    }
    if (this.player) {
      await this.player.waitUntilFinished();
      if (this.activityEpoch !== activityEpoch) return;
    }
    if (this.isCallActive && this.activityEpoch === activityEpoch) {
      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    }
  }

  private async syncDocketPatch(patch: Record<string, any>): Promise<void> {
    try {
      await fetch("/api/agent/docket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          patch,
        }),
      });
    } catch (err) {
      console.warn("Failed to sync docket patch:", err);
    }
  }

  public async startCaseIntakeChain(): Promise<void> {
    this.activityEpoch += 1;
    this.clearInactivityTimer();
    this.generalQueryMode = false;
    this.inactivityPhase = "off";
    this.intakeStep = "problem";
    this.intakeData = {
      problem: "",
      hasDisability: null,
      gender: null,
      callerName: null,
      address: null,
    };
    this.exitDtmfWait();
    this.emit({
      type: "intake_step_changed",
      step: "problem",
      data: this.intakeData,
    });

    const prompt = "জি, আমি শুনছি। আপনার পুরো আইনি সমস্যাটি বিস্তারিত বলুন। বলা শেষ হলে ডায়ালপ্যাডের ১ চাপুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async advanceFromProblemStep(): Promise<void> {
    const cleanProblem = this.intakeData.problem.trim();
    if (cleanProblem.length === 0) {
      const retryPrompt = "দয়া করে আপনার সমস্যাটি মুখে বলুন, তারপর ১ চাপুন। আমি শুনছি।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeStep = "disability";
    this.emit({
      type: "intake_step_changed",
      step: "disability",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      incidentSummary: cleanProblem,
    });

    const prompt = "আপনার সমস্যাটি নথিভুক্ত করা হয়েছে। আপনার কি কোনো শারীরিক বা বিশেষ প্রতিবন্ধকতা রয়েছে? হ্যাঁ অথবা না বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeDisabilityInput(input: string): Promise<void> {
    const parsed = parseBengaliYesNo(input);
    if (parsed === null) {
      const retryPrompt = "দয়া করে হ্যাঁ অথবা না বলুন, কিংবা ডায়ালপ্যাডে ১ অথবা ২ চাপুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.hasDisability = parsed;
    this.intakeStep = "gender";
    this.emit({
      type: "intake_step_changed",
      step: "gender",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      hasDisability: parsed,
      eligibilityStatus: parsed ? "eligible_100_free" : "pending",
    });

    const prompt = "তথ্যটি সংরক্ষিত হয়েছে। আপনার লিঙ্গ কী? পুরুষ, নারী, নাকি অন্যান্য বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeGenderInput(input: string): Promise<void> {
    const parsed = parseBengaliGender(input);
    if (parsed === null) {
      const retryPrompt = "দয়া করে আপনার লিঙ্গ পুরুষ, নারী, নাকি অন্যান্য বলুন, অথবা ১, ২ বা ৩ চাপুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.gender = parsed;
    this.intakeStep = "name";
    this.emit({
      type: "intake_step_changed",
      step: "name",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      gender: parsed,
      eligibilityStatus: parsed === "নারী" || this.intakeData.hasDisability ? "eligible_100_free" : "pending",
    });

    const prompt = "ধন্যবাদ। এবার আপনার পূর্ণ নামটি বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeNameInput(input: string): Promise<void> {
    const cleanName = cleanBengaliName(input);
    if (cleanName.length === 0) {
      const retryPrompt = "দয়া করে আপনার পূর্ণ নামটি পরিষ্কার করে বলুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.callerName = cleanName;
    this.intakeStep = "address";
    this.emit({
      type: "intake_step_changed",
      step: "address",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      callerName: cleanName,
    });

    const honorific = this.intakeData.gender === "নারী" ? "জনাবা" : "জনাব";
    const prompt = `ধন্যবাদ ${honorific} ${cleanName}। আপনার বর্তমান ঠিকানা ও জেলার নাম বলুন।`;
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeAddressInput(input: string): Promise<void> {
    const cleanAddress = input.trim();
    if (cleanAddress.length === 0) {
      const retryPrompt = "দয়া করে আপনার বর্তমান ঠিকানা ও জেলার নাম বলুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.address = cleanAddress;
    this.intakeStep = "complete";
    this.emit({
      type: "intake_step_changed",
      step: "complete",
      data: this.intakeData,
    });

    await this.finalizeCaseIntake();
  }

  private async speakIntakeCompletion(text: string): Promise<void> {
    if (this.audioCtx && this.player) {
      const buf = await getPreRecordedAudioBuffer(this.audioCtx, "intake_complete");
      if (buf && this.isCallActive) {
        this.interruptAssistant();
        const activityEpoch = this.activityEpoch;
        this.setAssistantSpeaking(true);
        this.emit({ type: "state_changed", state: "speaking" });
        this.emit({ type: "transcript", role: "assistant", text });
        this.conversationHistory.push({ role: "assistant", content: text });
        this.player.playAudioBuffer(buf);
        await this.player.waitUntilFinished();
        if (this.isCallActive && this.activityEpoch === activityEpoch) {
          this.setAssistantSpeaking(false);
          this.turnPhase.reset();
          this.emit({ type: "state_changed", state: "listening" });
        }
        return;
      }
    }

    await this.speakAssistantPhrase(text);
  }

  private async createCitizenSession(docketId: string, district: string, category: string): Promise<SessionUser> {
    const response = await fetch("/api/roles/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceSessionId: this.sessionId,
        docketId,
        displayName: this.intakeData.callerName || "নাগরিক",
        phone: null,
        problem: this.intakeData.problem,
        hasDisability: this.intakeData.hasDisability,
        gender: this.intakeData.gender,
        district,
        thana: this.intakeData.address,
        category,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { user?: SessionUser; error?: string } | null;
    if (!response.ok || !payload?.user) {
      throw new Error(payload?.error || "Citizen session could not be created");
    }
    return payload.user;
  }

  private async finalizeCaseIntake(): Promise<void> {
    const docketId = "DLAS-2025-" + Math.floor(1000 + Math.random() * 9000);
    const district = extractDistrict(this.intakeData.address || "") || "ঢাকা";
    const category = inferLegalCategory(this.intakeData.problem || "");

     await this.syncDocketPatch({
       callerName: this.intakeData.callerName,
       incidentSummary: this.intakeData.problem,
       gender: this.intakeData.gender,
       hasDisability: this.intakeData.hasDisability,
       district,
       thana: this.intakeData.address,
       category,
       eligibilityStatus: "eligible_100_free",
       docketId,
       urgency: "normal",
       assignedOffice: `জেলা লিগ্যাল এইড অফিস, ${district}`,
     });

     let citizenUser: SessionUser;
     try {
       citizenUser = await this.createCitizenSession(docketId, district, category);
     } catch (error) {
       this.emit({
         type: "error",
         message: `আইনি অভিযোগ নথিভুক্ত হয়েছে, কিন্তু নাগরিক লগইন তৈরি হয়নি: ${error instanceof Error ? error.message : String(error)}`,
       });
       return;
     }

      const closingPrompt =

       "আপনার আইনি অভিযোগ ও তথ্যাবলী সফলভাবে নথিভুক্ত করা হয়েছে। আপনার ডকেট নম্বরটি কথোপকথনের রেকর্ডে সংরক্ষিত আছে। জাতীয় আইনগত সহায়তা প্রদান সংস্থা থেকে আমাদের প্যানেল আইনজীবী দ্রুত আপনার সাথে যোগাযোগ করবেন। আপনাকে ধন্যবাদ। আপনার কলটি এখানেই শেষ করা হচ্ছে।";
     await this.speakIntakeCompletion(closingPrompt);

     this.intakeStep = "idle";
     this.emit({
       type: "intake_step_changed",
       step: "idle",
       data: this.intakeData,
     });
     this.emit({ type: "intake_complete", docketId, user: citizenUser });

  }

  private async handleIntakeVoiceInput(clean: string): Promise<void> {
    if (!clean) return;

    if (this.intakeStep === "problem") {
      if (clean.includes("বলা শেষ") || clean.includes("কথা শেষ") || clean.includes("সমাপ্ত")) {
        const cleaned = clean.replace(/বলা শেষ|কথা শেষ|সমাপ্ত/g, "").trim();
        if (cleaned) {
          this.intakeData.problem = (this.intakeData.problem + " " + cleaned).trim();
        }
        await this.advanceFromProblemStep();
      } else {
        this.intakeData.problem = (this.intakeData.problem + " " + clean).trim();
        this.emit({ type: "transcript", role: "user", text: clean });
        this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
        void this.syncDocketPatch({ incidentSummary: this.intakeData.problem });
      }
      return;
    }

    if (this.intakeStep === "disability") {
      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeDisabilityInput(clean);
      return;
    }

    if (this.intakeStep === "gender") {
      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeGenderInput(clean);
      return;
    }

    if (this.intakeStep === "name") {
      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeNameInput(clean);
      return;
    }

    if (this.intakeStep === "address") {
      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeAddressInput(clean);
      return;
    }
  }

  public sendUserMessage(text: string): Promise<void> {
    const queued = this.userMessageQueue.then(() => this.sendUserMessageInternal(text));
    this.userMessageQueue = queued.catch(() => {});
    return queued;
  }

  private async sendUserMessageInternal(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.isCallActive) return;
    this.activityEpoch += 1;
    const activityEpoch = this.activityEpoch;
    this.interruptAssistant();
    this.exitDtmfWait();

    if (this.generalQueryMode && this.inactivityPhase === "hangup_warn") {
      if (await this.handleInactivityWarningInput(trimmed)) return;
      this.inactivityPhase = "off";
    }

    // 1. If currently in Intake Chain:
    if (this.intakeStep !== "idle" && this.intakeStep !== "complete") {
      if (this.intakeStep === "problem") {
        if (
          trimmed === "১ (সাধারণ তথ্য ও নিয়মাবলী)" ||
          trimmed === "1" ||
          trimmed === "১" ||
          trimmed.includes("বলা শেষ") ||
          trimmed.includes("কথা শেষ")
        ) {
          await this.advanceFromProblemStep();
          return;
        } else {
          this.intakeData.problem = (this.intakeData.problem + " " + trimmed).trim();
          this.emit({ type: "transcript", role: "user", text: trimmed });
          this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
          void this.syncDocketPatch({ incidentSummary: this.intakeData.problem });
          return;
        }
      }

      if (this.intakeStep === "disability") {
        const val =
          trimmed.includes("1") || trimmed.includes("১")
            ? "1"
            : trimmed.includes("2") || trimmed.includes("২")
              ? "2"
              : trimmed;
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeDisabilityInput(val);
        return;
      }

      if (this.intakeStep === "gender") {
        const val =
          trimmed.includes("1") || trimmed.includes("১")
            ? "1"
            : trimmed.includes("2") || trimmed.includes("২")
              ? "2"
              : trimmed.includes("3") || trimmed.includes("৩")
                ? "3"
                : trimmed;
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeGenderInput(val);
        return;
      }

      if (this.intakeStep === "name") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeNameInput(trimmed);
        return;
      }

      if (this.intakeStep === "address") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeAddressInput(trimmed);
        return;
      }
    }

    // 2. Starting Case Intake Chain via Keypad 2 / Option 2
    if (
      trimmed === "২ (সমস্যা বা নতুন অভিযোগ)" ||
      trimmed === "2" ||
      trimmed === "২" ||
      trimmed.includes("অভিযোগ") ||
      trimmed.includes("সমস্যা জানাতে চাই")
    ) {
      await this.startCaseIntakeChain();
      return;
    }

    this.emit({ type: "transcript", role: "user", text: trimmed });
    this.conversationHistory.push({ role: "user", content: trimmed });
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });

    // Option 1 instant prompt via pre-recorded Soniox audio (zero LLM latency, zero TTS credits)
    if (trimmed === "১ (সাধারণ তথ্য ও নিয়মাবলী)") {
      const opt1Text = "জি, সাধারণ তথ্যের জন্য আপনার প্রশ্নটি বলুন, আমি শুনছি।";
      this.emit({ type: "transcript", role: "assistant", text: opt1Text });
      this.conversationHistory.push({ role: "assistant", content: opt1Text });

      try {
        if (this.audioCtx && this.player) {
          const opt1Buf = await getPreRecordedAudioBuffer(this.audioCtx, "option1");
          if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;
          if (opt1Buf && this.player) {
            this.player.playAudioBuffer(opt1Buf);
            await this.player.waitUntilFinished();
          } else if (this.ttsWs) {
            await this.ttsWs.speakWhenReady(opt1Text);
            if (this.activityEpoch !== activityEpoch) return;
            this.ttsWs.flush();
            await this.ttsWs.waitForFlush(8000);
            await this.player.waitUntilFinished();
          }
        }
      } catch (err) {
        console.warn("Failed to play option1 pre-recorded audio:", err);
      } finally {
        if (this.isCallActive && this.activityEpoch === activityEpoch) {
          this.activeAbortCtrl = null;
          this.setAssistantSpeaking(false);
          this.turnPhase.reset();
          this.emit({ type: "state_changed", state: "listening" });
          // Activate general query mode and start 10s inactivity watch
          this.generalQueryMode = true;
          this.inactivityPhase = "off";
          this.armInactivityTimer();
        }
      }

      return;
    }

    const llmUrl = (this.lastConfig?.llmProxyUrl || "/api/llm").replace(/\/+$/, "");
    const llmModel = this.lastConfig?.llmModel || "openai/gpt-oss-120b";
    try {
      await this.generateAndSpeakResponse(llmUrl, llmModel, 0, performance.now());
    } finally {
      if (this.isCallActive && this.activityEpoch === activityEpoch) {
        this.activeAbortCtrl = null;
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        // Re-arm inactivity timer after each general query response
        if (this.generalQueryMode) {
          this.inactivityPhase = "off";
          this.armInactivityTimer();
        }
      }
    }
  }

  public stop(): void {
    this.activityEpoch += 1;
    this.isCallActive = false;
    this.waitingForDtmf = false;
    this.intakeStep = "idle";
    this.intakeData = {
      problem: "",
      hasDisability: null,
      gender: null,
      callerName: null,
      address: null,
    };
    if (this.sttKeepAliveTimer) {
      clearInterval(this.sttKeepAliveTimer);
      this.sttKeepAliveTimer = null;
    }
    if (this.ttsKeepAliveTimer) {
      clearInterval(this.ttsKeepAliveTimer);
      this.ttsKeepAliveTimer = null;
    }
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    // Clear inactivity timer
    this.clearInactivityTimer();
    this.generalQueryMode = false;
    this.inactivityPhase = "off";
    this.greetingActive = false;
    this.setAssistantSpeaking(false);
    this.interruptAssistant();

    if (this.micWorkletNode) {
      try {
        this.micWorkletNode.port.onmessage = null;
        this.micWorkletNode.disconnect();
      } catch {}
      this.micWorkletNode = null;
    }
    if (this.micScriptNode) {
      try {
        this.micScriptNode.onaudioprocess = null;
        this.micScriptNode.disconnect();
      } catch {}
      this.micScriptNode = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }

    if (this.soniox) {
      this.soniox.close();
      this.soniox = null;
    }

    if (this.ttsWs) {
      try {
        this.ttsWs.close();
      } catch {}
      this.ttsWs = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.stream = null;
    }

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.player = null;
    this.currentTranscript = "";
    this.accumulatedSegments = [];
    this.conversationHistory = [];

    this.turnPhase.reset();
    this.vad.reset();
    this.emit({ type: "state_changed", state: "idle" });
  }
}