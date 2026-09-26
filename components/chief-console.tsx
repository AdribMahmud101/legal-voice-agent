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
};

const TABS = [
  { id: "overview", label: "সারসংক্ষেপ" },
  { id: "certify", label: "প্রত্যায়ন" },
  { id: "payments", label: "পেমেন্ট অনুমোদন" },
  { id: "panel", label: "প্যানেল তালিকা" },
  { id: "misconduct", label: "অসদাচরণ" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ChiefConsole() {
  const router = useRouter();
  const [data, setData] = useState<ChiefData | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

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
        <h1 className="text-xl font-semibold">চীফ লিগ্যাল এইড অফিসার কনসোল</h1>
        <p className="mt-1 text-sm text-slate-600">
          আপনি সালিশকরণ প্রত্যায়ন করেন, প্যানেল আইনজীবী তালিকা রক্ষণাবেক্ষণ করেন এবং অফিস পরিদর্শন করেন।
          দৈনন্দিন মামলার কাজ লিগ্যাল এইড অফিসারের।
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ভূমিকা: {isChairman ? "জেলা কমিটির চেয়ারম্যান" : "চীফ লিগ্যাল এইড অফিসার"}
        </p>
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
