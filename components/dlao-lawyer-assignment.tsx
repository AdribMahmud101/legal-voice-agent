"use client";

/**
 * Lawyer search and assignment, for the DLAO.
 *
 * The consultation appoints a lawyer automatically, but a DLAO has to be able to
 * choose: match a case to a specialisation, move a case off a lawyer who is not
 * working, or cover a district with nobody on the roster. So this is a real console,
 * not a read-only list.
 *
 * Workload is shown next to every name, because "who is available" is the actual
 * question and a list of names cannot answer it. Ordering puts the least loaded
 * assignable lawyer first, so the common case is one click.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { filterLawyers } from "@/lib/case/lawyer-assignment";
import type { LawyerSummary } from "@/lib/case/lawyer-assignment";
import type { PortalCase } from "@/lib/data/case-projection";

export default function DlaoLawyerAssignment({
  cases,
  onAssigned,
}: {
  cases: PortalCase[];
  onAssigned?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [lawyers, setLawyers] = useState<LawyerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/lawyers", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setLawyers(body.lawyers ?? []);
      else setNotice({ tone: "err", text: body?.error ?? "তালিকা নেওয়া যায়নি।" });
    } catch {
      setNotice({ tone: "err", text: "তালিকা নেওয়া যায়নি।" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtering happens client-side on the already-ranked roster so typing is instant.
  // It reuses the same pure function the server uses, rather than reimplementing the
  // match — the roster is only five rows, and a second copy of the rules is exactly
  // the drift this repo keeps paying for.
  const visibleLawyers = useMemo(() => filterLawyers(lawyers, query), [lawyers, query]);

  const assignableCases = useMemo(
    () => cases.filter((c) => c.status !== "closed" && c.status !== "resolved"),
    [cases],
  );

  const assign = useCallback(
    async (lawyer: LawyerSummary) => {
      if (!selectedCase) {
        setNotice({ tone: "err", text: "প্রথমে যে কেসে আইনজীবী নিয়োগ দিতে হবে সেটি বেছে নিন।" });
        return;
      }
      setBusy(lawyer.id);
      setNotice(null);
      try {
        const res = await fetch("/api/portal/lawyer-assign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseId: selectedCase, panelLawyerId: lawyer.id }),
        });
        const body = await res.json();
        if (body?.ok) {
          setNotice({
            tone: "ok",
            text: body.replaced
              ? `${body.previousLawyerName} এর বদলে ${body.lawyerName} নিয়োগ দেওয়া হয়েছে।`
              : `${body.lawyerName} কে নিয়োগ দেওয়া হয়েছে।`,
          });
          onAssigned?.();
          void load();
        } else {
          setNotice({ tone: "err", text: body?.error ?? "নিয়োগ দেওয়া যায়নি।" });
        }
      } catch {
        setNotice({ tone: "err", text: "নিয়োগ দেওয়া যায়নি।" });
      } finally {
        setBusy(null);
      }
    },
    [selectedCase, onAssigned, load],
  );

  return (
    <section aria-label="আইনজীবী নিয়োগ">
      <style>{`
        .la-wrap { display:grid; gap:16px; }
        @media (min-width:900px) { .la-wrap { grid-template-columns:300px 1fr; align-items:start; } }
        .la-panel { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; }
        .la-h { font:800 11px/1 var(--font-bn); letter-spacing:.5px; text-transform:uppercase; color:#94a3b8; margin:0 0 10px; }
        .la-in { width:100%; min-height:44px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 14px/1.4 var(--font-bn); box-sizing:border-box; }
        .la-csel { width:100%; min-height:44px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 13px/1.4 var(--font-bn); background:#fff; box-sizing:border-box; }
        .la-row { display:flex; gap:12px; align-items:center; padding:13px 14px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; }
        .la-row:last-child { border-bottom:0; }
        .la-av { width:40px; height:40px; border-radius:11px; flex:0 0 40px; display:grid; place-items:center;
          font:800 13px/1 var(--font-bn); background:#0f766e; color:#fff; }
        .la-av.off { background:#cbd5e1; color:#64748b; }
        .la-av.med { background:#7c3aed; }
        .la-n { margin:0; font:800 14.5px/1.35 var(--font-bn); color:#0f172a; }
        .la-m { margin:3px 0 0; font:500 11.5px/1.5 var(--font-bn); color:#64748b; }
        .la-load { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
        .la-chip { font:700 10.5px/1 var(--font-bn); padding:5px 8px; border-radius:999px; background:#f1f5f9; color:#475569; }
        .la-chip.warn { background:#fef3c7; color:#92400e; }
        .la-chip.bad { background:#fee2e2; color:#991b1b; }
        .la-chip.good { background:#d1fae5; color:#065f46; }
        .la-btn { font:inherit; font:700 13px/1 var(--font-bn); min-height:44px; padding:11px 16px; border-radius:10px;
          border:1px solid #0f766e; background:#0f766e; color:#fff; cursor:pointer; }
        .la-btn:disabled { opacity:.5; cursor:not-allowed; }
        .la-note { padding:12px 13px; border-radius:10px; font:600 13px/1.6 var(--font-bn); }
        .la-note.ok { background:#ecfdf5; color:#065f46; }
        .la-note.err { background:#fef2f2; color:#991b1b; }
        .la-empty { padding:20px 14px; text-align:center; font:500 13px/1.6 var(--font-bn); color:#64748b; }
      `}</style>

      <div className="la-wrap">
        <div className="la-panel">
          <h2 className="la-h">কোন কেসে নিয়োগ</h2>
          <select
            className="la-csel"
            value={selectedCase}
            onChange={(e) => {
              setSelectedCase(e.target.value);
              setNotice(null);
            }}
          >
            <option value="">— কেস নির্বাচন করুন —</option>
            {assignableCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.docketId} · {c.applicantName}
              </option>
            ))}
          </select>
          <p className="la-m" style={{ marginTop: 10 }}>
            {assignableCases.length}টি খোলা কেস। কোনো কেসে ইতিমধ্যে আইনজীবী থাকলে নতুন নিয়োগ দিলে পূর্ববর্তী
            নিয়োগটি বন্ধ হয়ে যাবে এবং নতুন আইনজীবীর সময়সীমা নতুন করে শুরু হবে।
          </p>
          {notice ? <div className={`la-note ${notice.tone}`} style={{ marginTop: 12 }} role="status">{notice.text}</div> : null}
        </div>

        <div className="la-panel">
          <h2 className="la-h">প্যানেল আইনজীবীর তালিকা ও ভার</h2>
          <input
            className="la-in"
            placeholder="নাম, বার নিবন্ধন, বিশেষায়ন বা জেলা খুঁজুন…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="আইনজীবী খুঁজুন"
          />

          {loading ? (
            <div className="la-empty">তালিকা নেওয়া হচ্ছে…</div>
          ) : lawyers.length === 0 ? (
            <div className="la-empty">প্যানেল তালিকায় কোনো আইনজীবী নেই।</div>
          ) : visibleLawyers.length === 0 ? (
            <div className="la-empty">"{query}" খুঁজে কোনো আইনজীবী পাওয়া যায়নি।</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {visibleLawyers.map((l) => {
                const off = !l.assignable;
                return (
                  <div key={l.id} className="la-row">
                    <div className={`la-av${off ? " off" : ""}${l.kind === "mediator" ? " med" : ""}`}>
                      {l.name.replace(/^অ্যাডভোকেট\s*/, "").slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <p className="la-n">{l.name}</p>
                      <p className="la-m">
                        {l.barRegistration ? `${l.barRegistration}` : "বার নিবন্ধন নেই"}
                        {l.jurisdiction ? ` · ${l.jurisdiction}` : ""}
                        {l.kind === "mediator" ? " · মধ্যস্থতাকারী" : ""}
                      </p>
                      {l.specialisations ? <p className="la-m">{l.specialisations}</p> : null}
                      <div className="la-load">
                        <span className={`la-chip${l.activeAssignments === 0 ? " good" : ""}`}>
                          {l.activeAssignments}টি সক্রিয় কেস
                        </span>
                        {l.overdueActions > 0 ? (
                          <span className="la-chip bad">{l.overdueActions}টি কাজ দেরিতে</span>
                        ) : null}
                        {off ? <span className="la-chip warn">তালিকায় নেই</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="la-btn"
                      disabled={off || busy === l.id || !selectedCase}
                      onClick={() => void assign(l)}
                      title={off ? "প্যানেল তালিকায় নেই" : undefined}
                    >
                      {busy === l.id ? "নিয়োগ হচ্ছে…" : "নিয়োগ দিন"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
