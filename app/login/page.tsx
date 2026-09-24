"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MOCK_ROLE_IDENTITIES, ROLE_LABELS, type StaffRole } from "@/lib/auth/roles";
import { Button } from "@/lib/ui/components/Button";
import { FormField } from "@/lib/ui/components/FormField";
import { Card, CardContent } from "@/lib/ui/components/Card";

const MOCK_ROLES = Object.keys(MOCK_ROLE_IDENTITIES) as StaffRole[];

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"citizen" | "staff">("citizen");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "staff") {
      setActiveTab("staff");
    } else if (tab === "citizen") {
      setActiveTab("citizen");
    }
  }, [searchParams]);

  // Citizen Login State
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [isCitizenLoading, setIsCitizenLoading] = useState(false);
  const [citizenError, setCitizenError] = useState("");

  // Staff Login State
  const [selectedRole, setSelectedRole] = useState<StaffRole>("dlao_officer");
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const handleCitizenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCitizenLoading(true);
    setCitizenError("");

    try {
      const res = await fetch("/api/portal/citizen-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      
      // Redirect to citizen portal
      window.location.href = "/citizen";
    } catch (err) {
      setCitizenError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCitizenLoading(false);
    }
  };

  const handleStaffLogin = async () => {
    setIsStaffLoading(true);
    setStaffError("");

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      
      // Redirect based on role
      if (selectedRole === "panel_lawyer") {
        window.location.href = "/lawyer";
      } else {
        window.location.href = "/dlao";
      }
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsStaffLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: "480px" }}>
      <div style={{ textAlign: "center", marginBottom: "var(--space-2xl)" }}>
        <h1
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--portal-text)",
            marginBottom: "var(--space-sm)",
          }}
        >
          পোর্টাল লগইন
        </h1>
        <p
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "1rem",
            color: "var(--portal-text-secondary)",
          }}
        >
          জাতীয় আইনগত সহায়তা প্রদান সংস্থা
        </p>
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--portal-border)",
          }}
        >
          <button
            onClick={() => setActiveTab("citizen")}
            style={{
              flex: 1,
              padding: "var(--space-lg)",
              backgroundColor: activeTab === "citizen" ? "var(--portal-white)" : "var(--portal-bg-subtle)",
              border: "none",
              borderBottom: activeTab === "citizen" ? "2px solid var(--portal-accent)" : "2px solid transparent",
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              fontSize: "1rem",
              color: activeTab === "citizen" ? "var(--portal-accent-text)" : "var(--portal-text-secondary)",
              cursor: "pointer",
            }}
          >
            নাগরিক লগইন
          </button>
          <button
            onClick={() => setActiveTab("staff")}
            style={{
              flex: 1,
              padding: "var(--space-lg)",
              backgroundColor: activeTab === "staff" ? "var(--portal-white)" : "var(--portal-bg-subtle)",
              border: "none",
              borderBottom: activeTab === "staff" ? "2px solid var(--portal-accent)" : "2px solid transparent",
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              fontSize: "1rem",
              color: activeTab === "staff" ? "var(--portal-accent-text)" : "var(--portal-text-secondary)",
              cursor: "pointer",
            }}
          >
            কর্মকর্তা লগইন
          </button>
        </div>

        <CardContent>
          {activeTab === "citizen" ? (
            <form onSubmit={handleCitizenLogin} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-lg)" }}>
                  ভয়েস ইনটেক সম্পন্ন হলে এসএমএস এর মাধ্যমে প্রাপ্ত টোকেন নম্বর দিয়ে লগইন করুন।
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                  <FormField
                    label="মোবাইল নম্বর"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    required
                  />
                  <FormField
                    label="টোকেন নম্বর (PIN)"
                    type="text"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="DLAS-2025-XXXX"
                    required
                    error={citizenError}
                  />
                </div>
              </div>
              <Button type="submit" fullWidth loading={isCitizenLoading}>
                লগইন করুন
              </Button>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-lg)" }}>
                  হ্যাকাথন ডেমো: নিচে থেকে যেকোনো একটি রোল সিলেক্ট করে লগইন করুন।
                </p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  {MOCK_ROLES.map((role) => (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        padding: "var(--space-md)",
                        borderRadius: "var(--radius-md)",
                        border: `1.5px solid ${selectedRole === role ? "var(--portal-accent)" : "var(--portal-border)"}`,
                        backgroundColor: selectedRole === role ? "var(--portal-accent-subtle)" : "var(--portal-white)",
                        cursor: "pointer",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.9375rem", color: "var(--portal-text)" }}>
                        {ROLE_LABELS[role]}
                      </span>
                      <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary)" }}>
                        {MOCK_ROLE_IDENTITIES[role].displayName}
                      </span>
                    </button>
                  ))}
                </div>
                {staffError && (
                  <p style={{ fontFamily: "var(--font-bn)", color: "#dc2626", fontSize: "0.8125rem", marginTop: "var(--space-md)", fontWeight: 500 }}>
                    {staffError}
                  </p>
                )}
              </div>
              <Button onClick={handleStaffLogin} fullWidth loading={isStaffLoading}>
                স্টাফ পোর্টালে প্রবেশ করুন
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div style={{ marginTop: "var(--space-xl)", textAlign: "center" }}>
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--portal-accent)",
            textDecoration: "none",
          }}
        >
          ← মূল পেজে ফিরে যান
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--portal-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-xl)",
      }}
    >
      <Suspense fallback={<div>Loading...</div>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
