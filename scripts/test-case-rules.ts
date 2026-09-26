/**
 * Business-rule tests for lib/case/domain.ts.
 *
 * These are the rules every dashboard depends on, so they are tested directly
 * rather than through a screen: a broken rule should fail here, not in a browser
 * assertion three layers up. Free — no network, no credits.
 *
 *   npm run test:case-rules
 */
import {
  CASE_STATUSES,
  DEFAULT_MANDATORY_DISTRICTS,
  SLA_STAGES,
  applicationToCase,
  assessSla,
  caseActionState,
  certificationState,
  caseIdFor,
  daysInStageTone,
  isClosed,
  slaAlerts,
  slaScan,
  trackForRole,
  trackSkipsMediation,
  type CaseFacts,
} from "../lib/case/domain";
import {
  APP_ROLES,
  MOCK_ROLE_IDENTITIES,
  canonicalRole,
  isLegacyRole,
  isStaffRole,
  ROLE_DEFINITIONS,
  ROLE_GROUPS,
  rolesInGroup,
} from "../lib/auth/roles";
import {
  canAccessScreen,
  canActionMisconduct,
  canApprovePanelChanges,
  canProposePanelChanges,
  canSeeSensitiveCases,
  chiefVariant,
  isDistrictOfficeRole,
  whichScreen,
} from "../lib/auth/screen-guard";
import {
  classifySeverity,
  IMMEDIATE_CRISIS_CATEGORY,
  isSensitiveClassification,
  tagForSelection,
} from "../lib/agent/knowledge/severity-classification";
import { PROBLEM_CATEGORIES } from "../lib/legal/problem-taxonomy";
import {
  assessLegalAidEligibility,
  MEANS_TEST_MONTHLY_BDT,
  type ApplicantFacts,
} from "../lib/case/legal-aid-eligibility";
import { buildConsultationScript, toBanglaDigits } from "../lib/case/consultation-script";
import { filterLawyers, rankLawyers, type LawyerSummary } from "../lib/case/lawyer-assignment";
import {
  actionsForTrack,
  deadlineFrom,
  describeTracker,
  gradeAction,
  summariseTracker,
} from "../lib/case/lawyer-tracker";
import {
  assistVerdict,
  createAuditEntry,
  decideSend,
  sensitiveOpenNotice,
  type SafeContactProfile,
} from "../lib/case/audit";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

const base = (over: Partial<CaseFacts> = {}): CaseFacts => ({
  status: "review",
  track: "district",
  districtCode: "d1",
  mediations: [],
  lawyerAssigned: false,
  lawyerRequested: false,
  ...over,
});

const MANDATORY = ["d25"];

console.log("caseActionState — terminal states");
for (const status of ["settled", "unresolved"] as const) {
  const s = caseActionState(base({ status }));
  const allBlocked = Object.values(s).every((v) => !v.ok && v.reason === "closed");
  check(`${status} blocks every action`, allBlocked, JSON.stringify(s));
}
check("non-terminal is not closed", !isClosed("review"));
check("every status is a known status", CASE_STATUSES.length === 7);

console.log("caseActionState — mandatory mediation");
{
  const blocked = caseActionState(base({ districtCode: "d25" }), MANDATORY);
  check("mandatory district blocks assignLawyer", !blocked.assignLawyer.ok && blocked.assignLawyer.reason === "mandatory");
  const afterMediation = caseActionState(
    base({ districtCode: "d25", mediations: [{ date: "2026-01-01", outcome: "failed" }], lawyerRequested: true }),
    MANDATORY,
  );
  check("mandatory district allows assignLawyer once mediation failed", afterMediation.assignLawyer.ok);
  const other = caseActionState(base({ districtCode: "d1" }), MANDATORY);
  check("non-mandatory district is unaffected", other.assignLawyer.reason !== "mandatory");
}

console.log("caseActionState — lawyer gate on the district track");
{
  const medLate = caseActionState(base({ status: "mediation", mediations: [{ date: "x", outcome: "scheduled" }] }));
  check("mediation pending blocks assignLawyer (medLate)", !medLate.assignLawyer.ok && medLate.assignLawyer.reason === "medLate");

  const needFailed = caseActionState(base({ mediations: [{ date: "x", outcome: "failed" }] }));
  check("failed mediation still needs escalation (needFailedMed)", !needFailed.assignLawyer.ok && needFailed.assignLawyer.reason === "needFailedMed");

  const ok = caseActionState(base({ mediations: [{ date: "x", outcome: "failed" }], lawyerRequested: true }));
  check("failed + escalated allows assignLawyer", ok.assignLawyer.ok);

  const already = caseActionState(base({ lawyerAssigned: true }));
  check("already assigned blocks again (lawyerAlready)", !already.assignLawyer.ok && already.assignLawyer.reason === "lawyerAlready");

  const settled = caseActionState(base({ mediations: [{ date: "x", outcome: "settled" }] }));
  check("mediation settled blocks a lawyer", !settled.assignLawyer.ok && settled.assignLawyer.reason === "settled");
}

