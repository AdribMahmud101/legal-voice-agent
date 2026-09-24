"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { AgentFab } from "./AgentFab";

interface CitizenShellProps {
  children: ReactNode;
}

export function CitizenShell({ children }: CitizenShellProps) {
  return (
    <div
      data-portal="citizen"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--portal-bg)",
      }}
    >
      <header
        style={{
          backgroundColor: "var(--portal-white)",
          borderBottom: "1px solid var(--portal-border)",
          padding: "var(--space-md) var(--space-xl)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--portal-accent-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.25rem",
            }}
          >
            🏛️
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-bn)",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--portal-text)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              নাগরিক পোর্টাল
            </h1>
            <p
              style={{
                fontFamily: "var(--font-bn)",
                fontSize: "0.8125rem",
                color: "var(--portal-text-secondary)",
                margin: 0,
              }}
            >
              জাতীয় আইনগত সহায়তা প্রদান সংস্থা
            </p>
          </div>
        </div>

        <nav style={{ display: "flex", gap: "var(--space-lg)" }}>
          <Link
            href="/citizen"
            style={{
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              color: "var(--portal-text)",
              textDecoration: "none",
            }}
          >
            ড্যাশবোর্ড
          </Link>
          <button
            onClick={() => {
              document.cookie = "auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              window.location.href = "/login";
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--portal-text-secondary)",
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            লগআউট
          </button>
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          padding: "var(--space-xl)",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {children}
      </main>

      <AgentFab />
    </div>
  );
}
