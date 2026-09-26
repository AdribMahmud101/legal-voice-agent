"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DlaoShell, type DlaoTab } from "@/lib/ui/shell/DlaoShell";
import DlaoAssignmentWorkbench from "@/components/dlao-assignment-workbench";
import type { PortalCase } from "@/lib/data/case-projection";

const SLA_DAYS = 65;

function getAgeInDays(applicationTime: string): number {
  const timestamp = new Date(applicationTime).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function getSlaState(applicationTime: string): "overdue" | "near" | "normal" {
  const age = getAgeInDays(applicationTime);
  if (age > SLA_DAYS) return "overdue";
  if (age >= SLA_DAYS - 5) return "near";
  return "normal";
}

function getSlaLabel(state: "overdue" | "near" | "normal"): string {
  if (state === "overdue") return "সীমা পার";
  if (state === "near") return "সীমার কাছাকাছি";
  return "সীমার মধ্যে";
}

function getUrgencyLabel(urgency: string): string {
  if (urgency === "emergency_danger") return "জরুরি";
  if (urgency === "urgent") return "অগ্রাধিকার";
  return "স্বাভাবিক";
}

function getPriorityLabel(priority: string): string {
  if (priority === "urgent") return "অতি জরুরি";
  if (priority === "high") return "উচ্চ অগ্রাধিকার";
  return "স্বাভাবিক";
}

function getVisibleCases(cases: PortalCase[], tab: DlaoTab): PortalCase[] {
  if (tab === "new") return cases.filter((item) => item.status === "pending_review");
  if (tab === "cases") return cases.filter((item) => item.status !== "pending_review");
  if (tab === "panel") return cases.filter((item) => item.status === "assigned");
  if (tab === "applications") return cases;
  return [];
}

export default function DlaoDashboard() {
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [activeTab, setActiveTab] = useState<DlaoTab>("applications");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/cases")
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setCases(data.cases as PortalCase[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingCount = cases.filter((item) => item.status === "pending_review").length;
  const caseCount = cases.filter((item) => item.status !== "pending_review").length;
  const panelCount = cases.filter((item) => item.status === "assigned").length;
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/cases")
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data?.ok) setCases(data.cases); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const visibleCases = useMemo(() => getVisibleCases(cases, activeTab), [cases, activeTab]);
  const overdueCount = cases.filter((item) => getSlaState(item.applicationTime) === "overdue").length;
  const nearCount = cases.filter((item) => getSlaState(item.applicationTime) === "near").length;

  return (
    <DlaoShell activeTab={activeTab} onTabChange={setActiveTab} tabCounts={{ new: pendingCount, cases: caseCount, panel: panelCount }}>
      <h1 className="dlao-page-heading">
        {activeTab === "lawyers" ? "এইচ পরামর্শ কেন্দ্র" : "আবেদন"}
      </h1>

      {activeTab === "lawyers" ? (
        <DlaoAssignmentWorkbench cases={cases} onAssigned={reload} />
      ) : null}

      {activeTab === "lawyers" ? null : (
      <section className="dlao-sla-alert" aria-label="SLA summary">
        <div className="dlao-sla-alert-header">
          <span className="dlao-sla-alert-icon" aria-hidden="true">!</span>
          <h2>{overdueCount}টি কেস SLA সীমা পার করেছে, {nearCount}টি সীমার কাছাকাছি</h2>
        </div>
        <p className="dlao-sla-alert-copy">নিচের প্রতিটি সময়সীমা একটি বাধ্যতামূলক মেট্রিক্স — কোনো SLA অতিক্রান্ত করা সহজ হবে না। এই পর্যবেক্ষণ করুন এবং পদক্ষেপ নিন।</p>
        <div className="dlao-queue">
          {loading ? (
            <div className="dlao-queue-loading">আবেদনের তালিকা লোড হচ্ছে...</div>
          ) : visibleCases.length === 0 ? (
            <div className="dlao-queue-empty">এই অংশে কোনো আবেদন পাওয়া যায়নি।</div>
          ) : (
            visibleCases.map((item) => {
              const slaState = getSlaState(item.applicationTime);
              const age = getAgeInDays(item.applicationTime);
              return (
                <Link key={item.id} href={`/dlao/cases/${item.id}`} className={`dlao-queue-row ${slaState}`}>
                  <div className="dlao-queue-content">
                    <div className="dlao-queue-reference">{item.applicationId} · {item.docketId}</div>
                     <h2 className="dlao-queue-name">{item.applicantName}</h2>
                     {item.sourceLanguage !== "bn" && <p className="dlao-queue-meta">ভাষা: {item.sourceLanguage === "marma" ? "মারমা" : "চাকমা"} · অর্থ নিশ্চিত করা হয়েছে</p>}
                     <p className="dlao-queue-meta">নতুন আবেদন পরিচালনা একেন্দ্রে জমা হয়েছে — {age} দিন (সীমা {SLA_DAYS} দিন)</p>
                     <p className="dlao-queue-meta">জরুরি: {getUrgencyLabel(item.urgency)} · অগ্রাধিকার: {getPriorityLabel(item.priority)} · রেকর্ডিং: {item.recording ? "সংরক্ষিত" : "প্রক্রিয়াধীন"}</p>
                  </div>
                  <div className="dlao-queue-actions">
                    <span className={`dlao-sla-label ${slaState}`}>{getSlaLabel(slaState)}</span>
                    <span className="dlao-case-link">কেস দেখুন</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
      )}
    </DlaoShell>
  );
}