console.log("caseActionState — appellate/labour substitute eligibility for mediation");
{
  check("sclao track is appellate", trackForRole("sclao") === "appellate");
  check("labour track is labour", trackForRole("labour") === "labour");
  check("dlao is a district track", trackForRole("dlao") === "district");
  check("appellate skips mediation", trackSkipsMediation("appellate"));
  check("district does not skip mediation", !trackSkipsMediation("district"));

  const appellate = caseActionState(base({ track: "appellate", status: "review" }));
  check("appellate cannot mediate", !appellate.mediation.ok && appellate.mediation.reason === "trackSkips");

  const noElig = caseActionState(base({ track: "appellate" }));
  check("appellate needs eligibility", !noElig.assignLawyer.ok && noElig.assignLawyer.reason === "needEligibility");

  const withElig = caseActionState(base({ track: "appellate", eligibilityPassed: true }));
  check("appellate allows lawyer once eligible", withElig.assignLawyer.ok);

  // Even a mandatory district must not force mediation onto the appellate track.
  const mand = caseActionState(base({ track: "appellate", eligibilityPassed: true, districtCode: "d25" }), MANDATORY);
  check("mandatory rule does not hijack appellate", mand.assignLawyer.ok);
}

console.log("caseActionState — payment rules");
{
  const nothing = caseActionState(base());
  check("no billable work blocks payment", !nothing.requestPay.ok && nothing.requestPay.reason === "nothingBillable");

  const assigned = caseActionState(base({ lawyerAssigned: true }));
  check("lawyer assigned allows payment", assigned.requestPay.ok);

  const medConcluded = caseActionState(base({ mediations: [{ date: "x", outcome: "settled" }] }));
  check("concluded mediation allows payment", medConcluded.requestPay.ok);

  const pending = caseActionState(base({ lawyerAssigned: true, paymentPending: true }));
  check("pending request blocks a second", !pending.requestPay.ok && pending.requestPay.reason === "pending");

  const medNotAccepted = caseActionState(base({ mediations: [{ date: "x", outcome: "settled" }], forMediator: true }));
  check("mediator unpaid until accepted", !medNotAccepted.requestPay.ok && medNotAccepted.requestPay.reason === "medNotAccepted");

  const medAccepted = caseActionState(
    base({ mediations: [{ date: "x", outcome: "settled" }], forMediator: true, mediatorAccepted: true }),
  );
  check("accepted mediator is payable", medAccepted.requestPay.ok);
}

console.log("caseActionState — transfer rules");
{
  const fresh = caseActionState(base());
  check("transfer allowed before work starts", fresh.transfer.ok);

  const afterMediation = caseActionState(base({ mediations: [{ date: "x", outcome: "failed" }] }));
  check("transfer blocked after mediation", !afterMediation.transfer.ok && afterMediation.transfer.reason === "workStarted");

  const afterLawyer = caseActionState(base({ lawyerAssigned: true }));
  check("transfer blocked after lawyer assigned", !afterLawyer.transfer.ok);

  const pending = caseActionState(base({ transferPending: true }));
  check("one transfer at a time", !pending.transfer.ok && pending.transfer.reason === "transferPending");
}

console.log("caseActionState — advise always ranks");
{
  const s = caseActionState(base());
  check("advise is always allowed", s.advise.ok);
  check("referOut is allowed on an open case", s.referOut.ok);
}

console.log("SLA");
{
  check("three SLA stages", SLA_STAGES.length === 3);
  const review = assessSla("review", 5);
  check("review ok at 5 days", review.level === "ok");
  check("review near at 12 days (15-3)", assessSla("review", 12).level === "near");
  check("review breach at 16 days", assessSla("review", 16).level === "breach");

  const med = assessSla("mediation", 55);
  check("mediation near at 55 days (60-10 warn)", med.level === "near", `got ${med.level}`);
  check("mediation ok at 40 days", assessSla("mediation", 40).level === "ok");
  const medExt = assessSla("mediation", 70, 30);
  check("mediation extension lifts the limit to 90", medExt.limitDays === 90);
  check("extended mediation at 70 days is ok", medExt.level === "ok", `got ${medExt.level}`);
  check("extension is capped at 30", assessSla("mediation", 10, 999).limitDays === 90);

  check("payment warn at 8 days (10-2)", assessSla("payment", 8).level === "near");
  check("payment breach at 11 days", assessSla("payment", 11).level === "breach");

  check("days tone ok under 14", daysInStageTone(10) === "ok");
  check("days tone near at 14", daysInStageTone(14) === "near");
  check("days tone breach at 30", daysInStageTone(30) === "breach");
  check("mediation ages on its own 60/90 clock", daysInStageTone(70, "mediation") === "near");
}

