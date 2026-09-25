"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { playDtmfTone } from "@/lib/audio/dtmf";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/roles";
import type { SessionPhase, IntakeStep, IntakeData, TranscriptEntry, LatencyMetrics } from "@/hooks/use-voice-session";
import type { CaseDocket } from "@/lib/agent/memory/docket-store";

const OFFICIAL_GREETING =
  "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইনে আপনাকে স্বাগতম।\n" +
  "আপনাকে সঠিক সেবা প্রদান এবং ভবিষ্যতের প্রয়োজনে আমাদের এই কথোপকথনটি রেকর্ড করা হচ্ছে।";

const OFFICIAL_SECONDARY =
  "সাধারণ তথ্য জানতে ১ চাপুন, কিন্তু কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন।";

const DIALPAD_KEYS = [
  { key: "1", sub: "" },
  { key: "2", sub: "ABC" },
  { key: "3", sub: "DEF" },
  { key: "4", sub: "GHI" },
  { key: "5", sub: "JKL" },
  { key: "6", sub: "MNO" },
  { key: "7", sub: "PQRS" },
  { key: "8", sub: "TUV" },
  { key: "9", sub: "WXYZ" },
  { key: "*", sub: "" },
  { key: "0", sub: "+" },
  { key: "#", sub: "" },
];

const SCENARIOS = [
  {
    title: "ফৌজদারি জামিন (CrPC)",
    desc: "আমার নাম রহিম, ঢাকা থেকে বলছি। আমাকে বিনা কারণে পুলিশ গ্রেপ্তার করেছে, জামিন পাওয়ার উপায় কী?",
  },
  {
    title: "পারিবারিক নির্যাতন ও যৌতুক",
    desc: "আমার নাম ফাতেমা, চট্টগ্রাম থেকে বলছি। স্বামী যৌতুকের জন্য নির্যাতন করে বের করে দিয়েছে, আমি কি বিনা খরচে আইনজীবী পাব?",
  },
  {
    title: "জমিজমা জোরপূর্বক দখল",
    desc: "আমার নাম করিম, কুমিল্লা থেকে বলছি। আমাদের পৈতৃক জমি প্রভাবশালীরা জোর করে দখল করে নিয়েছে, কীভাবে ফেরত পাব?",
  },
  {
    title: "শ্রমিকের বকেয়া বেতন",
    desc: "আমার নাম সুজন, গাজীপুর থেকে বলছি। পোশাক কারখানার মালিক ৩ মাস ধরে বেতন দিচ্ছে না, শ্রম আদালতে কীভাবে প্রতিকার পাব?",
  },
  {
    title: "সাইবার ব্ল্যাকমেইল ও ভুয়া ছবি",
    desc: "আমার নাম নাবিলা, রাজশাহী থেকে বলছি। ফেসবুকে আমার বিকৃত ছবি ছড়িয়ে ব্ল্যাকমেইল করা হচ্ছে, আমি খুব বিপদে আছি।",
  },
  {
    title: "মামলার শুনানির তারিখ ও স্ট্যাটাস",
    desc: "আমি আব্দুল মালেক। বরগুনা অফিসে একটা মামলা দিয়েছিলাম। উকিল ফোন ধরে না, আমার কেস আইডি DLAS-2025-0992, তারিখ জানতে চাই।",
  },
];

interface SoftphoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  phase: SessionPhase;
  sessionId: string | null;
  currentUser: SessionUser | null;
  activeTool: string | null;
  intakeStep: IntakeStep;
  intakeData: IntakeData;
  transcript: TranscriptEntry[];
  metrics: LatencyMetrics | null;
  docket: CaseDocket | null;
  start: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  isConnecting: boolean;
  setIsConnecting: (connecting: boolean) => void;
}

