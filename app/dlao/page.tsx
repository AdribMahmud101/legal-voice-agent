"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DlaoShell } from "@/lib/ui/shell/DlaoShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { EmptyState } from "@/lib/ui/components/EmptyState";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function DlaoDashboard() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/cases")
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setCases(data.cases);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingCount = cases.filter(c => c.status === "pending_review").length;

  return (
    <DlaoShell>
      <div style={{ marginBottom: "var(--space-2xl)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
            DLAO ড্যাশবোর্ড
          </h1>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
            সকল অপেক্ষমাণ ও চলমান মামলার তালিকা।
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>নতুন আবেদন</p>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "2rem", fontWeight: 700, color: "var(--portal-accent-text)", lineHeight: 1 }}>{pendingCount}</p>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", display: "flex", gap: "var(--space-md)" }}>
        <Link href="/dlao/search" style={{ textDecoration: "none" }}>
          <button style={{ padding: "var(--space-md) var(--space-xl)", borderRadius: "var(--radius-full)", border: "1px solid var(--portal-border)", backgroundColor: "var(--portal-white)", cursor: "pointer", fontFamily: "var(--font-bn)", fontWeight: 600, color: "var(--portal-text)", display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span>🔍</span> সার্চ করুন
          </button>
        </Link>
      </div>
      
      {loading ? (
        <div style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>Loading...</div>
      ) : cases.length === 0 ? (
        <EmptyState 
          title="কোনো মামলা পাওয়া যায়নি" 
          description="বর্তমানে কোনো নতুন আবেদন বা চলমান মামলা নেই।" 
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {cases.map((c) => (
            <Link key={c.id} href={`/dlao/cases/${c.id}`} style={{ textDecoration: "none" }}>
              <Card style={{ transition: "all var(--transition-fast)", borderLeft: c.status === "pending_review" ? "4px solid var(--portal-accent)" : undefined }}>
                <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-2xs)" }}>
                      <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)" }}>
                        {c.id}
                      </h3>
                      <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>
                        {c.citizenName} ({c.citizenPhone})
                      </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "500px" }}>
                      {c.summary}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-xs)" }}>
                    <StatusBadge variant={getStatusVariant(c.status)}>{getStatusLabel(c.status)}</StatusBadge>
                    <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-subtle)" }}>
                      {new Date(c.createdAt).toLocaleDateString('bn-BD')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DlaoShell>
  );
}
