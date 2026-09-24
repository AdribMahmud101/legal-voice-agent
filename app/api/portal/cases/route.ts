import { NextResponse } from "next/server";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const ctx = getCloudflareContext();
    const db = (ctx.env as any).DB;
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    let cases = [];
    if (user.role === "citizen") {
      const stmt = db.prepare("SELECT * FROM cases WHERE citizen_user_id = ? ORDER BY created_at DESC");
      const { results } = await stmt.bind(user.id).all();
      cases = results;
    } else if (user.role === "panel_lawyer") {
      const stmt = db.prepare("SELECT * FROM cases WHERE assigned_lawyer_id = ? ORDER BY created_at DESC");
      const { results } = await stmt.bind(user.id).all();
      cases = results;
    } else {
      // DLAO sees all
      const stmt = db.prepare("SELECT * FROM cases ORDER BY created_at DESC");
      const { results } = await stmt.all();
      cases = results;
    }

    // map snake_case to camelCase
    const mappedCases = cases.map((c: any) => ({
      id: c.id,
      docketId: c.docket_id,
      citizenUserId: c.citizen_user_id,
      voiceSessionId: c.voice_session_id,
      problem: c.problem,
      summary: c.problem, // alias for UI
      district: c.district,
      thana: c.thana,
      category: c.category,
      status: c.status,
      assignedLawyerId: c.assigned_lawyer_id,
      dlaoNotes: c.dlao_notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return NextResponse.json({ ok: true, cases: mappedCases });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = getLocalSessionUser(token);
    if (!user || user.role !== "citizen") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const ctx = getCloudflareContext();
    const db = (ctx.env as any).DB;
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const id = `CASE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const voiceSessionId = body.voiceSessionId || `voice-${Date.now()}`;
    const docketId = body.docketId || `doc-${Date.now()}`;
    const problem = body.summary || "";
    const district = body.district || "";
    const thana = body.thana || "";
    const category = body.category || "";
    
    await db.prepare(`
      INSERT INTO cases (id, docket_id, citizen_user_id, voice_session_id, problem, district, thana, category, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, docketId, user.id, voiceSessionId, problem, district, thana, category, "submitted"
    ).run();

    const stmt = db.prepare("SELECT * FROM cases WHERE id = ?");
    const newCase = await stmt.bind(id).first();

    return NextResponse.json({ ok: true, case: newCase });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
