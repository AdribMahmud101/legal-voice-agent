"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { AgentFab } from "./AgentFab";

interface DlaoShellProps {
  children: ReactNode;
}

export function DlaoShell({ children }: DlaoShellProps) {
  return (
    <div
      data-portal="dlao"
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: "var(--portal-bg)",
      }}
    >
      <aside
        style={{
          width: "280px",
          backgroundColor: "var(--portal-white)",
          borderRight: "1px solid var(--portal-border)",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "var(--space-xl)",
            borderBottom: "1px solid var(--portal-border)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--portal-text)",
              margin: 0,
            }}
          >
            DLAO Portal
          </h1>
          <span
            style={{
              display: "inline-block",
              marginTop: "var(--space-xs)",
              padding: "2px 8px",
              backgroundColor: "var(--portal-accent-light)",
              color: "var(--portal-accent-text)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              fontWeight: 600,
              fontFamily: "var(--font-ui)",
            }}
          >
            OFFICER
          </span>
        </div>
        
        <nav
          style={{
            flex: 1,
            padding: "var(--space-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          <Link
            href="/dlao"
            style={{
              padding: "var(--space-md) var(--space-lg)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--portal-accent-subtle)",
              color: "var(--portal-accent-text)",
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Queue
          </Link>
          <Link
            href="/dlao/search"
            style={{
              padding: "var(--space-md) var(--space-lg)",
              borderRadius: "var(--radius-md)",
              color: "var(--portal-text)",
              fontFamily: "var(--font-ui)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Search
          </Link>
        </nav>

        <div style={{ padding: "var(--space-lg)", borderTop: "1px solid var(--portal-border)" }}>
           <button
            onClick={() => {
              document.cookie = "auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              window.location.href = "/login";
            }}
            style={{
              width: "100%",
              padding: "var(--space-md)",
              background: "transparent",
              border: "none",
              color: "var(--portal-text-secondary)",
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Log Out
          </button>
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          padding: "var(--space-2xl)",
          maxWidth: "1000px",
        }}
      >
        {children}
      </main>

      <AgentFab />
    </div>
  );
}
