/**
 * Screen guard.
 *
 * The guide is explicit that role checks belong in "a route guard / HOC in the new
 * project rather than baking role checks into every component", and that district
 * scoping is a middleware concern too. This is that layer.
 *
 * Two ideas kept deliberately separate:
 *   - `whichScreen` — *where should this person go?* Used to bounce someone to the
 *     console they actually own rather than showing them a deny wall.
 *   - `canAccessScreen` — *may this person open it at all?* Used for a hard deny.
 */

import type { AppRole } from "./roles";

/** Console identifiers, matching the guide's tab/screen names. */
export type ScreenId =
  | "dlao"
  | "chief"
  | "citizen"
  | "lawyer"
  | "mediator"
  | "national"
  | "calendar"
  | "case-detail"
  | "intake";

/**
 * The console each role belongs on. Anything not listed falls back to the DLAO
 * console, which is the day-to-day caseworker screen.
 */
const HOME_SCREEN: Record<string, ScreenId> = {
  citizen: "citizen",
  chief: "chief",
  metropolitan_legal_aid_officer: "chief",
  chairman: "chief",
  admin: "national",
  panel: "lawyer",
  panel_lawyer: "lawyer",
  judge: "lawyer",
  chowki: "lawyer",
  sclao: "lawyer",
  labour: "lawyer",
  mediator: "mediator",
  // dlao_officer, paralegal, callcentre, ngo, udc, referral, and the canonical
  // `dlao` all land on the officer console.
};

export function whichScreen(role: AppRole | string | null | undefined): ScreenId {
  if (!role) return "dlao";
  return HOME_SCREEN[role] ?? "dlao";
}

/** Roles that run a district office. Everything else must not inherit one. */
const DISTRICT_OFFICE_ROLES = new Set([
  "dlao",
  "dlao_officer",
  "chief",
  "chief_legal_aid_officer",
  "chairman",
  "metropolitan_legal_aid_officer",
  "mediator",
  "special_mediator",
  "paralegal",
]);

export function isDistrictOfficeRole(role: string | null | undefined): boolean {
  return Boolean(role && DISTRICT_OFFICE_ROLES.has(role));
}

export interface GuardResult {
  allowed: boolean;
  /** Where to send them instead, when denied. */
  redirectTo?: ScreenId;
  reason?: string;
  reasonBn?: string;
}

const DENY_TITLES: Record<ScreenId, { en: string; bn: string }> = {
  dlao: { en: "Legal Aid Officer", bn: "লিগ্যাল এইড অফিসার" },
  chief: { en: "Chief Legal Aid Officer", bn: "চীফ লিগ্যাল এইড অফিসার" },
  citizen: { en: "Applicant", bn: "আবেদনকারী" },
  lawyer: { en: "Panel Lawyer", bn: "প্যানেল আইনজীবী" },
  mediator: { en: "Special Mediator", bn: "বিশেষ মধ্যস্থতাকারী" },
  national: { en: "DBLA National Administrator", bn: "DBLA জাতীয় প্রশাসক" },
  calendar: { en: "Hearings calendar", bn: "শুনানির ক্যালেন্ডার" },
  "case-detail": { en: "Case detail", bn: "কেস বিবরণ" },
  intake: { en: "Application intake", bn: "আবেদন গ্রহণ" },
};

/** Who is allowed to open which console outright. */
const SCREEN_ROLES: Record<ScreenId, readonly string[] | "any-staff"> = {
  dlao: "any-staff",
  chief: ["chief", "chief_legal_aid_officer", "chairman", "metropolitan_legal_aid_officer"],
  citizen: ["citizen"],
  lawyer: ["panel", "panel_lawyer", "judge", "chowki", "sclao", "labour", "chief", "chief_legal_aid_officer", "dlao", "dlao_officer"],
  mediator: ["mediator", "special_mediator"],
  national: ["admin"],
  // Shared sub-screens: reachable by the officer consoles that deep-link into them.
  calendar: "any-staff",
  "case-detail": "any-staff",
  intake: "any-staff",
};

export function canAccessScreen(role: AppRole | string | null | undefined, screen: ScreenId): GuardResult {
  if (!role) {
    return {
      allowed: false,
      redirectTo: "citizen",
      reason: "Sign in to continue",
      reasonBn: "চালিয়ে যেতে সাইন ইন করুন",
    };
  }

  const allowed = SCREEN_ROLES[screen];
  if (allowed === "any-staff" ? role !== "citizen" : allowed.includes(role)) {
    return { allowed: true };
  }

  const expected = DENY_TITLES[screen];
  return {
    allowed: false,
    redirectTo: whichScreen(role),
    reason: `This console is for the ${expected.en}`,
    reasonBn: `এই কনসোলটি ${expected.bn}-এর জন্য।`,
  };
}

/**
 * The Chief console renders two role variants from one template. The guide is
 * specific that the *only* differences are the Panel list and Misconduct tabs:
 * the Chief proposes, the Chairman approves.
 */
export type ChiefVariant = "chief" | "chairman";

export function chiefVariant(role: string | null | undefined): ChiefVariant {
  return role === "chairman" ? "chairman" : "chief";
}

/** Only the Chairman approves panel-list changes; only the Chief proposes them. */
export function canApprovePanelChanges(role: string | null | undefined): boolean {
  return chiefVariant(role) === "chairman";
}

export function canProposePanelChanges(role: string | null | undefined): boolean {
  return chiefVariant(role) === "chief" && role !== "chairman";
}

/** Misconduct actioning is a committee function, so it is not the Chief's alone. */
export function canActionMisconduct(role: string | null | undefined): boolean {
  return role === "chairman";
}

/**
 * Sensitive-case visibility.
 *
 * The severity spec puts Category A ("Immediate Crisis & Safety") cases outside
 * the standard workflow, and the case notes require "role-restricted access" for
 * material like rapidly spreading intimate images. So a case classified as
 * emergency/sensitive is visible to the DLAO and the Chief DLAO only — the Chief
 * because they supervise DLAOs and must be able to see what is escalating, and
 * nobody else, including the mediator, panel lawyer, partner roles and admins.
 *
 * This lives here rather than inside a screen so the rule cannot be re-derived
 * (or quietly omitted) per dashboard. It is a *visibility* filter, not a screen
 * guard: the console still opens, the restricted rows are simply not listed.
 */
export const SENSITIVE_CASE_ROLES: readonly AppRole[] = ["dlao", "chief"];

export function canSeeSensitiveCases(role: string | null | undefined): boolean {
  if (!role) return false;
  // `chairman` is a separate console, and `admin` is system administration, so
  // neither inherits the Chief DLAO's case visibility.
  return SENSITIVE_CASE_ROLES.includes(role as AppRole);
}
