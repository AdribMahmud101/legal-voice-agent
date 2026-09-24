import { NextResponse } from "next/server";
import { caseStore } from "@/lib/data/case-store";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = getLocalSessionUser(token);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let cases = [];
    if (user.role === "citizen") {
      cases = caseStore.getByCitizen(user.id); // For mock, citizen ID could be used, or phone
    } else if (user.role === "panel_lawyer") {
      cases = caseStore.getByLawyer(user.id);
    } else {
      // DLAO sees all
      cases = caseStore.getAll();
    }

    return NextResponse.json({ ok: true, cases });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
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
    const newCase = caseStore.create({
      docketId: body.docketId,
      citizenPhone: body.citizenPhone || user.id,
      citizenName: user.displayName,
      summary: body.summary,
    });

    return NextResponse.json({ ok: true, case: newCase });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
