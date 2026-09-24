import { NextResponse } from "next/server";
import { MOCK_ROLE_IDENTITIES, type StaffRole, isStaffRole } from "@/lib/auth/roles";
import { createLocalStaffSession } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      role: StaffRole;
      password?: string;
    };

    if (!body.role || !isStaffRole(body.role)) {
      return NextResponse.json({ ok: false, error: "Invalid or missing staff role" }, { status: 400 });
    }

    // In a real app, we'd verify the password here against a DB.
    // For this hackathon demo, we just use the mock identities.
    const mockIdentity = MOCK_ROLE_IDENTITIES[body.role];
    if (!mockIdentity) {
      return NextResponse.json({ ok: false, error: "Mock identity not found for role" }, { status: 404 });
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
