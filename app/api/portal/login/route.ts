import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { MOCK_ROLE_IDENTITIES, type StaffRole, isStaffRole } from "@/lib/auth/roles";
import { createD1Session, type D1Database } from "@/lib/auth/d1-session";
import { createLocalStaffSession } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StaffRow {
  id: string;
  role: StaffRole;
  display_name: string;
  status: string;
  verification_status: string;
  is_mock: number | boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      role: StaffRole;
      password?: string;
    };

    if (!body.role || !isStaffRole(body.role)) {
      return NextResponse.json({ ok: false, error: "Invalid or missing staff role" }, { status: 400 });
    }

    const mockIdentity = MOCK_ROLE_IDENTITIES[body.role];
    if (!mockIdentity) {
      return NextResponse.json({ ok: false, error: "Mock identity not found for role" }, { status: 404 });
    }

    let db: D1Database | null = null;
    try {
      db = (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
    } catch {
      db = null;
    }

    if (db && body.role !== "panel_lawyer") {
      let user = await db
        .prepare(
          `SELECT id, role, display_name, status, verification_status, is_mock
           FROM users WHERE role = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
        )
        .bind(body.role)
        .first<StaffRow>();
      if (!user) {
        const userId = `STAFF-${body.role}-${crypto.randomUUID()}`;
        await db
          .prepare(
            `INSERT INTO users
              (id, role, display_name, status, verification_status, is_mock)
             VALUES (?, ?, ?, 'active', 'verified', 1)`,
          )
          .bind(userId, body.role, mockIdentity.displayName)
          .run();
        user = await db
          .prepare("SELECT id, role, display_name, status, verification_status, is_mock FROM users WHERE id = ?")
          .bind(userId)
          .first<StaffRow>();
      }
      if (!user) return NextResponse.json({ ok: false, error: "Staff account could not be created" }, { status: 500 });
      const session = await createD1Session(db, user.id);
      const response = NextResponse.json({
        ok: true,
        user: {
          id: user.id,
          displayName: user.display_name,
          role: user.role,
          status: user.status,
          verificationStatus: user.verification_status,
          isMock: Boolean(user.is_mock),
        },
      });
      response.cookies.set("auth_session", session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: session.expiresAt,
      });
      return response;
    }

    const sessionUser = {
      id: `MOCK-${body.role}-${Date.now()}`,
      ...mockIdentity,
    };
    const session = createLocalStaffSession(sessionUser);
    const response = NextResponse.json({ ok: true, user: session.user });
    response.cookies.set("auth_session", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