console.log("slaScan / slaAlerts");
{
  const log = slaScan([
    { ref: "A", caseId: "DLAS-D1-2026-00001", stage: "review", ageDays: 13 },
    { ref: "B", caseId: "DLAS-D1-2026-00002", stage: "review", ageDays: 20 },
    { ref: "C", caseId: "DLAS-D1-2026-00003", stage: "payment", ageDays: 12 },
    { ref: "D", caseId: "DLAS-D1-2026-00004", stage: "mediation", ageDays: 10 },
  ]);
  check("only breached/near are logged", log.length === 3, `${log.length}`);
  check("A is near (15 limit, 3 warn, 13 used)", log.find((e) => e.ref === "A")?.level === "near");
  check("healthy case is not logged", !log.some((e) => e.ref === "D"));

  const dlao = slaAlerts(log, "dlao");
  check("dlao sees only its own stages", dlao.items.every((e) => e.role === "dlao"), JSON.stringify(dlao.items.map((e) => e.role)));
  const chief = slaAlerts(log, "chief");
  check("chief sees the payment queue", chief.total === 1);
  check("breach is counted separately from near", log.some((e) => e.level === "breach") && log.some((e) => e.level === "near"));
  check("totals add up", slaAlerts(log).total === log.length);
}

console.log("mandatory districts + id minting");
{
  check("mandatory list is configuration-sized", DEFAULT_MANDATORY_DISTRICTS.length === 20, `${DEFAULT_MANDATORY_DISTRICTS.length}`);
  check("case id format", caseIdFor("d25", 2026, 4417) === "DLAS-D25-2026-04417", caseIdFor("d25", 2026, 4417));
  check("application graduates to a case id", /^DLAS-D\d+-\d{4}-\d{5}$/.test(applicationToCase({ appId: "APP-4471", districtCode: "d7" })));
}

console.log("settlement certification");
{
  check("cannot certify unsigned", !certificationState(false, true, false).ok);
  check("cannot certify with one signature", !certificationState(true, false, false).ok);
  check("certifies when both signed", certificationState(true, true, false).ok);
  check("cannot certify twice", !certificationState(true, true, true).ok);
}

console.log("role registry — every offered role must actually log in");
{
  // This exists because "panel" was in ROLE_DEFINITIONS and the mock table but not
  // in APP_ROLES, so the login picker offered a role that returned 400. tsc could
  // not see it because the mock table is cast. Assert the three sets agree instead.
  const canonical = ROLE_DEFINITIONS.map((r) => r.key);
  const grouped = ROLE_GROUPS.flatMap((g) => rolesInGroup(g.id).map((r) => r.key));
  check("every definition sits in a group", canonical.every((k) => grouped.includes(k)),
    canonical.filter((k) => !grouped.includes(k)).join(","));
  check("the picker covers every definition", grouped.length === canonical.length, `${grouped.length} vs ${canonical.length}`);
  for (const key of canonical) {
    check(`${key} is a recognised staff role`, isStaffRole(key));
    check(`${key} has a mock identity`, Boolean(MOCK_ROLE_IDENTITIES[key as keyof typeof MOCK_ROLE_IDENTITIES]));
  }
  check("citizen is not a staff role", !isStaffRole("citizen"));
  check("a nonsense key is rejected", !isStaffRole("nope"));
  check("legacy keys are flagged", isLegacyRole("dlao_officer") && isLegacyRole("panel_lawyer"));
  check("canonical keys are not legacy", !isLegacyRole("dlao") && !isLegacyRole("panel"));
  check("legacy maps to canonical", canonicalRole("panel_lawyer") === "panel" && canonicalRole("dlao_officer") === "dlao");
  check("canonical maps to itself", canonicalRole("dlao") === "dlao");
  // Every legacy key must still be accepted, or an existing session stops resolving.
  for (const legacy of ["chief_legal_aid_officer", "metropolitan_legal_aid_officer", "dlao_officer", "special_mediator", "paralegal", "udc_entrepreneur", "panel_lawyer"]) {
    check(`legacy ${legacy} still logs in`, isStaffRole(legacy) && Boolean(MOCK_ROLE_IDENTITIES[legacy as keyof typeof MOCK_ROLE_IDENTITIES]));
  }
  check("APP_ROLES contains every canonical key", canonical.every((k) => (APP_ROLES as readonly string[]).includes(k)),
    canonical.filter((k) => !(APP_ROLES as readonly string[]).includes(k)).join(","));
  check("APP_ROLES contains every legacy key", ["dlao_officer","chief_legal_aid_officer","metropolitan_legal_aid_officer","special_mediator","paralegal","udc_entrepreneur","panel_lawyer","citizen"].every((k) => (APP_ROLES as readonly string[]).includes(k)));
}

