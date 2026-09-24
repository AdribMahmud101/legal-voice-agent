import { NextResponse } from "next/server";
import { createLocalCitizenSession } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      displayName?: string;
      phone?: string | null;
      voiceSessionId?: string;
      docketId?: string;
    };
    if (!body.displayName?.trim() || !body.voiceSessionId || !body.docketId) {
      return NextResponse.json({ ok: false, error: "displayName, voiceSessionId, and docketId are required" }, { status: 400 });
    }

    const session = createLocalCitizenSession(body.displayName, body.phone ?? null, body.voiceSessionId);
    const response = NextResponse.json({ ok: true, user: session.user, docketId: body.docketId });
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
