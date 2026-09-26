"use client";

/**
 * The Chief DLAO console.
 *
 * Supervisory and approval-only, per the guide: the Chief certifies settlements, approves
 * payments, maintains the panel list and supervises the office, while day-to-day case work
 * sits with the Legal Aid Officer. So there is no case-editing control on this screen at
 * all — the officer supervision table is a read-only summary, and it says so.
 *
 * One component serves both role variants. The Chief *proposes* panel changes and the
 * Chairman *approves* them; misconduct is the committee's, so the Chief cannot action it.
 * Those differences come from `screen-guard`, not from a check written here.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ChiefRole = "chief" | "chairman";

type Certification = {
  caseId: string;
  ref: string;
  summary: string | null;
  district: string | null;
  mediationDate: string | null;
  signedA: boolean;
  signedB: boolean;
  signedC: boolean;
  canCertify: boolean;
  blockedReason: string | null;
  blockedNote: string | null;
};

type Payment = {
  id: string;
  caseId: string;
  ref: string;
  type: string;
  amount: number | null;
  note: string | null;
  requesterRole: string | null;
  requestedAt: string;
  ageDays: number;
  district: string | null;
};

type Officer = {
  id: string;
  name: string;
  role: string | null;
  handled: number;
  openCases: number;
};

type AuditEntry = {
  id: string;
  kind: string;
  refId: string | null;
  actorId: string | null;
  actorRole: string | null;
  detail: string | null;
  reason: string | null;
  at: string;
  actorName: string | null;
  refLabel: string | null;
};

type ChiefData = {
  role: ChiefRole;
  permissions: {
    proposePanelChanges: boolean;
    approvePanelChanges: boolean;
    actionMisconduct: boolean;
  };
  kpis: {
    pendingCertifications: number;
    certificationsBlocked: number;
    panelLawyers: number;
    openMisconduct: number;
    pendingPayments: number;
    casesHandled: number;
  };
  slaWarning: number;
  slaBreaches: number;
  certifications: Certification[];
  payments: Payment[];
  officers: Officer[];
  audit: {
    entries: AuditEntry[];
    counts: Record<string, number>;
    totalLast7Days: number;
  };
};

const TABS = [
  { id: "overview", label: "সারসংক্ষেপ" },
  { id: "certify", label: "প্রত্যায়ন" },
  { id: "payments", label: "পেমেন্ট অনুমোদন" },
  { id: "panel", label: "প্যানেল তালিকা" },
  { id: "misconduct", label: "অসদাচরণ" },
  { id: "audit", label: "অডিট ট্রেইল" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Bangla labels for audit event kinds */
const AUDIT_KIND_LABELS: Record<string, string> = {
  "auth.login": "লগইন",
  "auth.login_failed": "লগইন ব্যর্থ",
  "auth.logout": "লগআউট",
  "auth.session_denied": "অ্যাক্সেস প্রত্যাখ্যান",
  "user.create": "ব্যবহারকারী তৈরি",
  "user.role_changed": "ভূমিকা পরিবর্তন",
  "user.status_changed": "স্ট্যাটাস পরিবর্তন",
  "user.pin_reset": "পিন রিসেট",
  "case.create": "কেস তৈরি",
  "case.stage_changed": "কেস স্তর পরিবর্তন",
  "case.viewed_sensitive": "সংবেদনশীল তথ্য দেখা",
  "case.note_added": "নোট যোগ",
  "application.filed": "আবেদন দাখিল",
  "consultation.started": "পরামর্শ শুরু",
  "consultation.viewed": "পরামর্শ দেখা",
  "eligibility.decided": "যোগ্যতা সিদ্ধান্ত",
  "lawyer.assign": "আইনজীবী নিয়োগ",
  "lawyer.reassign": "আইনজীবী পুনঃনিয়োগ",
  "complaint.filed": "অভিযোগ দাখিল",
  "complaint.resolved": "অভিযোগ নিষ্পত্তি",
  "payment.approved": "পেমেন্ট অনুমোদন",
  "mediation.scheduled": "মধ্যস্থতা নির্ধারিত",
  "settlement.certified": "নিষ্পত্তি প্রত্যায়িত",
  "message.queued": "বার্তা সারিবদ্ধ",
  "message.blocked": "বার্তা ব্লক",
  "admin.audit_viewed": "অডিট দেখা",
  "admin.roster_seeded": "রোস্টার সিড",
  "admin.config_changed": "কনফিগ পরিবর্তন",
};

