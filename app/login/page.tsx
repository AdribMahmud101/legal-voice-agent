"use client";

import Link from "next/link";
import { useState } from "react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { MOCK_ROLE_IDENTITIES, ROLE_LABELS, type StaffRole } from "@/lib/auth/roles";

const MOCK_ROLES = Object.keys(MOCK_ROLE_IDENTITIES) as StaffRole[];

export default function LoginPage() {
  const { currentUser } = useVoiceSession();
  const [selectedRole, setSelectedRole] = useState<StaffRole>("dlao_officer");
  const selectedIdentity = MOCK_ROLE_IDENTITIES[selectedRole];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
              ← হোম পেজে ফিরে যান
            </Link>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              লগইন / রেজিস্টার
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              নাগরিক অ্যাকাউন্ট ভয়েস ইনটেক সম্পন্ন হলে তৈরি হয়। কর্মকর্তা ভূমিকাগুলো এখন ডেমো প্রোফাইল হিসেবে উপলব্ধ।
            </p>
          </div>
          <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            হ্যাকাথন ডেমো মোড
          </span>
        </div>

        {currentUser ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">সক্রিয় সেশন</p>
            <h2 className="mt-2 text-xl font-bold text-emerald-950">{currentUser.displayName}</h2>
            <p className="mt-1 text-sm text-emerald-900">
              ভূমিকা: {ROLE_LABELS[currentUser.role]} · যাচাই: {currentUser.verificationStatus}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                হোমে ফিরুন
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">নাগরিক রেজিস্ট্রেশন</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">ভয়েস ইনটেক দিয়ে অ্যাকাউন্ট তৈরি হবে</h2>
            <ol className="mt-5 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
              <li className="rounded-2xl bg-slate-50 p-4">১. হটলাইনে কল করুন</li>
              <li className="rounded-2xl bg-slate-50 p-4">২. Keypad ২ নির্বাচন করুন</li>
              <li className="rounded-2xl bg-slate-50 p-4">৩. তথ্য সম্পূর্ণ করলে নাগরিক লগইন তৈরি হবে</li>
            </ol>
            <Link href="/" className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
              ভয়েস কল শুরু করুন
            </Link>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">কর্মকর্তা ভূমিকা</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Staff mock profiles</h2>
            </div>
            <p className="text-xs text-slate-500">এখন কোনো staff login বা production permission নেই।</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selectedRole === role
                    ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                }`}
              >
                <span className="block text-sm font-bold text-slate-900">{ROLE_LABELS[role]}</span>
                <span className="mt-1 block text-xs text-slate-500">Mock identity · {MOCK_ROLE_IDENTITIES[role].displayName}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
            নির্বাচিত প্রোফাইল: <strong>{ROLE_LABELS[selectedRole]}</strong> · {selectedIdentity.displayName}
          </div>
        </section>
      </div>
    </main>
  );
}
