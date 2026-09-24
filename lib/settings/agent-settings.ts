/**
 * Agent Settings & Configuration Store
 * Persistent across sessions via browser localStorage with reactive state syncing.
 */

export interface AgentSettings {
  systemPrompt: string;
  greeting: string;
  secondaryPrompt: string;
  llmModel: string;
  voiceId: string;
  language: string;
  halfDuplex: boolean;
}

export const MODELS = [
  { id: "qwen/qwen3.8-27b", name: "qwen/qwen3.8-27b (Recommended - Natural Bengali & Fast)" },
  { id: "openai/gpt-oss-20b", name: "openai/gpt-oss-20b (Groq LPU)" },
  { id: "openai/gpt-oss-120b", name: "openai/gpt-oss-120b (High Reasoning)" },
  { id: "allam-2-7b", name: "allam-2-7b (Fast Lightweight)" },
];

export const VOICES = [
  { id: "Priya", name: "Priya (Indian Female - Recommended for Bangla)" },
  { id: "Dev", name: "Dev (Indian Male - Conversational)" },
  { id: "Aarav", name: "Aarav (Indian Male - Calm & Formal)" },
  { id: "Kavya", name: "Kavya (Indian Female - Soft & Warm)" },
  { id: "Ashok", name: "Ashok (Indian Male - Mature)" },
  { id: "Ishita", name: "Ishita (Indian Female - Cheerful)" },
  { id: "Rohan", name: "Rohan (Indian Male - Energetic)" },
  { id: "Daniel", name: "Daniel (British Male - Classic)" },
];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  systemPrompt:
    "আপনি বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইন (১৬৬৯৯)-এর অত্যন্ত আন্তরিক, সহানুভূতিশীল ও অভিজ্ঞ ভার্চুয়াল আইনি পরামর্শক। সাধারণ মানুষের সাথে কথ্য ও মিষ্টি বাংলায় মাত্র ১-২ বাক্যে সহায়ক উত্তর দিন।",
  greeting:
    "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইনে আপনাকে স্বাগতম।\n" +
    "আপনাকে সঠিক সেবা প্রদান এবং ভবিষ্যতের প্রয়োজনে আমাদের এই কথোপকথনটি রেকর্ড করা হচ্ছে।",
  secondaryPrompt: "সাধারণ তথ্য জানতে ১ চাপুন, কিন্তু কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন।",
  llmModel: "qwen/qwen3.8-27b",
  voiceId: "Priya",
  language: "bn",
  halfDuplex: true,
};

const STORAGE_KEY = "legal_agent_settings_v4";

export function loadAgentSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AGENT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
}

export function saveAgentSettings(settings: AgentSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("legal_agent_settings_updated"));
  } catch (err) {
    console.error("Failed to save agent settings:", err);
  }
}

export function resetAgentSettings(): AgentSettings {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event("legal_agent_settings_updated"));
    } catch {}
  }
  return DEFAULT_AGENT_SETTINGS;
}