console.log("screen guard — routing and denial");
{
  check("dlao lands on the officer console", whichScreen("dlao") === "dlao");
  check("chief lands on the chief console", whichScreen("chief") === "chief");
  check("chairman shares the chief console", whichScreen("chairman") === "chief");
  check("panel lawyer lands on the lawyer console", whichScreen("panel") === "lawyer");
  check("admin lands on the national console", whichScreen("admin") === "national");
  check("citizen lands on their own console", whichScreen("citizen") === "citizen");
  check("unknown role falls back to the officer console", whichScreen("nope") === "dlao");

  check("dlao may open the DLAO console", canAccessScreen("dlao", "dlao").allowed);
  check("citizen may not open the DLAO console", !canAccessScreen("citizen", "dlao").allowed);
  const denied = canAccessScreen("citizen", "chief");
  check("a denied staff screen redirects to the caller's own", denied.redirectTo === "citizen", JSON.stringify(denied));
  check("denial names the expected role in Bangla", Boolean(denied.reasonBn), denied.reasonBn);
  check("chief may open the chief console", canAccessScreen("chief", "chief").allowed);
  check("chairman may open the chief console", canAccessScreen("chairman", "chief").allowed);
  check("dlao may not open the national console", !canAccessScreen("dlao", "national").allowed);
  check("admin may open the national console", canAccessScreen("admin", "national").allowed);
  check("a shared sub-screen is open to staff", canAccessScreen("dlao", "calendar").allowed && canAccessScreen("dlao", "case-detail").allowed);
  check("a citizen cannot open a shared staff sub-screen", !canAccessScreen("citizen", "case-detail").allowed);
  check("signed out is sent to sign in", canAccessScreen(null, "dlao").redirectTo === "citizen");
}

console.log("screen guard — chief/chairman variants");
{
  check("chief variant is chief", chiefVariant("chief") === "chief");
  check("chairman variant is chairman", chiefVariant("chairman") === "chairman");
  check("chief proposes panel changes", canProposePanelChanges("chief"));
  check("chairman does not propose", !canProposePanelChanges("chairman"));
  check("chairman approves panel changes", canApprovePanelChanges("chairman"));
  check("chief does not approve", !canApprovePanelChanges("chief"));
  check("misconduct is the committee's alone", canActionMisconduct("chairman") && !canActionMisconduct("chief"));
  check("appellate/labour/call-centre are not district office roles", !isDistrictOfficeRole("sclao") && !isDistrictOfficeRole("labour") && !isDistrictOfficeRole("callcentre"));
  check("dlao is a district office role", isDistrictOfficeRole("dlao"));
}

console.log("safe contact — never message the wrong phone");
{
  const profile: SafeContactProfile = {
    ref: "DLAS-D25-2026-00007",
    riskHigh: true,
    neutralOnly: false,
    destinations: [
      { channel: "sms", kindBn: "আবেদনকারীর নম্বর", toBn: "01XXXXXXXXX", rule: "block", whyBn: "নম্বরটি অত্যন্তার স্বামীর।" },
      { channel: "portal", kindBn: "পোর্টাল বার্তা", toBn: "অ্যাকাউন্ট", rule: "allow", whyBn: "নিরপেক্ষ মাধ্যম।" },
      { channel: "voice", kindBn: "কল করার জন্য", toBn: "01XXXXXXXXX", rule: "window", whyBn: "দুপুর ২টা–৫টা নিরাপদ।" },
    ],
  };
  const sms = decideSend(profile, "sms");
  check("blocked SMS is refused", !sms.allowed && sms.rule === "block");
  check("the refusal states a reason", sms.whyBn.length > 0, sms.whyBn);
  const portal = decideSend(profile, "portal");
  check("neutral channel is allowed", portal.allowed && !portal.deferred);
  const voice = decideSend(profile, "voice");
  check("window channel is deferred, not refused", voice.allowed && voice.deferred);
  check("an unlisted channel fails closed", !decideSend(profile, "rep").allowed);
  check("a missing profile fails closed", !decideSend(null, "sms").allowed);

  const neutralOnly: SafeContactProfile = { ...profile, neutralOnly: true, destinations: profile.destinations.map((d) => ({ ...d, rule: "allow" as const })) };
  check("neutralOnly blocks SMS even when marked allow", !decideSend(neutralOnly, "sms").allowed);
}

