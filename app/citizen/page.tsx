"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { EmptyState } from "@/lib/ui/components/EmptyState";
import { Button } from "@/lib/ui/components/Button";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function CitizenDashboard() {
  const { currentUser } = useVoiceSession();
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

  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          স্বাগতম, {currentUser?.displayName || "নাগরিক"}
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার আইনি সহায়তার বর্তমান অবস্থা এবং আবেদনসমূহ।
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-2xl)" }}>
        <Link href="/citizen/apply" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ height: "100%", transition: "transform var(--transition-fast)", cursor: "pointer", border: "2px dashed var(--portal-border)", backgroundColor: "var(--portal-bg-subtle)" }}>
            <CardContent style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "var(--space-xl)", textAlign: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--portal-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-accent-text)", fontSize: "1.5rem" }}>
                +
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>নতুন আবেদন করুন</h3>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-xs)" }}>
                  ভয়েস ইনটেকের পর পূর্ণাঙ্গ আবেদন ফর্ম পূরণ করুন
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/citizen/track" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ height: "100%", transition: "transform var(--transition-fast)", cursor: "pointer" }}>
            <CardContent style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "var(--space-xl)", textAlign: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--portal-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-accent-text)", fontSize: "1.5rem" }}>
                🔍
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>আবেদন ট্র্যাক করুন</h3>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-xs)" }}>
                  আপনার বর্তমান আবেদনের সর্বশেষ অবস্থা জানুন
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-lg)" }}>
        আপনার চলমান মামলাসমূহ
      </h2>
      
      {loading ? (
        <div style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>Loading...</div>
      ) : cases.length === 0 ? (
        <EmptyState 
          title="কোনো মামলা পাওয়া যায়নি" 
          description="আপনার বর্তমানে কোনো চলমান আইনি আবেদন বা মামলা নেই।" 
          action={<Button onClick={() => window.location.href = "/citizen/apply"}>নতুন আবেদন করুন</Button>}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {cases.map((c) => (
            <Link key={c.id} href={`/citizen/track?id=${c.id}`} style={{ textDecoration: "none" }}>
              <Card>
                <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600, color: "var(--portal-text)" }}>
                      {c.id}
                    </h3>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-2xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "250px" }}>
                      {c.summary}
                    </p>
                  </div>
                  <StatusBadge variant={getStatusVariant(c.status)}>{getStatusLabel(c.status)}</StatusBadge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </CitizenShell>
  );
}