export function SoftphoneModal({
  isOpen,
  onClose,
  phase,
  sessionId,
  currentUser,
  activeTool,
  intakeStep,
  intakeData,
  transcript,
  metrics,
  docket,
  start,
  sendMessage,
  stop,
  isConnecting,
  setIsConnecting,
}: SoftphoneModalProps) {
  const [dialedNumber, setDialedNumber] = useState("16699");
  const [callDuration, setCallDuration] = useState(0);
  const [activeTab, setActiveTab] = useState<"docket" | "transcript" | "tools">("docket");
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const isCallActive =
    phase === "listening" ||
    phase === "speaking" ||
    phase === "dtmf_wait" ||
    phase === "starting" ||
    isConnecting;

  // Call duration counter
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCallActive]);

  // Auto scroll transcript
  useEffect(() => {
    const container = transcriptScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const handleDialKeyPress = (key: string) => {
    playDtmfTone(key);
    if (!isCallActive) {
      if (dialedNumber.length < 10) {
        setDialedNumber((prev) => prev + key);
      }
    } else {
      // In-call Smart IVR DTMF selection
      let dtmfText = key;
      if (intakeStep === "problem") {
        if (key === "1") dtmfText = "১";
      } else if (intakeStep === "disability") {
        if (key === "1") dtmfText = "১";
        else if (key === "2") dtmfText = "২";
       } else if (intakeStep === "gender") {
         if (key === "1") dtmfText = "১";
         else if (key === "2") dtmfText = "২";
         else if (key === "3") dtmfText = "৩";
       } else if (intakeStep === "phone_primary") {
         if (key === "1") dtmfText = "১";
         else if (key === "2") dtmfText = "২";
       } else if (intakeStep === "phone_number") {
         dtmfText = key;
       } else {

        dtmfText =
          key === "1"
            ? "১ (সাধারণ তথ্য ও নিয়মাবলী)"
            : key === "2"
              ? "২ (সমস্যা বা নতুন অভিযোগ)"
              : key === "3"
                ? "৩ (মামলার শুনানির তারিখ ও স্ট্যাটাস DLAS-2025-0992)"
                : key === "9"
                  ? "৯ (জরুরি পুলিশ সহায়তা ও নারী নির্যাতন সেল)"
                  : key;
      }
      void sendMessage(dtmfText);
    }
  };

  const handleStartCall = async () => {
    if (isCallActive) return;
    setIsConnecting(true);
    try {
      await start();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleEndCall = () => {
    stop();
    setIsConnecting(false);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in"
      onClick={(e) => {
        // Prevent background click from suddenly dropping active calls
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
         className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden"

        onClick={(e) => e.stopPropagation()}
      >
        {/* Softphone Dialog Top Header */}
         <div className="bg-emerald-950 text-white px-3 sm:px-5 py-3 flex sm:py-3.5 flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-b border-emerald-900 shrink-0">
           <div className="min-w-0 flex-1 flex items-center gap-3">

            <span className="text-2xl p-1.5 bg-emerald-900/60 rounded-xl">📞</span>
             <div className="min-w-0">
               <div className="flex min-w-0 items-center gap-2">
                 <h3 className="min-w-0 break-words font-bold text-xs sm:text-sm tracking-wide">

                  ১৬৬৯৯ জাতীয় আইনি সহায়তা হেল্পলাইন
                </h3>
                 <span className="hidden sm:inline-flex shrink-0 text-[10px] bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded-full font-mono">

                  NLASO Telephony Simulator
                </span>
              </div>
               <p className="hidden sm:block text-[11px] text-emerald-300">
                 গণপ্রজাতন্ত্রী বাংলাদেশ সরকার • আইন ও বিচার বিভাগ • ১০০% বিনামূল্যে সেবা
               </p>
               {currentUser && (
                 <p className="mt-1 truncate text-[10px] font-semibold text-emerald-200">
                   লগইন: {currentUser.displayName} · {ROLE_LABELS[currentUser.role]}
                 </p>
               )}

            </div>
          </div>

           <div className="ml-auto flex shrink-0 items-center gap-2">
             {isCallActive && (
               <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-900/80 border border-emerald-700 rounded-full text-xs font-mono font-bold text-emerald-200">

                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                কল চলছে: {formatDuration(callDuration)}
              </span>
            )}

            <button
              onClick={onClose}
               className="min-h-11 min-w-11 px-2 sm:px-3 py-2 bg-emerald-900/60 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl border border-emerald-700/60 transition cursor-pointer flex items-center justify-center gap-1"

              title="মিনিমাইজ করে সাইট ব্রাউজ করুন"
            >
              <span>🔽</span>
               <span className="hidden sm:inline">মিনিমাইজ</span>

            </button>

            <button
              onClick={() => {
                if (isCallActive) {
                  const confirmEnd = window.confirm("কল চলছে। আপনি কি কল শেষ করে উইন্ডোটি বন্ধ করতে চান?");
                  if (!confirmEnd) {
                    onClose(); // Just minimize
                    return;
                  }
                  handleEndCall();
                }
                onClose();
              }}
               className="w-11 h-11 rounded-xl bg-emerald-900/60 hover:bg-rose-900/80 text-white flex items-center justify-center font-bold text-sm transition cursor-pointer"

              title="বন্ধ করুন"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Softphone Dialog Main Workspace */}
         <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 bg-slate-50/70 scroll-pb-4">
           {/* LEFT COLUMN: Dialpad & Voice Controls (5 cols) */}
           <div className="md:col-span-5 flex flex-col gap-4 min-w-0">

            {/* Phone Screen & Live Status */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-inner border border-slate-800 flex flex-col items-center justify-center gap-2 relative overflow-hidden">
              <div className="absolute top-3 left-4 flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isCallActive
                      ? phase === "speaking"
                        ? "bg-blue-400 animate-pulse"
                        : "bg-emerald-400 animate-ping"
                      : "bg-slate-600"
                  }`}
                />
                <span className="text-[11px] font-mono tracking-wider text-slate-400">
                  {isCallActive ? "CONNECTED" : "STANDBY"}
                </span>
              </div>

              <div className="text-3xl font-mono font-bold tracking-widest text-emerald-400 mt-2">
                {dialedNumber}
              </div>

              {/* Live Voice Activity State */}
              <div className="min-h-[46px] flex flex-col items-center justify-center text-center">
                {isCallActive ? (
                  phase === "speaking" ? (
                    <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold">
                      <span className="animate-spin text-sm">🤖</span>
                      <span>আইনি সহকারী কথা বলছেন...</span>
                    </div>
                  ) : phase === "listening" ? (
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <span className="text-base animate-pulse">🎙️</span>
                      <span>আপনার কথা শুনছি — মুখে বলুন</span>
                    </div>
                  ) : phase === "dtmf_wait" ? (
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                      <span>⌨️</span>
                      <span>ডায়ালপ্যাডের সংখ্যা চাপুন বা মুখে বলুন</span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">কল প্রক্রিয়াধীন...</div>
                  )
                ) : (
                  <div className="text-xs text-slate-400">
                    কল শুরু করতে নিচের সবুজ বাটনে চাপুন
                  </div>
                )}
              </div>

              {/* Audio Wave Visualizer */}
              <div className="flex items-center gap-1 h-5 mt-1">
                {[12, 24, 18, 28, 16, 22, 14, 20, 10, 26, 15].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isCallActive
                        ? phase === "speaking"
                          ? "bg-blue-400"
                          : "bg-emerald-400"
                        : "bg-slate-700"
                    }`}
                    style={{
                      height: isCallActive ? `${Math.max(6, (h * (i % 2 === 0 ? 1 : 0.8)))}px` : "4px",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Accessible Call Control Button for Illiterate Callers */}
            {!isCallActive ? (
              <button
                onClick={handleStartCall}
                disabled={isConnecting}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-3 transition cursor-pointer border-2 border-emerald-500"
              >
                <span className="text-2xl animate-bounce">📞</span>
                <span>কল শুরু করুন (১৬৬৯৯)</span>
              </button>
            ) : (
              <button
                onClick={handleEndCall}
                className="w-full py-4 px-6 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold text-lg rounded-2xl shadow-lg shadow-rose-600/30 flex items-center justify-center gap-3 transition cursor-pointer border-2 border-rose-500"
              >
                <span className="text-2xl">🛑</span>
                <span>কল শেষ করুন (Hang Up)</span>
              </button>
            )}

            {/* Case Intake Stepper Banner (When Keypad 2 is Active) */}
            {intakeStep !== "idle" && (
              <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-3.5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <span>📋</span>
                    <span>আইনি অভিযোগ ও কেস নথিভুক্তি (Case Intake)</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                      {intakeStep === "problem"
                        ? "ধাপ ১: সমস্যা বর্ণনা"
                        : intakeStep === "disability"
                        ? "ধাপ ২: প্রতিবন্ধী সুবিধা"
                        : intakeStep === "disability_type"
                        ? "ধাপ ৩: প্রতিবন্ধকতার ধরন"
                        : intakeStep === "gender"
                        ? "ধাপ ৪: লিঙ্গ"
                        : intakeStep === "name"
                        ? "ধাপ ৫: পূর্ণ নাম"
                        : intakeStep === "phone_primary"
                        ? "ধাপ ৬: ফোন নম্বর নিশ্চিত করুন"
                        : intakeStep === "phone_number"
                        ? "ধাপ ৭: যোগাযোগের নম্বর"
                        : intakeStep === "address"
                        ? "ধাপ ৮: জেলা ও ঠিকানা"
                        : "নথিভুক্তি সম্পন্ন"}


                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-center text-[10px] font-semibold">
                  <div
                    className={`p-1.5 rounded-lg border ${
                      intakeStep === "problem"
                        ? "bg-emerald-700 text-white border-emerald-800"
                        : intakeData.problem
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                    ১. সমস্যা
                  </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "disability"
                         ? "bg-emerald-700 text-white border-emerald-800"
                         : intakeData.hasDisability !== undefined && intakeData.hasDisability !== null
                         ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                         : "bg-white text-slate-400 border-slate-200"
                     }`}
                   >
                     ২. সুবিধা
                   </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "disability_type"
                         ? "bg-emerald-700 text-white border-emerald-800"
                         : intakeData.disabilityType
                         ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                         : "bg-white text-slate-400 border-slate-200"
                     }`}
                   >
                     ৩. ধরন
                   </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "gender"

                        ? "bg-emerald-700 text-white border-emerald-800"
                        : intakeData.gender
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                     ৪. লিঙ্গ

                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      intakeStep === "name"
                        ? "bg-emerald-700 text-white border-emerald-800"
                        : intakeData.callerName
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                     ৫. নাম

                  </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "phone_primary"
                         ? "bg-emerald-700 text-white border-emerald-800"
                         : intakeData.phonePrimary !== undefined && intakeData.phonePrimary !== null
                         ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                         : "bg-white text-slate-400 border-slate-200"
                     }`}
                   >
                     ৬. ফোন
                   </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "phone_number"
                         ? "bg-emerald-700 text-white border-emerald-800"
                         : intakeData.phone
                         ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                         : "bg-white text-slate-400 border-slate-200"
                     }`}
                   >
                     ৭. নম্বর
                   </div>
                   <div
                     className={`p-1.5 rounded-lg border ${
                       intakeStep === "address"
                         ? "bg-emerald-700 text-white border-emerald-800"
                         : intakeData.address
                         ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                         : "bg-white text-slate-400 border-slate-200"
                     }`}
                   >
                     ৮. ঠিকানা
                   </div>

                </div>

                <div className="mt-2 text-[11px] text-emerald-950 bg-emerald-100/70 p-2 rounded-xl">
                  {intakeStep === "problem" && (
                    <span>🎙️ আপনার সমস্যা মুখে বলুন। কথা বলা শেষ হলে ডায়ালপ্যাডের <strong>১</strong> চাপুন।</span>
                  )}
                   {intakeStep === "disability" && (
                     <span>🎙️ শারীরিক বা বিশেষ প্রতিবন্ধকতা আছে কি? মুখে <strong>হ্যাঁ/না</strong> বলুন অথবা কীপ্যাডে <strong>১ বা ২</strong> চাপুন।</span>
                   )}
                   {intakeStep === "disability_type" && (
                     <span>🎙️ কোন ধরনের প্রতিবন্ধকতা আছে? যেমন <strong>দৃষ্টি, শ্রবণ, চলাফেরা, বাক, মানসিক</strong> বা অন্য কিছু বলুন।</span>
                   )}
                   {intakeStep === "gender" && (

                    <span>🎙️ আপনার লিঙ্গ কী? মুখে <strong>পুরুষ/নারী</strong> বলুন অথবা কীপ্যাডে <strong>১ বা ২</strong> চাপুন।</span>
                  )}
                   {intakeStep === "name" && (
                     <span>🎙️ আপনার পূর্ণ নামটি স্পষ্ট করে বলুন।</span>
                   )}
                   {intakeStep === "phone_primary" && (
                     <span>🎙️ এই ফোন নম্বরটি কি আপনার প্রাথমিক নম্বর, যেখানে আমরা আপনাকে ফোন করতে পারি? <strong>হ্যাঁ/না</strong> বলুন।</span>
                   )}
                   {intakeStep === "phone_number" && (
                     <span>🎙️ যোগাযোগের ১১ সংখ্যার ফোন নম্বর লিখুন। এখন: <strong>{intakeData.phoneDraft || "—"}</strong></span>
                   )}
                   {intakeStep === "address" && (

                    <span>🎙️ আপনার জেলা এবং এলাকার ঠিকানাটি বলুন।</span>
                  )}
                  {intakeStep === "complete" && (
                    <span className="font-bold text-emerald-800">✅ কেস সফলভাবে নথিভুক্ত হয়েছে! ডকেট কার্ডে তথ্য সংরক্ষিত।</span>
                  )}
                </div>
              </div>
            )}

            {/* Smart IVR Dialpad */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
                <span>স্মার্ট আইভিআর ডায়ালপ্যাড</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Dual-Modal (Voice / Keypad)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {DIALPAD_KEYS.map(({ key, sub }) => {
                  let stepBadge = "";
                  let isHighlighted = false;

                  if (intakeStep === "problem" && key === "1") {
                    stepBadge = "বলা শেষ";
                    isHighlighted = true;
                  } else if (intakeStep === "disability") {
                    if (key === "1") {
                      stepBadge = "হ্যাঁ";
                      isHighlighted = true;
                    } else if (key === "2") {
                      stepBadge = "না";
                      isHighlighted = true;
                    }
                   } else if (intakeStep === "gender") {
                     if (key === "1") {
                       stepBadge = "পুরুষ";
                       isHighlighted = true;
                     } else if (key === "2") {
                       stepBadge = "নারী";
                       isHighlighted = true;
                     } else if (key === "3") {
                       stepBadge = "অন্যান্য";
                       isHighlighted = true;
                     }
                   } else if (intakeStep === "phone_primary") {
                     if (key === "1") {
                       stepBadge = "হ্যাঁ";
                       isHighlighted = true;
                     } else if (key === "2") {
                       stepBadge = "না";
                       isHighlighted = true;
                     }
                   }


                  return (
                    <button
                      key={key}
                      onClick={() => handleDialKeyPress(key)}
                      className={`h-14 rounded-2xl flex flex-col items-center justify-center transition active:scale-95 cursor-pointer relative overflow-hidden border ${
                        isHighlighted
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                      }`}
                    >
                      <span className="text-xl font-bold leading-none">{key}</span>
                      {stepBadge ? (
                        <span className="text-[9px] font-extrabold tracking-wider uppercase mt-0.5 text-emerald-100 bg-emerald-900/60 px-1.5 py-0.2 rounded-full">
                          {stepBadge}
                        </span>
                      ) : sub ? (
                        <span className="text-[9px] text-slate-400 font-medium tracking-widest leading-none mt-0.5">
                          {sub}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Quick IVR Option Shortcut Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => handleDialKeyPress("1")}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left text-xs transition cursor-pointer"
                >
                  <div className="font-bold text-slate-800">১. সাধারণ তথ্য</div>
                  <div className="text-[10px] text-slate-500">যোগ্যতা ও নিয়মাবলী</div>
                </button>
                <button
                  onClick={() => handleDialKeyPress("2")}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left text-xs transition cursor-pointer"
                >
                  <div className="font-bold text-slate-800">২. নতুন অভিযোগ</div>
                  <div className="text-[10px] text-slate-500">কেস ইনটেক ও ডকেট</div>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Docket & Transcript (7 cols) */}
           <div className="md:col-span-7 flex min-w-0 flex-col gap-4">
             {/* Tab Navigation */}
             <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
               <div className="flex min-w-0 flex-1 items-center gap-2">

                <button
                  onClick={() => setActiveTab("docket")}
                   className={`min-h-11 flex-1 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer sm:flex-none ${

                    activeTab === "docket"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  📋 লাইভ কেস ডকেট
                </button>
                <button
                  onClick={() => setActiveTab("transcript")}
                   className={`min-h-11 flex-1 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer sm:flex-none ${

                    activeTab === "transcript"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  💬 কথোপকথন ({transcript.length})
                </button>
              </div>

              {metrics && (
                 <span className="max-w-full truncate text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">

                  Latency: <span className="text-emerald-700 font-bold">{metrics.total_voice_latency_ms}ms</span>
                </span>
              )}
            </div>

            {/* TAB 1: Real-Time Structured Case Docket */}
            {activeTab === "docket" && (
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                 <div className="flex flex-col items-start gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                   <div className="flex min-w-0 items-center gap-2">

                    <span className="text-xl">📁</span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        সরকারি আইনি সহায়তা আবেদনপত্র (Case Docket)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        কথোপকথন চলাকালীন স্বয়ংক্রিয়ভাবে পূরণকৃত ডেটা
                      </p>
                    </div>
                  </div>
                  {docket?.docketId ? (
                     <div className="text-left sm:text-right">

                      <span className="text-[9px] uppercase font-semibold text-slate-500 block">
                        অফিসিয়াল ডকেট আইডি
                      </span>
                      <span className="font-mono text-sm font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                        {docket.docketId}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      ডকেট আইডি তৈরি হচ্ছে...
                    </span>
                  )}
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                  {/* Caller Name */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      কলার ও আবেদনকারী
                    </span>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {docket?.callerName || intakeData?.callerName || (
                        <span className="text-slate-400 font-normal italic">অপেক্ষা করা হচ্ছে...</span>
                      )}
                    </div>
                  </div>

                  {/* District / Thana */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      এখতিয়ারভুক্ত এলাকা (জেলা ও থানা)
                    </span>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {docket?.district || intakeData?.address ? (
                        `${docket?.district || intakeData?.address} ${docket?.thana ? `(${docket.thana})` : ""}`
                      ) : (
                        <span className="text-slate-400 font-normal italic">অপেক্ষা করা হচ্ছে...</span>
                      )}
                    </div>
                  </div>

                  {/* Gender & Disability */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      লিঙ্গ ও বিশেষ সুবিধা
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      {(docket?.gender || intakeData?.gender) ? (
                        <span className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          {(docket?.gender || intakeData?.gender) === "male"
                            ? "পুরুষ"
                            : (docket?.gender || intakeData?.gender) === "female"
                            ? "নারী"
                            : (docket?.gender || intakeData?.gender) === "other"
                            ? "অন্যান্য"
                            : (docket?.gender || intakeData?.gender)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">অপেক্ষমান...</span>
                      )}

                      {(docket?.hasDisability ?? intakeData?.hasDisability) !== undefined &&
                      (docket?.hasDisability ?? intakeData?.hasDisability) !== null ? (
                        (docket?.hasDisability ?? intakeData?.hasDisability) ? (
                          <span className="text-xs font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            ♿ প্রতিবন্ধী সুবিধা প্রযোজ্য
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-full">
                            প্রতিবন্ধকতা নেই
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>

                  {/* Free Aid Eligibility */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      বিনামূল্যে আইনি সহায়তা যোগ্যতা (NLASO)
                    </span>
                    <div className="mt-1">
                      {(docket?.hasDisability ?? intakeData?.hasDisability) ? (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          ✓ ১০০% অগ্রাধিকারভিত্তিক আইনজীবী
                        </span>
                      ) : docket?.eligibilityStatus === "eligible_100_free" ? (
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          ✓ ১০০% বিনামূল্যে আইনজীবী পাওয়ার যোগ্য
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          তথ্য যাচাই প্রক্রিয়াধীন...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Legal Category */}
                   <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 md:col-span-2">

                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      মামলা / আইনি বিষয়ের ক্যাটাগরি
                    </span>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {docket?.category ? (
                        <span className="capitalize text-emerald-800 font-medium">
                          {docket.category.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">অপেক্ষা করা হচ্ছে...</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Incident Summary */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    আইনি সমস্যার সারসংক্ষেপ (Extracted Facts)
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {docket?.incidentSummary || intakeData?.problem || (
                      <span className="text-slate-400 italic">
                        কথোপকথন থেকে সারসংক্ষেপ তৈরির অপেক্ষায়...
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: Live Conversation Transcript */}
            {activeTab === "transcript" && (
               <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col h-[min(400px,55dvh)] min-h-[260px]">

                <div className="text-xs font-semibold text-slate-600 border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                  <span>কথোপকথন হিস্টোরি (Live Transcript)</span>
                  <span className="text-[10px] text-slate-500">রিয়েল-টাইম অডিও স্ট্রিম</span>
                </div>

                 <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto overscroll-contain space-y-3 pr-2 scrollbar-thin">
                  {transcript.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <span className="text-3xl mb-2">📞</span>
                      <p className="text-xs">কল সংযোগ হলে এখানে বাংলা কথোপকথন দেখা যাবে</p>
                    </div>
                  ) : (
                    transcript.map((item, index) => (
                      <div
                        key={index}
                        className={`flex flex-col ${
                          item.role === "assistant" ? "items-start" : "items-end"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {item.role === "assistant" ? "🤖 ১৬৬৯৯ আইনি সহকারী" : "👤 আপনি (কলার)"}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed ${
                            item.role === "assistant"
                              ? "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200"
                              : "bg-emerald-700 text-white rounded-tr-none font-medium"
                          }`}
                        >
                          {item.text}
                        </div>
                      </div>
                    ))
                  )}
                   <div aria-hidden="true" />

                </div>
              </div>
            )}

            {/* Test Scenarios Quick Select */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
              <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                💡 দ্রুত টেস্ট সিনারিও (মাইক ছাড়া এক ক্লিকে পরীক্ষা করুন):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SCENARIOS.slice(0, 4).map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!isCallActive) {
                        void handleStartCall().then(() => {
                          setTimeout(() => void sendMessage(s.desc), 1200);
                        });
                      } else {
                        void sendMessage(s.desc);
                      }
                      setActiveTab("transcript");
                    }}
                     className="min-h-9 text-[10px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 px-2 py-1.5 rounded-lg transition cursor-pointer"

                  >
                    📌 {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
