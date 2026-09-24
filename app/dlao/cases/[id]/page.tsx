"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { DlaoShell } from "@/lib/ui/shell/DlaoShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { Button } from "@/lib/ui/components/Button";
import { FormField } from "@/lib/ui/components/FormField";
import { MOCK_ROLE_IDENTITIES, StaffRole } from "@/lib/auth/roles";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function DlaoCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Form state
  const [assignedLawyer, setAssignedLawyer] = useState("");
  const [status, setStatus] = useState("");
  const [dlaoNotes, setDlaoNotes] = useState("");

  const fetchCase = async () => {
    try {
      const res = await fetch(`/api/portal/cases/${id}`);
      const data = await res.json();
      if (data.ok) {
        setCaseData(data.case);
        setAssignedLawyer(data.case.assignedLawyerId || "");
        setStatus(data.case.status);
        setDlaoNotes(data.case.dlaoNotes || "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCase();
  }, [id]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/portal/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          assignedLawyerId: assignedLawyer || null,
          dlaoNotes,
        }),
      });
      if (res.ok) {
        fetchCase();
      }
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <DlaoShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Loading...</div></DlaoShell>;
  if (!caseData) return <DlaoShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Case not found</div></DlaoShell>;

  const lawyers = [
    { id: "MOCK-panel_lawyer", name: MOCK_ROLE_IDENTITIES["panel_lawyer"].displayName }
  ];

  return (
    <DlaoShell>
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/dlao" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-accent)", textDecoration: "none", fontWeight: 600 }}>
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
      </div>

      <div style={{ marginBottom: "var(--space-2xl)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
            মামলা: {caseData.id}
          </h1>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
            আবেদনকারী: {caseData.citizenName} ({caseData.citizenPhone})
          </p>
        </div>
        <StatusBadge variant={getStatusVariant(caseData.status)}>{getStatusLabel(caseData.status)}</StatusBadge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-xl)", alignItems: "start" }}>
        {/* Left Column: Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card>
            <CardContent>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>ঘটনার বিবরণ</h3>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)", lineHeight: 1.6 }}>
                {caseData.summary}
              </p>
              
              <div style={{ marginTop: "var(--space-lg)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--portal-border)" }}>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ভয়েস ডকেট আইডি</p>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.docketId}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card>
            <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>মামলা পরিচালনা</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>অবস্থা পরিবর্তন</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--portal-border)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "1rem"
                  }}
                >
                  <option value="pending_review">পর্যালোচনার অপেক্ষায়</option>
                  <option value="needs_documents">কাগজপত্র প্রয়োজন</option>
                  <option value="assigned">আইনজীবী নিযুক্ত</option>
                  <option value="closed">নিষ্পত্তি</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>প্যানেল আইনজীবী নিয়োগ</label>
                <select
                  value={assignedLawyer}
                  onChange={(e) => setAssignedLawyer(e.target.value)}
                  style={{
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--portal-border)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "1rem"
                  }}
                >
                  <option value="">-- নির্বাচন করুন --</option>
                  {lawyers.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>অফিসিয়াল মন্তব্য</label>
                <textarea
                  value={dlaoNotes}
                  onChange={(e) => setDlaoNotes(e.target.value)}
                  placeholder="আপনার মন্তব্য এখানে লিখুন..."
                  style={{
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--portal-border)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "1rem",
                    minHeight: "80px",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ marginTop: "var(--space-sm)" }}>
                <Button fullWidth onClick={handleUpdate} loading={updating}>
                  আপডেট সংরক্ষণ করুন
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DlaoShell>
  );
}
