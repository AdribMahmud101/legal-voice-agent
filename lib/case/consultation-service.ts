/**
 * Runs a DLAO consultation for an application and promotes it to a case.
 *
 * Kept out of the route so the whole handover — script, transcript, eligibility
 * decision, panel lawyer assignment, application -> case promotion — is one
 * transaction-shaped operation that can be called from a route, a test or a script.
 * The rules themselves live in `consultation-script.ts` and
 * `legal-aid-eligibility.ts`; nothing here decides anything.
 */

import { buildConsultationScript, type ConsultationScript } from "./consultation-script";
import type { ApplicantFacts, EligibilityDecision } from "./legal-aid-eligibility";
import type { D1Database } from "@/lib/auth/d1-session";

export interface StartConsultationInput {
  applicationId: string;
  applicationTime: string;
  applicantUserId: string;
  applicantName: string;
  phone: string;
  district: string;
  problemStatement: string;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryBn: string;
  facts: ApplicantFacts;
  dlaoUserId: string;
  dlaoName: string;
  panelLawyerId?: string | null;
  panelLawyerName?: string | null;
}

function rid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function last4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4) || "0000";
}

/** Builds the script and the DLAO-facing outcome without touching the database. */
export function planConsultation(input: StartConsultationInput): ConsultationScript {
  return buildConsultationScript({
    applicantName: input.applicantName,
    phoneLast4: last4(input.phone),
    districtName: input.district,
    problemStatement: input.problemStatement,
    categoryBn: input.categoryBn,
    facts: input.facts,
    dlaoName: input.dlaoName,
    panelLawyerName: input.panelLawyerName,
  });
}

export interface PersistedConsultation {
  consultationId: string;
  caseId: string | null;
  panelAssignmentId: string | null;
  decision: EligibilityDecision;
  script: ConsultationScript;
  /** True when this call created a case, false when an earlier one already did. */
  created: boolean;
}

/**
 * Idempotent on `applicationId`. A double submit, a re-render, or the applicant
 * refreshing mid-call must not produce a second conversation or a second case — the
 * unique index on `consultations.application_id` enforces it, and the existing row
 * is returned instead.
 */
