import { NextResponse } from "next/server";
import { createLocalCitizenSession } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      phone: string;
      pin: string; // The docket token is used as the PIN for the demo
    };

    if (!body.phone || !body.pin) {
      return NextResponse.json({ ok: false, error: "Phone and PIN/Token are required" }, { status: 400 });
    }

    // In a real app, verify phone and OTP/Token against the D1 cases/users table.
    // For this demo, we trust the input and create a citizen session.
    const session = createLocalCitizenSession("নাগরিক", body.phone, `demo-${body.pin}`);

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
