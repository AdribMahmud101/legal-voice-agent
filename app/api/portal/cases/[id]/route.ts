import { NextResponse } from "next/server";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const ctx = getCloudflareContext();
    const db = (ctx.env as any).DB;
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const stmt = db.prepare("SELECT * FROM cases WHERE id = ?");
    const caseData = await stmt.bind(id).first();

    if (!caseData) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const mappedCase: any = {
      id: caseData.id,
      docketId: caseData.docket_id,
      citizenUserId: caseData.citizen_user_id,
      voiceSessionId: caseData.voice_session_id,
      problem: caseData.problem,
      summary: caseData.problem, 
      district: caseData.district,
      thana: caseData.thana,
      category: caseData.category,
      status: caseData.status,
      assignedLawyerId: caseData.assigned_lawyer_id,
      dlaoNotes: caseData.dlao_notes,
      createdAt: caseData.created_at,
      updatedAt: caseData.updated_at,
    };

    const userStmt = db.prepare("SELECT display_name, phone FROM users WHERE id = ?");
    const citizenUser = await userStmt.bind(caseData.citizen_user_id).first();
    if (citizenUser) {
      mappedCase.citizenName = citizenUser.display_name;
      mappedCase.citizenPhone = citizenUser.phone;
    } else {
      mappedCase.citizenName = "Unknown";
      mappedCase.citizenPhone = "Unknown";
    }

    // Check visibility
    if (user.role === "citizen" && caseData.citizen_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (user.role === "panel_lawyer" && caseData.assigned_lawyer_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, case: mappedCase });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // Only DLAO and lawyer can patch
    if (user.role === "citizen") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json();

    const ctx = getCloudflareContext();
    const db = (ctx.env as any).DB;
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const updates: string[] = [];
    const values: any[] = [];

    if (body.status) {
      updates.push("status = ?");
      values.push(body.status);
    }
    if (body.assignedLawyerId !== undefined) {
      updates.push("assigned_lawyer_id = ?");
      values.push(body.assignedLawyerId);
    }
    if (body.dlaoNotes !== undefined) {
      updates.push("dlao_notes = ?");
      values.push(body.dlaoNotes);
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, message: "No changes" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    
    const query = `UPDATE cases SET ${updates.join(", ")} WHERE id = ?`;
    values.push(id);
    
    await db.prepare(query).bind(...values).run();

    const caseData = await db.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first();
    
    const mappedCase: any = {
      id: caseData.id,
      docketId: caseData.docket_id,
      citizenUserId: caseData.citizen_user_id,
      voiceSessionId: caseData.voice_session_id,
      problem: caseData.problem,
      summary: caseData.problem, 
      district: caseData.district,
      thana: caseData.thana,
      category: caseData.category,
      status: caseData.status,
      assignedLawyerId: caseData.assigned_lawyer_id,
      dlaoNotes: caseData.dlao_notes,
      createdAt: caseData.created_at,
      updatedAt: caseData.updated_at,
    };

    return NextResponse.json({ ok: true, case: mappedCase });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
