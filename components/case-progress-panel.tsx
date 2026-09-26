"use client";

/**
 * The applicant's case: who their lawyer is, what is happening, and how to complain.
 *
 * All three were missing. The dashboard said "no case found" on a case that existed,
 * the lawyer who had just been appointed was invisible, and there was no way to
 * register that the lawyer was not doing their job — which is the single most common
 * real failure in a legal aid scheme.
 *
 * The stage list is driven by `lib/case/domain.ts` and the same
 * `STAGE_LABELS_BN` the API returns, so the applicant's view cannot drift from the
 * DLAO's.
 */

import { useCallback, useEffect, useState } from "react";
import type { CitizenCaseView } from "@/lib/data/citizen-case-view";

const REASONS = [
  { code: "not_contacted", bn: "আইনজীবী যোগাযোগ করেননি" },
  { code: "too_slow", bn: "অনেক দেরিতে কাজ হচ্ছে" },
  { code: "not_listening", bn: "আমার কথা ভালোভাবে শোনেন না" },
  { code: "unprofessional", bn: "আচরণ পেশাদার নয়" },
  { code: "demanded_money", bn: "অর্থ চেয়েছেন" },
  { code: "refused_after_assignment", bn: "নিয়োগের পর কাজ করতে অস্বীকার করেছেন" },
  { code: "other", bn: "অন্য কোনো কারণ" },
] as const;

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
}