console.log("audit + assist");
{
  const e = createAuditEntry({ kind: "sensitive_case_opened", refId: "DLAS-D25-2026-00007", actorId: "STAFF-1", actorRole: "dlao", detail: "name viewed" });
  check("audit entry gets an id", e.id.startsWith("AUD-"), e.id);
  check("audit entry is timestamped", !Number.isNaN(Date.parse(e.at)));
  const assist = assistVerdict("high");
  check("assist ranks only, never decides", assist.ranksOnly === true);
  const notice = sensitiveOpenNotice("মো. করিম", "DLAS-D25-2026-00007");
  check("sensitive-open notice names the officer", notice.bn.includes("মো. করিম"));
  check("sensitive-open notice names the case", notice.bn.includes("DLAS-D25-2026-00007"));
  check("sensitive-open notice tells the applicant they may request the log", /অনুলিপি|লগ/.test(notice.bn));
}

console.log("");
console.log("severity screening — spec Category A must not file as a general inquiry");
{
  // The exact text of the case that was misfiled as "General Inquiry": the stored
  // problem statement is the category-derived Bangla question, so the wording is a
  // fixed string and the taxonomy selection is the honest signal.
  const onlineSexual = "সাইবার নিরাপত্তা ও অনলাইন অপরাধ: অনলাইনে আমাকে যৌনভাবে হয়রানি করা হচ্ছে বা অশ্লীল বার্তা/ছবি পাঠানো হচ্ছে?";
  const a = classifySeverity(onlineSexual, { categoryId: "cyber", subcategoryId: "y1" });
  check("online sexual harassment is an emergency", a.severity === "emergency", a.severity);
  check("online sexual harassment is Category A", a.category === IMMEDIATE_CRISIS_CATEGORY, a.category);
  check("online sexual harassment is sensitive", isSensitiveClassification(a));
  check("Category A is filed under the Nari O Shishu Act", a.legalBasis.some((b) => /Nari O Shishu/.test(b)), a.legalBasis.join(", "));

  // The stored statement is composed by the route as "<category>: <sub-category>",
  // so each sub-category is screened against its own real text. Reusing one
  // statement for every id would test nothing: a sexual-harassment sentence
  // mentioning "অশ্লীল" should escalate whichever id it arrives with.
  const cyber = PROBLEM_CATEGORIES.find((c) => c.id === "cyber")!;
  const statementFor = (subId: string) => {
    const sub = cyber.subcategories.find((x) => x.id === subId)!;
    return `${cyber.bn}: ${sub.bn}`;
  };

  // Cyber bullying, defamation, blackmail and fraud are Category D. Escalating the
  // whole category would make the sensitive filter meaningless.
  for (const sub of ["y2", "y3", "y5", "y8"]) {
    const d = classifySeverity(statementFor(sub), { categoryId: "cyber", subcategoryId: sub });
    check(`cyber ${sub} stays Category D`, d.category === "Labor, Cyber & Specialized Rights" && d.severity === "high", `${d.severity}/${d.category}`);
    check(`cyber ${sub} is not sensitive`, !isSensitiveClassification(d));
  }
  // Sexual content and a minor online are Category A regardless of the platform.
  for (const sub of ["y1", "y4", "y10"]) {
    const c = classifySeverity(statementFor(sub), { categoryId: "cyber", subcategoryId: sub });
    check(`cyber ${sub} escalates to Category A`, isSensitiveClassification(c), `${c.severity}/${c.category}`);
  }

  check("the sub-category escape hatch carries no spec tag", tagForSelection("cyber", "other") === null);
  check("an unrelated question stays a general inquiry",
    classifySeverity("আপনি কি বলতে পারবেন জমির দলিল কিভাবে হয়").category === "General Inquiry");
  check("a kinship query is not auto-escalated",
    classifySeverity("ধর্ষণ আইনটা কি আছে").severity === "standard");
}

console.log("");
console.log("sensitive-case visibility — DLAO and Chief DLAO only");
{
  check("DLAO can see sensitive cases", canSeeSensitiveCases("dlao"));
  check("Chief DLAO can see sensitive cases", canSeeSensitiveCases("chief"));
  for (const role of ["mediator", "panel", "chairman", "admin", "ngo", "mobile_agent", "udc", "referral", "judge", "callcentre", "udc_entrepreneur", "panel_lawyer"]) {
    check(`${role} cannot see sensitive cases`, !canSeeSensitiveCases(role));
  }
  check("no session cannot see sensitive cases", !canSeeSensitiveCases(null));
  check("cdlao resolves to the Chief role", canonicalRole("cdlao") === "chief", String(canonicalRole("cdlao")));
  check("cdlao can therefore see sensitive cases", canSeeSensitiveCases(canonicalRole("cdlao")));
}

