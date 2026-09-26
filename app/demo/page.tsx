"use client";

import Link from "next/link";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";

/**
 * Part A of the brief, on screen: the five mandatory citizen scenarios.
 *
 * This exists as its own page rather than only inside the login form because the brief
 * is a specification, and a reviewer needs to read the requirement and then watch the
 * system satisfy it. A card that only says "log in" would hide the half of the brief
 * that is about what has to be true afterwards.
 */
export default function DemoScenariosPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--portal-bg)",
        padding: "var(--space-2xl) var(--space-xl)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
        <header>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--portal-accent-text)",
              margin: "0 0 var(--space-sm)",
            }}
          >
            Part A — Five citizen scenarios
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "1.875rem",
              fontWeight: 700,
              color: "var(--portal-text)",
              margin: "0 0 var(--space-sm)",
              lineHeight: 1.3,
            }}
          >
            পাঁচটি নাগরিক, পাঁচটি আলাদা বাধা
          </h1>
          <p
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "1rem",
              color: "var(--portal-text-secondary)",
              margin: 0,
              maxWidth: "70ch",
              lineHeight: 1.7,
            }}
          >
            এই পাঁচজন আবশ্যক, বিকল্প নয়। একই স্থাপত্য প্রতিটির নির্দিষ্ট বাধা কীভাবে সমাধান করে তা দেখাতে হবে।
            শেয়ার্ড কম্পোনেন্ট ব্যবহার করা যাবে, কিন্তু প্রত্যেকের সমস্যা স্পষ্টভাবে সমাধান হতে হবে।
          </p>
        </header>

        <PersonaSwitcher />

        <footer style={{ borderTop: "1px solid var(--portal-border)", paddingTop: "var(--space-lg)" }}>
          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--portal-accent-text)",
              textDecoration: "none",
            }}
          >
            ← লগইন পাতায় ফিরে যান
          </Link>
        </footer>
      </div>
    </main>
  );
}
