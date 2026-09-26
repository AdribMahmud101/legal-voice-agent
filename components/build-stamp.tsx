/**
 * Shows the build the browser actually loaded.
 *
 * The shell carried a hardcoded "সর্বশেষ হালনাগাদ: ৭ সেপ্টেম্বর ২০২৬" — a date typed
 * once and never changed, so it said nothing about which code was running. That is how
 * several deploys went unnoticed: there was no way to tell whether the page in front of
 * you was the build someone believed had shipped, and the only evidence available was a
 * visual impression, which is exactly the kind of evidence people get wrong.
 *
 * Recorded at build time by scripts/write-build-info.mjs — reading it out of the
 * `/_next/static/…` path does not work on the App Router, where chunks carry no build
 * segment. It turns "is it updated?" into a glance, and gives a support answer that is
 * not "try clearing your cache".
 */

import { BUILD_SHA, BUILD_AT } from "@/lib/build-info";

export default function BuildStamp() {
  const when = new Date(BUILD_AT).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const shown = `${BUILD_SHA} · ${when}`;

  return (
    <span
      title={`বিল্ড ${BUILD_SHA} · তৈরি ${BUILD_AT}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      বিল্ড: <b>{shown}</b>
    </span>
  );
}