export async function startOrResumeConsultation(
  db: D1Database,
  input: StartConsultationInput,
): Promise<PersistedConsultation> {
  const existing = await db
    .prepare(
      `SELECT id, case_id, transcript_json FROM consultations WHERE application_id = ? LIMIT 1`,
    )
    .bind(input.applicationId)
    .first<{ id: string; case_id: string | null; transcript_json: string }>();

  if (existing) {
    const assignment = await db
      .prepare(`SELECT id FROM panel_assignments WHERE consultation_id = ? LIMIT 1`)
      .bind(existing.id)
      .first<{ id: string }>();
    // transcript_json is the whole serialised script, so the resume path replays
    // exactly what the first call produced rather than re-deriving it.
    const script = JSON.parse(existing.transcript_json || "{}") as ConsultationScript;
    return {
      consultationId: existing.id,
      caseId: existing.case_id,
      panelAssignmentId: assignment?.id ?? null,
      decision: script.decision,
      script,
      created: false,
    };
  }

  const script = planConsultation(input);
  const consultationId = rid("CONS");
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO consultations
        (id, application_id, citizen_user_id, dlao_user_id, district, channel, phase, status,
         outcome, eligibility_basis, act_bn, transcript_json, summary_bn, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, 'callback', 'close', 'completed', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      consultationId,
      input.applicationId,
      input.applicantUserId,
      input.dlaoUserId,
      input.district,
      script.decision.eligible ? "eligible" : script.decision.conditionalBasis ? "conditional" : "ineligible",
      script.decision.basis,
      script.decision.act.bn,
      JSON.stringify(script),
      script.outcomeSummaryBn,
      now,
      now,
    )
    .run();

  // Turns are inserted individually rather than in a loop-built multi-statement
  // string: D1 parameterises each bind, so a Bangla transcript cannot break out of
  // the statement the way an interpolated one could.
  for (const turn of script.turns) {
    await db
      .prepare(
        `INSERT INTO consultation_turns (id, consultation_id, seq, phase, speaker, text_bn, event)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(rid("TURN"), consultationId, turn.seq, turn.phase, turn.speaker, turn.textBn, turn.event ?? null)
      .run();
  }

  // Promote the application into a case. The application route already created a
  // `cases` row, so the case is adopted rather than created again — creating a
  // second one would split the docket and orphan the application.
  const existingCase = await db
    .prepare(`SELECT id, docket_id FROM cases WHERE id IN (SELECT case_id FROM applications WHERE id = ?)`)
    .bind(input.applicationId)
    .first<{ id: string; docket_id: string }>();

  let caseId = existingCase?.id ?? null;
  if (!caseId) {
    const link = await db
      .prepare(`SELECT case_id FROM application_case_links WHERE application_id = ?`)
      .bind(input.applicationId)
      .first<{ case_id: string }>();
    caseId = link?.case_id ?? null;
  }
  if (!caseId) {
    caseId = rid("CASE");
    const year = new Date().getUTCFullYear();
    const docket = `DLAS-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
    await db
      .prepare(
        // voice_session_id is NOT NULL with no default, and a web application has no
        // voice session, so it is keyed on the application id. That also keeps the
        // case tracking login working: the id is unique and stable.
        `INSERT INTO cases (id, docket_id, citizen_user_id, voice_session_id, problem, category, stage, is_demo, district, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'review', 0, ?, ?)`,
      )
      .bind(
        caseId,
        docket,
        input.applicantUserId,
        input.applicationId,
        input.problemStatement,
        input.categoryId,
        input.district,
        now,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO application_case_links
        (id, application_id, case_id, consultation_id, promoted_by_user_id, promoted_by_name_bn, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'consultation_completed')`,
    )
    .bind(rid("ACL"), input.applicationId, caseId, consultationId, input.dlaoUserId, input.dlaoName)
    .run();

  // Record the screening result on the case itself, so the DLAO queue can sort by it
  // without joining the consultation transcript.
  await db
    .prepare(
      // `cases.stage` is constrained to CASE_STATUSES, so 'enrolled' would fail the
      // CHECK outright. A screened case starts at 'review' and only moves to 'lawyer'
      // once a panel lawyer is actually on it.
      `UPDATE cases SET eligibility_passed = ?, problem_category = ?, problem_subcategory = ?,
              stage = ?, stage_changed_at = ? WHERE id = ?`,
    )
    .bind(
      script.decision.eligible ? 1 : 0,
      input.categoryId,
      input.subcategoryId,
      // Only a real appointment moves the case on; a refusal stays in review.
      script.appointsPanelLawyer && input.panelLawyerId ? "lawyer" : "review",
      now,
      caseId,
    )
    .run();

  // Stage history, so the applicant's progress stepper is showing recorded fact
  // rather than a stage string read off the current row. Submitted -> review happens
  // when the application is filed; review -> lawyer only when a lawyer is really on it.
  await db
    .prepare(
      `INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note)
       VALUES (?, ?, ?, 'review', ?, 'dlao', ?)`,
    )
    .bind(rid("CSH"), caseId, "submitted", input.dlaoUserId, `আবেদন গ্রহণ ও সংলাপ সম্পন্ন: ${input.applicationId}`)
    .run();

  let panelAssignmentId: string | null = null;
  if (script.appointsPanelLawyer && input.panelLawyerId) {
    panelAssignmentId = rid("PA");
    await db
      .prepare(
        `INSERT INTO panel_assignments
          (id, case_id, consultation_id, citizen_user_id, panel_lawyer_id, lawyer_name_bn,
           assigned_by_user_id, assigned_by_name_bn, district, eligibility_basis, act_bn, status, note_bn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .bind(
        panelAssignmentId,
        caseId,
        consultationId,
        input.applicantUserId,
        input.panelLawyerId,
        input.panelLawyerName ?? null,
        input.dlaoUserId,
        input.dlaoName,
        input.district,
        script.decision.basis,
        script.decision.act.bn,
        `${script.decision.basisBn} — ${script.actSentenceBn}`,
      )
      .run();
  }

  if (script.appointsPanelLawyer && input.panelLawyerId) {
    await db
      .prepare(
        `INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note)
         VALUES (?, ?, 'review', 'lawyer', ?, 'dlao', ?)`,
      )
      .bind(rid("CSH"), caseId, input.dlaoUserId, `${script.decision.basisBn} — প্যানেল আইনজীবী নিয়োগ`)
      .run();
  }

  await db
    .prepare(`UPDATE consultations SET case_id = ? WHERE id = ?`)
    .bind(caseId, consultationId)
    .run();

  return {
    consultationId,
    caseId,
    panelAssignmentId,
    decision: script.decision,
    script,
    created: true,
  };
}
