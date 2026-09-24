"use client";

import { useEffect, useState } from "react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useCaseDocket } from "@/hooks/use-case-docket";
import { PortalView } from "@/components/portal-view";
import { SoftphoneModal } from "@/components/softphone-modal";

export default function Home() {
  const [isSoftphoneOpen, setIsSoftphoneOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const {
     phase,
     sessionId,
     currentUser,
     activeTool,

    intakeStep,
    intakeData,
    transcript,
    metrics,
    start,
    sendMessage,
    stop,
  } = useVoiceSession();

  const docket = useCaseDocket(sessionId);

  const isCallActive =
    phase === "listening" ||
    phase === "speaking" ||
    phase === "dtmf_wait" ||
    phase === "starting" ||
    isConnecting;

  // Track call duration in seconds
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

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleOpenSoftphone = async () => {
    setIsSoftphoneOpen(true);
    // If not already active or connecting, automatically initiate call for effortless 1-tap UX
    if (!isCallActive && phase === "idle") {
      setIsConnecting(true);
      try {
        await start();
      } catch (err) {
        console.error("Auto-start call error:", err);
      } finally {
        setIsConnecting(false);
      }
    }
  };

  return (
    <>
      {/* 1. Main Official Government Portal View */}
      <PortalView
         onOpenSoftphone={handleOpenSoftphone}
         isCallActive={isCallActive}
         currentUser={currentUser}

      />

      {/* 2. Softphone Simulator Popup Modal */}
      <SoftphoneModal
        isOpen={isSoftphoneOpen}
        onClose={() => setIsSoftphoneOpen(false)}
        phase={phase}
         sessionId={sessionId}
         currentUser={currentUser}
         activeTool={activeTool}

        intakeStep={intakeStep}
        intakeData={intakeData}
        transcript={transcript}
        metrics={metrics}
        docket={docket}
        start={start}
        sendMessage={sendMessage}
        stop={stop}
        isConnecting={isConnecting}
        setIsConnecting={setIsConnecting}
      />

      {/* 3. Floating Persistent Active Call Mini-Pill (When Call is Active & Modal is Minimized) */}
      {isCallActive && !isSoftphoneOpen && (
        <div className="active-call-pill">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-xs tracking-wide text-emerald-300">
              ১৬৬৯৯ কল চলছে ({formatDuration(callDuration)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSoftphoneOpen(true)}
              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-full text-xs font-semibold cursor-pointer transition"
            >
              উইন্ডো খুলুন ↗
            </button>
            <button
              onClick={() => {
                stop();
                setIsConnecting(false);
              }}
              className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded-full text-xs font-semibold cursor-pointer transition"
            >
              কেটে দিন ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}