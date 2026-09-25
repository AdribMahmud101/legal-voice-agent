"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AgentFab } from "./AgentFab";

export type DlaoTab = "applications" | "new" | "cases" | "panel" | "hearing" | "online" | "lawyers" | "reports";

interface DlaoShellProps {
  children: ReactNode;
  activeTab?: DlaoTab;
  onTabChange?: (tab: DlaoTab) => void;
  tabCounts?: {
    new: number;
    cases: number;
    panel: number;
  };
}

const TABS: Array<{ id: DlaoTab; label: string }> = [
  { id: "applications", label: "আবেদন" },
  { id: "new", label: "নতুন আবেদন" },
  { id: "cases", label: "কেস" },
  { id: "panel", label: "প্যানেল বিবরণ" },
  { id: "hearing", label: "শনি" },
  { id: "online", label: "ওনলি" },
  { id: "lawyers", label: "প্যানেল অ্যাডভোকেটী" },
  { id: "reports", label: "প্রতিবেদন" },
];

export function DlaoShell({ children, activeTab, onTabChange, tabCounts }: DlaoShellProps) {
  const [localTab, setLocalTab] = useState<DlaoTab>(activeTab || "applications");
  const [language, setLanguage] = useState<"bn" | "en">("bn");
  const currentTab = activeTab || localTab;

  const selectTab = (tab: DlaoTab) => {
    setLocalTab(tab);
    onTabChange?.(tab);
  };

  return (
    <div data-portal="dlao" className="dlao-root">
      <div className="dlao-government-strip">
        <div className="dlao-shell-width dlao-government-inner">
          <span><span className="dlao-government-dot" /> পরিচালনা ব্যবস্থাপনা সরকার / Government of the People&apos;s Republic of Bangladesh.</span>
          <span>সর্বশেষ হালনাগাদ: ৭ সেপ্টেম্বর ২০২৬</span>
        </div>
      </div>

      <header className="dlao-header">
        <div className="dlao-shell-width dlao-header-inner">
          <Link href="/dlao" className="dlao-brand" aria-label="DLAO dashboard">
            <Image src="/assets/logo/logo-mark-reference.png" alt="DLAS" width={38} height={38} />
            <span>
              <strong>DLAS</strong>
              <small>ডিজিটাল লিগ্যাল এইড সিস্টেম</small>
            </span>
          </Link>
          <div className="dlao-header-account">
            <span className="dlao-account-name">DLAO ড্যাশবোর্ড</span>
            <div className="dlao-language-switch" role="group" aria-label="Language">
              <button className={language === "bn" ? "active" : ""} onClick={() => setLanguage("bn")}>বাংলা</button>
              <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button>
            </div>
            <button
              className="dlao-logout"
              onClick={() => {
                document.cookie = "auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                window.location.href = "/login";
              }}
            >
              লগআউট
            </button>
          </div>
        </div>
      </header>

      <div className="dlao-service-strip">
        <div className="dlao-shell-width dlao-service-inner">
          <div className="dlao-service-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" /></svg>
            <span>ডেলওয়েকা জেলা লিগ্যাল এইড অফিস</span>
          </div>
          <Link href="/citizen/apply" className="dlao-new-application">+ নতুন আবেদন পরিচালনা করুন (ওয়েব-ফর্ম)</Link>
          <span className="dlao-updated">সোমবার, ৭ সেপ্টেম্বর ২০২৬</span>
        </div>
      </div>

      <nav className="dlao-tabs" aria-label="DLAO sections">
        <div className="dlao-shell-width dlao-tabs-inner">
          {TABS.map((tab) => {
            const count = tab.id === "new" ? tabCounts?.new : tab.id === "cases" ? tabCounts?.cases : tab.id === "panel" ? tabCounts?.panel : undefined;
            return (
              <button
                key={tab.id}
                className={currentTab === tab.id ? "active" : ""}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
                {count !== undefined && <span className="dlao-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="dlao-main dlao-shell-width">{children}</main>
      <AgentFab />
    </div>
  );
}