console.log("");
console.log("legal aid eligibility — the three limbs of the stated rule");
{
  // A woman facing online abuse AND financially unable to pursue justice: the
  // paragraph says she qualifies, and the abuse is the substantive reason.
  const nabilla = assessLegalAidEligibility({
    gender: "female",
    employed: false,
    monthlyIncome: null,
    onlineAbuseAgainstWoman: true,
    categoryId: "cyber",
    subcategoryId: "y1",
  });
  check("woman facing online abuse and means-tested is eligible", nabilla.eligible);
  check("the abuse is named as the basis, not unemployment", nabilla.basis === "woman_online_abuse", String(nabilla.basis));
  check("unemployment is still recorded as an additional ground", nabilla.grounds.some((g) => g.code === "unemployed"));
  check("the cyber limb is decisive here, not conditional", nabilla.conditionalBasis === false);
  check("an assurance is always produced", nabilla.assuranceBn.length > 10);

  // Protected categories outrank a means ground, because they survive getting a job.
  const disabled = assessLegalAidEligibility({ gender: "female", hasDisability: true, employed: false });
  check("disability is a decisive ground", disabled.basis === "person_with_disability", String(disabled.basis));
  const trafficking = assessLegalAidEligibility({ gender: "female", traffickingRisk: true, categoryId: "cyber" });
  check("trafficking is a decisive ground", trafficking.basis === "trafficking_victim", String(trafficking.basis));
  check("trafficking is urgent priority", trafficking.priority === "urgent", trafficking.priority);

  // Neither limb proven -> refused, and the refusal still explains itself.
  const refused = assessLegalAidEligibility({ gender: "male", employed: true, ableToWork: true, monthlyIncome: 60000 });
  check("a solvent applicant is not eligible", refused.eligible === false);
  check("a refusal still carries an assurance", refused.assuranceBn.length > 10);
  check("a refusal has no basis", refused.basis === null);

  // The cyber limb is genuinely weaker on its own: "particularly where" is binding.
  const womanAlone = assessLegalAidEligibility({ gender: "female", employed: true, ableToWork: true, monthlyIncome: 50000, onlineAbuseAgainstWoman: true });
  check("online abuse alone is not enough to be eligible", womanAlone.eligible === false);
  check("online abuse alone is a conditional basis", womanAlone.conditionalBasis === true);
  check("a conditional basis is not urgent", womanAlone.priority !== "urgent");

  // The cyber limb belongs to women specifically.
  const manOnline = assessLegalAidEligibility({ gender: "male", onlineAbuseAgainstWoman: true });
  check("the protected cyber limb does not extend to men", manOnline.grounds.length === 0);

  // Unknown is not a negative answer.
  const unknown = assessLegalAidEligibility({ gender: "male", monthlyIncome: null });
  check("unknown income is not treated as insolvent", !unknown.grounds.some((g) => g.code === "financially_insolvent"));
  check("unasked questions are not counted as no", !unknown.grounds.some((g) => g.code === "unemployed"));

  // The statute quoted must be the one the deciding ground engages. This caught a
  // disability applicant being quoted the Digital Security Act because the act was
  // chosen from the raw flags rather than from the basis.
  for (const facts of [
    { gender: "female", hasDisability: true, onlineAbuseAgainstWoman: true, categoryId: "cyber", subcategoryId: "y1" },
    { gender: "female", traffickingRisk: true, categoryId: "cyber" },
    { gender: "female", employed: false, onlineAbuseAgainstWoman: true, categoryId: "cyber", subcategoryId: "y1" },
    { gender: "male", isChild: true, categoryId: "family" },
    { gender: "male", hasDisability: true, categoryId: "cheque" },
  ] as ApplicantFacts[]) {
    const d = assessLegalAidEligibility(facts);
    check(`act matches the basis (${d.basis})`, Boolean(d.act && d.basis), `${d.basis} / ${d.act?.en}`);
  }
  const dis = assessLegalAidEligibility({ gender: "female", hasDisability: true, onlineAbuseAgainstWoman: true, categoryId: "cyber" });
  check("a disability decision quotes the disability act", /Disabilities/.test(dis.act.en), dis.act.en);
  const onl = assessLegalAidEligibility({ gender: "female", employed: false, onlineAbuseAgainstWoman: true, categoryId: "cyber" });
  check("an online-abuse decision quotes the Digital Security Act", /Digital Security/.test(onl.act.en), onl.act.en);

  // An unrecognised category still yields a statute to quote.
  const odd = assessLegalAidEligibility({ gender: "male", hasDisability: true, categoryId: "not_a_category" });
  check("an unknown category still resolves an act", Boolean(odd.act && odd.act.en.length > 0));
}