export default function ChiefConsole() {
  const router = useRouter();
  const [data, setData] = useState<ChiefData | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/chief", { cache: "no-store" });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) return;
    setData((await res.json()) as ChiefData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: string, id: string, reason?: string) => {
      setBusy(id);
      setToast(null);
      const res = await fetch("/api/chief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id, reason }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      setBusy(null);

      if (res.ok) {
        setToast({ tone: "ok", text: "সিদ্ধান্ত নথিভুক্ত হয়েছে।" });
        setReasons((prev) => ({ ...prev, [id]: "" }));
        await load();
        return;
      }
      // The server re-checks the rule, so a 409 here is the gate speaking, not a bug.
      // Showing its note is the whole point — it names the party that is outstanding.
      setToast({
        tone: "warn",
        text:
          body.note ||
          (body.error === "reason_required"
            ? "খালিস্তা বা প্রত্যাখ্যাত হলে কারণ লিখতে হবে।"
            : body.error === "already_decided"
              ? "এই আবেদনটি ইতিমধ্যে সিদ্ধান্ত হয়েছে।"
              : "কাজটি সম্পন্ন হয়নি।"),
      });
    },
    [load],
  );

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }, [router]);

  if (denied) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-red-700">অনুমতি নেই</h1>
        <p className="mt-2 text-slate-600">
          এই কনসোল শুধুমাত্র চীফ লিগ্যাল এইড অফিসার বা জেলা কমিটির চেয়ারম্যানের জন্য।
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          ফিরে যান
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-slate-500">লোড হচ্ছে…</p>
      </main>
    );
  }

  const isChairman = data.role === "chairman";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">চীফ লিগ্যাল এইড অফিসার কনসোল</h1>
            <p className="mt-1 text-sm text-slate-600">
              আপনি সালিশকরণ প্রত্যায়ন করেন, প্যানেল আইনজীবী তালিকা রক্ষণাবেক্ষণ করেন এবং অফিস পরিদর্শন করেন।
              দৈনন্দিন মামলার কাজ লিগ্যাল এইড অফিসারের।
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ভূমিকা: {isChairman ? "জেলা কমিটির চেয়ারম্যান" : "চীফ লিগ্যাল এইড অফিসার"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loggingOut ? "..." : "লগ আউট"}
          </button>
        </div>
      </header>

      {(data.slaWarning > 0 || data.slaBreaches > 0) && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.slaBreaches > 0
            ? `⚠ ${data.slaBreaches} টি পেমেন্ট অনুমোদন SLA উত্তীর্ণ করেছে।`
            : `⚠ ${data.slaWarning} টি পেমেন্ট অনুমোদন SLA-র কাছাকাছি (২ দিন বাকি)।`}
        </p>
      )}

      {toast && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            toast.tone === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {toast.text}
        </p>
      )}

      <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm ${
              tab === t.id
                ? "border border-b-0 border-slate-300 bg-white font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="অপেক্ষমাণ প্রত্যায়ন"
              value={data.kpis.pendingCertifications}
              sub={`${data.kpis.certificationsBlocked} টি অসম্পূর্ণ স্বাক্ষর`}
            />
            <Kpi label="প্যানেল আইনজীবী" value={data.kpis.panelLawyers} sub="মাস্টার তালিকা" />
            <Kpi
              label="এই মাসে নিষ্পত্তি"
              value={data.kpis.casesHandled}
              sub="সব অফিসার মিলিয়ে"
            />
            <Kpi
              label="অসদাচরণ তদন্ত"
              value={data.kpis.openMisconduct}
              sub={data.permissions.actionMisconduct ? "কমিটি আধিপত্যায়ী" : "শুধু কমিটি"}
            />
          </div>

          <h2 className="mt-6 text-sm font-semibold">অফিসার কার্যক্রম</h2>
          <p className="text-xs text-slate-500">
            এই সারসংক্ষেপ শুধুমাত্র পরিদর্শনের জন্য। এখান থেকে কোনো মামলার তথ্য পরিবর্তন করা যায় না।
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">অফিসার</th>
                <th className="py-2">নিষ্পত্তি</th>
                <th className="py-2">চলমান</th>
              </tr>
            </thead>
            <tbody>
              {data.officers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-slate-500">
                    কোনো সক্রিয় অফিসার নেই।
                  </td>
                </tr>
              )}
              {data.officers.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="py-2">{o.name}</td>
                  <td className="py-2">{o.handled}</td>
                  <td className="py-2">{o.openCases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "certify" && (
        <section className="mt-5 space-y-3">
          <p className="text-sm text-slate-600">
            তিন পক্ষ — আবেদনকারী, বিপরীত পক্ষ ও মধ্যস্থতাকারী — সবাই স্বাক্ষর করলেই কেবল প্রত্যায়ন করা যাবে।
          </p>
          {data.certifications.length === 0 && (
            <p className="text-sm text-slate-500">অপেক্ষমাণ সালিশ নেই।</p>
          )}
          {data.certifications.map((c) => (
            <article key={c.caseId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {c.ref}
                    {c.district ? ` · ${c.district}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.summary}</p>
                </div>
                <button
                  disabled={!c.canCertify || busy === c.caseId}
                  onClick={() => void act("certify", c.caseId)}
                  title={c.blockedNote ?? undefined}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {busy === c.caseId ? "…" : "প্রত্যায়ন"}
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-3 text-xs">
                <Sign ok={c.signedA} label="আবেদনকারী" />
                <Sign ok={c.signedB} label="বিপরীত পক্ষ" />
                <Sign ok={c.signedC} label="মধ্যস্থতাকারী" />
              </ul>
              {!c.canCertify && c.blockedNote && (
                <p className="mt-2 text-xs text-amber-800">{c.blockedNote}</p>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === "payments" && (
        <section className="mt-5 space-y-3">
          {data.payments.length === 0 && (
            <p className="text-sm text-slate-500">অপেক্ষমাণ পেমেন্ট অনুরোধ নেই।</p>
          )}
          {data.payments.map((p) => (
            <article key={p.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {p.ref} · {p.type} · ৳{p.amount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    অনুরোধকারী {p.requesterRole ?? "—"} · {p.ageDays} দিন আগে
                  </p>
                  {p.note && <p className="mt-1 text-sm text-slate-600">{p.note}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === p.id}
                    onClick={() => void act("payment_approve", p.id)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:bg-slate-300"
                  >
                    অনুমোদন
                  </button>
                  <button
                    disabled={busy === p.id || !reasons[p.id]?.trim()}
                    onClick={() => void act("payment_reject", p.id, reasons[p.id])}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:text-slate-400"
                  >
                    প্রত্যাখ্যান
                  </button>
                </div>
              </div>
              {/* A rejection must carry a reason, so the button stays dead until there is
                  one. The server enforces the same rule. */}
              <input
                value={reasons[p.id] ?? ""}
                onChange={(e) => setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="প্রত্যাখ্যাত হলে কারণ লিখুন"
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </article>
          ))}
        </section>
      )}

      {tab === "panel" && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold">প্যানেল তালিকা</h2>
          <p className="mt-1 text-sm text-slate-600">
            মাস্টার তালিকায় {data.kpis.panelLawyers} জন আইনজীবী আছেন।
          </p>
          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {isChairman
              ? "চেয়ারম্যান প্যানেল তালিকার পরিবর্তন অনুমোদন করেন।"
              : "চীফ প্যানেল তালিকার পরিবর্তন প্রস্তাব করেন; অনুমোদন করেন জেলা কমিটির চেয়ারম্যান।"}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            পরিবর্তনের তালিকা এখানে নেই।
          </p>
        </section>
      )}

      {tab === "misconduct" && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold">অসদাচরণ</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.kpis.openMisconduct} টি তদন্ত চলছে।
          </p>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {data.permissions.actionMisconduct
              ? "অসদাচরণের সিদ্ধান্ত জেলা কমিটির।"
              : "অসদাচরণের সিদ্ধান্ত কমিটির আধিপত্য — চীফ এককভাবে ব্যবস্থা নিতে পারেন না।"}
          </p>
        </section>
      )}

      {tab === "audit" && (
        <section className="mt-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">অডিট ট্রেইল</h2>
              <p className="text-xs text-slate-500">
                গত ৭ দিনে {data.audit.totalLast7Days} টি কার্যক্রম রেকর্ড হয়েছে
              </p>
            </div>
          </div>

          {data.audit.entries.length === 0 ? (
            <p className="text-sm text-slate-500">কোনো অডিট রেকর্ড নেই।</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                    <th className="px-3 py-2">সময়</th>
                    <th className="px-3 py-2">কার্যক্রম</th>
                    <th className="px-3 py-2">ব্যবহারকারী</th>
                    <th className="px-3 py-2">বিবরণ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedAudit(entry)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(entry.at).toLocaleString("bn-BD", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {AUDIT_KIND_LABELS[entry.kind] ?? entry.kind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {entry.actorName || entry.actorRole || "সিস্টেম"}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                        {entry.detail || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Audit Detail Popup */}
      {selectedAudit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedAudit(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">অডিট বিস্তারিত</h3>
              <button
                onClick={() => setSelectedAudit(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">কার্যক্রম</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {AUDIT_KIND_LABELS[selectedAudit.kind] ?? selectedAudit.kind}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">সময়</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {new Date(selectedAudit.at).toLocaleString("bn-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">ব্যবহারকারী</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {selectedAudit.actorName || selectedAudit.actorRole || "সিস্টেম"}
                  </p>
                </div>
              </div>

              {selectedAudit.actorRole && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">ভূমিকা</p>
                  <p className="mt-1 text-sm text-slate-800">{selectedAudit.actorRole}</p>
                </div>
              )}

              {selectedAudit.detail && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">বিবরণ</p>
                  <p className="mt-1 text-sm text-slate-800">{selectedAudit.detail}</p>
                </div>
              )}

              {selectedAudit.reason && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-700">কারণ</p>
                  <p className="mt-1 text-sm text-amber-900">{selectedAudit.reason}</p>
                </div>
              )}

              {selectedAudit.refId && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">রেফারেন্স ID</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {selectedAudit.refLabel || selectedAudit.refId}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedAudit(null)}
              className="mt-5 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function Sign({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "text-emerald-700" : "text-amber-700"}>
      {ok ? "✓" : "○"} {label}
    </li>
  );
}
