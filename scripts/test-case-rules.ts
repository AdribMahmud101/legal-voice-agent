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
  chiefVariant,
  isDistrictOfficeRole,
  whichScreen,
} from "../lib/auth/screen-guard";
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
if (failures.length) {
  console.log(`${failures.length} FAILED of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log(`All ${pass} case-rule checks passed`);