console.log("");
console.log("consultation script — deterministic and driven by the facts");
{
  const base = {
    applicantName: "নাবিলা",
    phoneLast4: "7556",
    districtName: "ঢাকা",
    categoryBn: "সাইবার নিরাপত্তা ও অনলাইন অপরাধ",
    problemStatement: "অনলাইনে আমাকে যৌনভাবে হয়রানি করা হচ্ছে",
    dlaoName: "মো. করিম",
    panelLawyerName: "অ্যাডভোকেট সালমা খাতুন",
  };
  const eligibleFacts = {
    gender: "female",
    employed: false,
    monthlyIncome: null,
    onlineAbuseAgainstWoman: true,
    categoryId: "cyber",
    subcategoryId: "y1",
  };
  const a = buildConsultationScript({ ...base, facts: eligibleFacts });
  const b = buildConsultationScript({ ...base, facts: eligibleFacts });
  check("the same facts produce an identical transcript", JSON.stringify(a) === JSON.stringify(b));
  check("turn numbering is contiguous from 1", a.turns.every((t, i) => t.seq === i + 1));

  // Every phase the brief asked for is actually present.
  for (const phase of ["connect", "identity", "finance", "consultation", "decision", "assignment", "close"] as const) {
    check(`the script contains the ${phase} phase`, a.turns.some((t) => t.phase === phase));
  }
  const events = a.turns.map((t) => t.event).filter(Boolean);
  check("identity is confirmed live", events.includes("identity_confirmed"));
  check("means are confirmed live", events.includes("finance_confirmed"));
  check("the act engaged is stated", events.includes("act_engaged"));
  check("eligibility is decided on the record", events.includes("eligibility_decided"));
  check("the consultation ends by filing the case", events.includes("consultation_complete"));
  check("an eligible applicant gets a lawyer", a.appointsPanelLawyer === true);
  check("the act is quoted for the officer", a.actSentenceBn.length > 0);
  check("the applicant thanks the officer", a.turns.some((t) => t.phase === "close" && t.speaker === "applicant" && t.textBn.includes("ধন্যবাদ")));
  check("the applicant is called back, not asked to call", a.turns[0]?.textBn.includes("কল করা হচ্ছে"));

  // The simulation has to be able to go the other way.
  const refused = buildConsultationScript({
    ...base,
    applicantName: "রহিম",
    facts: { gender: "male", employed: true, ableToWork: true, monthlyIncome: 60000, categoryId: "rent", subcategoryId: "r1" },
  });
  check("a solvent applicant is not promised a lawyer", refused.appointsPanelLawyer === false);
  check("a refusal appoints nobody", !refused.turns.some((t) => t.event === "lawyer_assigned"));
  check("a refusal is still recorded on the call", refused.turns.some((t) => t.event === "eligibility_decided"));
  check("a refusal is summarised as such", /পর্যালোচনা|শর্ত পূরণ হয়নি/.test(refused.outcomeSummaryBn), refused.outcomeSummaryBn);
  check("the two applicants get different transcripts", JSON.stringify(a) !== JSON.stringify(refused));

  // Bangla digits, because this is a spoken transcript.
  check("digits are spoken in Bangla", toBanglaDigits("7556") === "৭৫৫৬", toBanglaDigits("7556"));

  // No internal identifiers may leak into anything the applicant reads.
  const spoken = a.turns.map((t) => t.textBn).join(" ");
  for (const leak of ["woman_online_abuse", "decisive", "Severity", "Category A", "eligible"]) {
    check(`no internal identifier leaks: ${leak}`, !spoken.includes(leak));
  }
}

