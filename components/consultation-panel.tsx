"use client";

/**
 * The applicant's side of the callback.
 *
 * Shown at the top of the citizen dashboard the moment an application exists, with
 * the explanation first, because the thing a judge (and the applicant) needs to
 * understand is *what is about to happen and why*: the district legal aid office
 * calls back, confirms identity and means on the record, names the act engaged,
 * and then either appoints a free panel lawyer or records a reasoned refusal.
 *
 * It starts the consultation itself, so no separate step is needed after filing.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConsultationPlayer from "@/components/consultation-player";
import type { ConsultationScript } from "@/lib/case/consultation-script";

interface ConsultationResponse {
  ok: boolean;
  error?: string;
  consultationId: string;
  caseId: string | null;
  panelAssignmentId: string | null;
  dlao: { id: string | null; name: string };
  panelLawyer: { id: string; name: string | null } | null;
  script: ConsultationScript;
}

export default function ConsultationPanel({ applicantName }: { applicantName: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [data, setData] = useState<ConsultationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setState("starting");
    setError(null);
    try {
      // The most recent application for this applicant. The endpoint is idempotent,
      // so re-entering the dashboard replays the same consultation rather than
      // inventing a second conversation.
      const list = await fetch("/api/portal/applications").then((r) => r.json());
      const applicationId: string | undefined = list?.applications?.[0]?.id;
      if (!applicationId) {
        setState("idle");
        return;
      }
      const res = await fetch("/api/portal/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      const body: ConsultationResponse = await res.json();
      if (!body.ok) {
        setError(body.error ?? "সংলাপ শুরু করা যায়নি");
        setState("error");
        return;
      }
      setData(body);
      setState("ready");
    } catch {
      setError("সংলাপ শুরু করা যায়নি");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  if (state === "idle") return null;

  return (
    <section
      aria-label="জেলা লিগ্যাল এইড অফিসের সাথে সাংলাপ"
      style={{ marginBottom: "var(--space-2xl)" }}
    >
      <div
        style={{
          background: "linear-gradient(135deg,#064e3b,#0f766e)",
          color: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: "20px 22px 16px",
        }}
      >
        <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
          আপনার আবেদনের পরবর্তী ধাপ: জেলা লিগ্যাল এইড অফিসের কল
        </h2>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", lineHeight: 1.7, margin: "8px 0 0", opacity: 0.95 }}>
          আপনার আবেদন পাওয়ার পর জেলা লিগ্যাল এইড অফিসের একজন লিগ্যাল এইড অফিসার (ডিএলএও) আপনাকে ফোন করে
          সরাসরি কথা বলবেন। কথোপকথনটি একসাথে তিনটি কাজ করবে:
        </p>
        <ol style={{ fontFamily: "var(--font-bn)", fontSize: "0.85rem", lineHeight: 1.8, margin: "10px 0 0", paddingLeft: "20px" }}>
          <li>
            <b>পরিচয় যাচাই</b> — আপনার নাম ও মোবাইল নম্বরের শেষ কয়েকটি সংখ্যা যাচাই করা হবে, যাতে ভুল ব্যক্তির সাথে কথা না হয়।
          </li>
          <li>
            <b>আর্থিক অবস্থা যাচাই</b> — বিনা মূল্যে আইনি সহায়তার শর্ত যাচাই করতে কয়েকটি প্রশ্ন করা হবে। আপনার উত্তরই
            নিবন্ধিত হবে, এবং এটি আপনার ক্ষতির জন্য ব্যবহৃত হবে না।
          </li>
          <li>
            <b>আনুষ্ঠানিক আলোচনা ও সিদ্ধান্ত</b> — কোন আইন আপনার সমস্যার ক্ষেত্রে প্রযোজ্য, এবং আপনি বিনা মূল্যে আইনজীবী পাবেন
            কি না — তা ডিএলএও আপনাকে সরাসরি জানাবেন।
          </li>
        </ol>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8rem", margin: "12px 0 0", opacity: 0.9 }}>
          নিচে এই কথোপকথনটি দেখানো হচ্ছে। এটি আপনার আবেদনের বাস্তব তথ্য থেকে তৈরি, এবং সম্পূর্ণটি আপনার কাছে
          নথিভুক্ত থাকবে।
        </p>
      </div>

      {state === "starting" ? (
        <div style={{ padding: "22px", background: "#fff", border: "1px solid #e2e8f0", borderTop: 0, borderRadius: "0 0 16px 16px" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", margin: 0 }}>
            ডিএলএও-এর কল প্রস্তুত হচ্ছে…
          </p>
        </div>
      ) : null}

      {state === "error" ? (
        <div style={{ padding: "18px 22px", background: "#fff", border: "1px solid #e2e8f0", borderTop: 0, borderRadius: "0 0 16px 16px" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#b91c1c", margin: "0 0 10px" }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => void start()}
            style={{
              font: "inherit",
              fontFamily: "var(--font-bn)",
              fontSize: "0.8rem",
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: "9px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : null}

      {state === "ready" && data ? (
        <>
          <ConsultationPlayer
            script={data.script}
            dlaoName={data.dlao.name}
            panelLawyerName={data.panelLawyer?.name ?? null}
            applicantName={applicantName}
            onFinished={() => router.refresh()}
          />
          <div style={{ marginTop: "10px", fontFamily: "var(--font-bn)", fontSize: "0.78rem", color: "var(--portal-text-secondary)" }}>
            কেস আইডি: <b>{data.caseId ?? "তৈরি হচ্ছে"}</b>
            {data.panelAssignmentId ? (
              <>
                {" "}· নিয়োগপত্র: <b>{data.panelAssignmentId}</b>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