export default function CaseProgressPanel({ refreshToken = 0 }: { refreshToken?: number }) {
  const [cases, setCases] = useState<CitizenCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState<{ assignmentId: string; lawyer: string } | null>(null);
  const [reason, setReason] = useState<string>(REASONS[0].code);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/my-case", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCases(body.cases ?? []);
    } catch {
      /* leave the list empty; the section simply does not render */
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-runs whenever the consultation reports in. Without this the panel showed a
  // snapshot taken before the case existed: one step, no lawyer, no timeline.
  useEffect(() => {
    setLoading(false);
    void load();
  }, [load, refreshToken]);

  const submitComplaint = useCallback(async () => {
    if (!reporting) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/lawyer-complaint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId: reporting.assignmentId, reasonCode: reason, detailsBn: details }),
      });
      const body = await res.json();
      if (body?.ok) {
        setNotice({ tone: "ok", text: "আপনার অভিযোগটি গ্রহণ করা হয়েছে। জেলা লিগ্যাল এইড অফিস পর্যালোচনা করবে।" });
        setReporting(null);
        setDetails("");
      } else {
        setNotice({ tone: "err", text: body?.error ?? "অভিযোগ জমা দেওয়া যায়নি।" });
      }
    } catch {
      setNotice({ tone: "err", text: "অভিযোগ জমা দেওয়া যায়নি। আবার চেষ্টা করুন।" });
    } finally {
      setBusy(false);
    }
  }, [reporting, reason, details]);

  if (loading) return null;
  if (cases.length === 0) return null;

  return (
    <section aria-label="আমার মামলার অগ্রগতি" style={{ marginBottom: "var(--space-2xl)" }}>
      <style>{`
        .cp-card { border:1px solid #e2e8f0; border-radius:18px; background:#fff; overflow:hidden;
          box-shadow:0 1px 3px rgba(15,23,42,.05); margin-bottom:18px; }
        .cp-top { display:flex; gap:12px; align-items:flex-start; justify-content:space-between;
          padding:18px 20px 14px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; }
        .cp-docket { font:800 13px/1.2 var(--font-bn); color:#0f766e; letter-spacing:.3px; }
        .cp-title { margin:5px 0 0; font:800 17px/1.4 var(--font-bn); color:#0f172a; }
        .cp-badge { font:800 11px/1 var(--font-bn); padding:6px 11px; border-radius:999px;
          background:#ecfdf5; color:#047857; white-space:nowrap; }
        .cp-badge.sensitive { background:#fef2f2; color:#b91c1c; }

        .cp-steps { display:flex; gap:0; padding:20px 20px 6px; overflow-x:auto; }
        .cp-step { flex:1 0 0; min-width:96px; position:relative; text-align:center; }
        .cp-dot { width:26px; height:26px; border-radius:50%; margin:0 auto; display:grid;
          place-items:center; font:800 11px/1 var(--font-bn); position:relative; z-index:2;
          background:#e2e8f0; color:#94a3b8; border:2px solid #fff; }
        .cp-step.done .cp-dot { background:#0f766e; color:#fff; }
        .cp-step.current .cp-dot { background:#0f766e; color:#fff;
          box-shadow:0 0 0 4px rgba(15,118,110,.18); }
        .cp-step::before { content:""; position:absolute; top:13px; left:-50%; width:100%;
          height:2px; background:#e2e8f0; z-index:1; }
        .cp-step:first-child::before { display:none; }
        .cp-step.done::before, .cp-step.current::before { background:#0f766e; }
        .cp-lbl { margin:8px 4px 0; font:700 11px/1.35 var(--font-bn); color:#64748b; }
        .cp-step.current .cp-lbl { color:#0f766e; }
        .cp-step.done .cp-lbl { color:#334155; }
        .cp-next { margin:14px 20px 0; padding:11px 13px; border-radius:11px; background:#f0fdfa;
          border-left:4px solid #0f766e; font:600 13px/1.6 var(--font-bn); color:#134e4a; }

        .cp-lawyer { margin:16px 20px 0; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden; }
        .cp-lawyer-hd { display:flex; gap:12px; align-items:center; padding:14px 16px;
          background:linear-gradient(135deg,#f8fafc,#f1f5f9); border-bottom:1px solid #e2e8f0; }
        .cp-ava { width:44px; height:44px; border-radius:12px; flex:0 0 44px; display:grid;
          place-items:center; background:#0f766e; color:#fff; font:800 15px/1 var(--font-bn); }
        .cp-lname { margin:0; font:800 15px/1.3 var(--font-bn); color:#0f172a; }
        .cp-lrole { margin:2px 0 0; font:600 11.5px/1.4 var(--font-bn); color:#64748b; }
        .cp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; padding:15px 16px; }
        .cp-k { font:700 10.5px/1.3 var(--font-bn); color:#94a3b8; text-transform:uppercase; letter-spacing:.4px; }
        .cp-v { margin:3px 0 0; font:600 13px/1.5 var(--font-bn); color:#1e293b; word-break:break-word; }
        .cp-foot { display:flex; gap:9px; flex-wrap:wrap; padding:0 16px 15px; }
        .cp-btn { font:inherit; font:700 12.5px/1 var(--font-bn); padding:10px 15px; border-radius:10px;
          border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; }
        .cp-btn:hover { background:#f8fafc; }
        .cp-btn.report { border-color:#fecaca; color:#b91c1c; background:#fff5f5; }
        .cp-btn.report:hover { background:#fee2e2; }
        .cp-btn:disabled { opacity:.55; cursor:not-allowed; }

        .cp-tl { margin:16px 20px 18px; border-top:1px solid #f1f5f9; padding-top:14px; }
        .cp-tl h4 { margin:0 0 10px; font:800 12px/1 var(--font-bn); color:#64748b;
          text-transform:uppercase; letter-spacing:.4px; }
        .cp-tl-row { display:flex; gap:11px; padding:7px 0; }
        .cp-tl-dot { width:9px; height:9px; border-radius:50%; background:#0f766e; margin-top:5px; flex:0 0 9px; }
        .cp-tl-b { font:700 12.5px/1.4 var(--font-bn); color:#1e293b; }
        .cp-tl-m { margin:2px 0 0; font:500 11.5px/1.5 var(--font-bn); color:#64748b; }

        .cp-note { margin:14px 20px 18px; padding:11px 13px; border-radius:10px; font:600 12.5px/1.6 var(--font-bn); }
        .cp-note.ok { background:#ecfdf5; color:#065f46; }
        .cp-note.err { background:#fef2f2; color:#991b1b; }

        .cp-modal { position:fixed; inset:0; z-index:10001; background:rgba(2,6,23,.7);
          display:grid; place-items:center; padding:18px; }
        .cp-modal-box { width:100%; max-width:460px; background:#fff; border-radius:16px; padding:22px;
          box-shadow:0 24px 60px rgba(2,6,42,.4); }
        .cp-modal-box h3 { margin:0 0 6px; font:800 17px/1.3 var(--font-bn); color:#0f172a; }
        .cp-modal-box p { margin:0 0 14px; font:500 13px/1.6 var(--font-bn); color:#64748b; }
        .cp-reasons { display:grid; gap:8px; max-height:230px; overflow-y:auto; margin-bottom:14px; }
        .cp-reason { display:flex; gap:9px; align-items:center; padding:10px 12px; border-radius:10px;
          border:1px solid #e2e8f0; font:600 13px/1.4 var(--font-bn); color:#1e293b; cursor:pointer; }
        .cp-reason:hover { background:#f8fafc; }
        .cp-reason.sel { border-color:#0f766e; background:#f0fdfa; }
        .cp-ta { width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 13px/1.6 var(--font-bn); resize:vertical; box-sizing:border-box; }
        .cp-actions { display:flex; gap:9px; justify-content:flex-end; margin-top:16px; }
      `}</style>

      {cases.map((c) => (
        <div key={c.caseId} className="cp-card">
          <div className="cp-top">
            <div style={{ minWidth: 0 }}>
              <div className="cp-docket">{c.docketId}</div>
              <h3 className="cp-title">{c.problem}</h3>
            </div>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              {c.sensitive ? <span className="cp-badge sensitive">সংবেদনশীল কেস</span> : null}
              <span className="cp-badge">{c.stageLabelBn}</span>
            </div>
          </div>

          {/* stepper */}
          <div className="cp-steps" role="list" aria-label="কেসের অগ্রগতি">
            {c.stages.map((s) => (
              <div key={s.key} role="listitem" className={`cp-step ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
                <div className="cp-dot">{s.state === "done" ? "✓" : ""}</div>
                <p className="cp-lbl">{s.labelBn}</p>
              </div>
            ))}
          </div>
          <p className="cp-next">{c.stageNextBn}</p>

          {/* eligibility, as it was decided */}
          <div style={{ margin: "14px 20px 0", padding: "12px 14px", borderRadius: 11, background: c.eligibility.eligible ? "#ecfdf5" : "#fffbeb", borderLeft: `4px solid ${c.eligibility.eligible ? "#059669" : "#d97706"}` }}>
            <div style={{ font: "800 10.5px/1 var(--font-bn)", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".4px" }}>
              সহায়তার সিদ্ধান্ত
            </div>
            <p style={{ margin: "6px 0 0", font: "600 13px/1.65 var(--font-bn)", color: "#1e293b" }}>
              {c.eligibility.assuranceBn}
            </p>
            <p style={{ margin: "7px 0 0", font: "500 11.5px/1.5 var(--font-bn)", color: "#64748b" }}>
              প্রযোজ্য আইন: {c.eligibility.actBn}
              {c.eligibility.basisBn ? ` · ভিত্তি: ${c.eligibility.basisBn}` : ""}
            </p>
          </div>

          {/* lawyer */}
          {c.lawyer ? (
            <div className="cp-lawyer">
              <div className="cp-lawyer-hd">
                <div className="cp-ava">আই</div>
                <div style={{ minWidth: 0 }}>
                  <p className="cp-lname">{c.lawyer.name}</p>
                  <p className="cp-lrole">
                    প্যানেল আইনজীবী
                    {c.lawyer.jurisdiction ? ` · ${c.lawyer.jurisdiction}` : ""}
                  </p>
                </div>
              </div>
              <div className="cp-grid">
                {c.lawyer.barRegistration ? (
                  <div>
                    <div className="cp-k">বার নিবন্ধন</div>
                    <p className="cp-v">{c.lawyer.barRegistration}</p>
                  </div>
                ) : null}
                {c.lawyer.phone ? (
                  <div>
                    <div className="cp-k">যোগাযোগ</div>
                    <p className="cp-v">{c.lawyer.phone}</p>
                  </div>
                ) : null}
                {c.lawyer.specialisations ? (
                  <div>
                    <div className="cp-k">বিশেষায়ন</div>
                    <p className="cp-v">{c.lawyer.specialisations}</p>
                  </div>
                ) : null}
                <div>
                  <div className="cp-k">নিয়োগ</div>
                  <p className="cp-v">{fmtDate(c.lawyer.assignedAt)}</p>
                </div>
                {c.lawyer.assignedByName ? (
                  <div>
                    <div className="cp-k">যিনি নিয়োগ করেছেন</div>
                    <p className="cp-v">{c.lawyer.assignedByName}</p>
                  </div>
                ) : null}
              </div>
              <div className="cp-foot">
                <a className="cp-btn" href={`tel:${c.lawyer.phone ?? ""}`} aria-disabled={!c.lawyer.phone}>
                  আইনজীবীকে কল করুন
                </a>
                <button
                  type="button"
                  className="cp-btn report"
                  onClick={() => {
                    setReporting({ assignmentId: c.lawyer!.assignmentId, lawyer: c.lawyer!.name });
                    setReason(REASONS[0].code);
                    setNotice(null);
                  }}
                >
                  আইনজীবীর কাজ নিয়ে অভিযোগ
                </button>
              </div>
            </div>
          ) : (
            <div style={{ margin: "16px 20px", padding: "13px 15px", borderRadius: 11, background: "#fffbeb", borderLeft: "4px solid #d97706" }}>
              <div style={{ font: "800 12.5px/1.4 var(--font-bn)", color: "#92400e" }}>এখনো কোনো আইনজীবী নিয়োগ হয়নি</div>
              <p style={{ margin: "5px 0 0", font: "500 12px/1.6 var(--font-bn)", color: "#78350f" }}>
                আপনার আবেদনটি যাচাই ও পর্যালোচনার অপেক্ষায় আছে। ডিএলএও ঐতিহাসিক কারণ ও প্রয়োজনীয়তা বিবেচনা করে সিদ্ধান্ত নেবেন।
              </p>
            </div>
          )}

          {/* timeline */}
          {c.timeline.length > 0 ? (
            <div className="cp-tl">
              <h4>যা যা হয়েছে</h4>
              {c.timeline.map((t, i) => (
                <div key={i} className="cp-tl-row">
                  <span className="cp-tl-dot" />
                  <div>
                    <div className="cp-tl-b">{t.labelBn}</div>
                    {t.note ? <p className="cp-tl-m">{t.note}</p> : null}
                    <p className="cp-tl-m">
                      {fmtDate(t.at)}
                      {t.byName ? ` · ${t.byName}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {notice ? (
            <div className={`cp-note ${notice.tone === "ok" ? "ok" : "err"}`} role="status">
              {notice.text}
            </div>
          ) : null}
        </div>
      ))}

      {reporting ? (
        <div className="cp-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setReporting(null); }}>
          <div className="cp-modal-box" role="dialog" aria-modal="true" aria-label="আইনজীবীর কাজ নিয়ে অভিযোগ">
            <h3>আইনজীবীর কাজ নিয়ে অভিযোগ</h3>
            <p>
              আপনার অভিযোগটি জেলা লিগ্যাল এইড অফিসের কাছে পৌঁছে যাবে এবং তারা পর্যালোচনা করবে।
              নিয়োগপত্র: {reporting.lawyer}
            </p>
            <div className="cp-reasons">
              {REASONS.map((r) => (
                <label key={r.code} className={`cp-reason${reason === r.code ? " sel" : ""}`}>
                  <input
                    type="radio"
                    name="complaint-reason"
                    checked={reason === r.code}
                    onChange={() => setReason(r.code)}
                  />
                  <span>{r.bn}</span>
                </label>
              ))}
            </div>
            <textarea
              className="cp-ta"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="আপনার অভিযোগের বিবরণ লিখুন (ঐচ্ছিক)"
              maxLength={2000}
            />
            <div className="cp-actions">
              <button type="button" className="cp-btn" onClick={() => setReporting(null)} disabled={busy}>
                বাতিল
              </button>
              <button type="button" className="cp-btn report" onClick={() => void submitComplaint()} disabled={busy}>
                {busy ? "পাঠানো হচ্ছে…" : "অভিযোগ পাঠান"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