console.log("");
console.log("lawyer tracker — the applicant can see whether the lawyer is behind");
{
  const assigned = "2026-09-01T00:00:00Z";
  const plan = actionsForTrack("all");
  check("the plan has real steps", plan.length >= 3, String(plan.length));
  check("first contact is expected within days", (plan.find((a) => a.code === "first_contact")?.days ?? 99) <= 7);
  check("every action has a Bangla label", plan.every((a) => a.labelBn.length > 4));
  check("deadlines run from the appointment", deadlineFrom(assigned, 3).startsWith("2026-09-04"), deadlineFrom(assigned, 3));
  check("the court steps are not on the default track", !plan.some((a) => a.code === "filed_in_court"));
  check("the court track does carry them", actionsForTrack("court").some((a) => a.code === "filed_in_court"));

  const now = new Date("2026-09-26T00:00:00Z");
  const at = (code: string, due: string | null, done: string | null) =>
    gradeAction({ code, labelBn: code, dueAt: due, doneAt: done, noteBn: null }, assigned, now);

  check("a completed action is done", at("first_contact", "2026-09-04", "2026-09-03").state === "done");
  check("a past deadline is overdue", at("first_contact", "2026-09-04", null).state === "overdue");
  check("overdue reports how many days late", at("first_contact", "2026-09-04", null).daysRemaining === -22);
  check("a distant deadline is pending", at("report_filed", "2026-10-16", null).state === "pending");
  check("a deadline inside the window is due soon", at("docs_collected", "2026-09-28", null).state === "due_soon");
  check("elapsed days since appointment is counted", at("first_contact", "2026-09-04", null).elapsedDays === 25);
  check("a missing deadline reads as not applicable", at("first_contact", null, null).state === "na");

  // A malformed row must not blank a citizen's page.
  const junk = gradeAction({ code: "first_contact", labelBn: "x", dueAt: "not-a-date", doneAt: null, noteBn: null }, "also-not-a-date", now);
  check("a malformed date does not throw", typeof junk.state === "string");
  check("a malformed date is not counted as overdue", junk.state !== "overdue", junk.state);

  const all = plan.map((a) => gradeAction({ code: a.code, labelBn: a.labelBn, dueAt: deadlineFrom(assigned, a.days), doneAt: null, noteBn: null }, assigned, now));
  const sum = summariseTracker(all, assigned, now);
  check("an untouched case is mostly overdue", sum.overdue >= 3, String(sum.overdue));
  check("progress starts at zero", sum.progressPercent === 0, String(sum.progressPercent));
  check("the worst step is named", sum.worst?.code === "first_contact", String(sum.worst?.code));
  check("days since appointment is reported", sum.daysSinceAppointment === 25, String(sum.daysSinceAppointment));

  const half = plan.map((a) => gradeAction({ code: a.code, labelBn: a.labelBn, dueAt: deadlineFrom(assigned, a.days), doneAt: a.code === "first_contact" ? "2026-09-02" : null, noteBn: null }, assigned, now));
  const hs = summariseTracker(half, assigned, now);
  check("one of four is a quarter done", hs.done === 1 && hs.progressPercent === 25, `${hs.done}/${hs.progressPercent}`);
  check("the summary reads in plain Bangla", /দিন/.test(describeTracker(hs)), describeTracker(hs));
  check("an overdue summary tells the applicant what to do first", /সবার আগে/.test(describeTracker(sum)));
  check("no internal code leaks into the applicant text", !describeTracker(sum).includes("first_contact"));
}

console.log("");
console.log("lawyer assignment — a DLAO can choose, and the choice is exclusive");
{
  const roster: LawyerSummary[] = [
    { id: "a", name: "অ্যাডভোকেট আ", kind: "lawyer", barRegistration: "A-1", specialisations: "জমি", jurisdiction: "ঢাকা", phone: null, email: null, listStatus: "on_panel", activeAssignments: 3, overdueActions: 2, assignable: true },
    { id: "b", name: "অ্যাডভোকেট ব", kind: "lawyer", barRegistration: "B-2", specialisations: "সাইবার", jurisdiction: "ঢাকা", phone: null, email: null, listStatus: "on_panel", activeAssignments: 0, overdueActions: 0, assignable: true },
    { id: "c", name: "অ্যাডভোকেট স", kind: "lawyer", barRegistration: null, specialisations: null, jurisdiction: "সিলেট", phone: null, email: null, listStatus: "removed", activeAssignments: 0, overdueActions: 0, assignable: false },
  ];

  const ranked = rankLawyers(roster);
  check("the least loaded assignable lawyer is offered first", ranked[0].id === "b", ranked[0].id);
  check("someone off the panel never outranks someone on it", ranked[ranked.length - 1].id === "c", ranked[ranked.length - 1].id);
  // Feeds the removed lawyer in first, so a sort that only looked at workload would
  // leave them on top. Being idle must not buy a place ahead of an assignable lawyer.
  check("idleness cannot promote a removed lawyer", rankLawyers([roster[2], roster[1]])[0].assignable === true);

  check("search matches the name", filterLawyers(roster, "ব").map((r) => r.id).join() === "b");
  check("search matches the bar number", filterLawyers(roster, "A-1").map((r) => r.id).join() === "a");
  check("search matches the specialisation", filterLawyers(roster, "সাইবার").map((r) => r.id).join() === "b");
  check("search matches the district", filterLawyers(roster, "সিলেট").map((r) => r.id).join() === "c");
  check("search is case-insensitive", filterLawyers(roster, "a-1").length === 1);
  check("an empty query returns everything", filterLawyers(roster, "   ").length === 3);
  check("a query matching nothing returns nothing", filterLawyers(roster, "zzz").length === 0);
  check("search does not mutate the roster", roster[0].id === "a" && roster.length === 3);
}

if (failures.length) {
  console.log(`${failures.length} FAILED of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log(`All ${pass} case-rule checks passed`);
