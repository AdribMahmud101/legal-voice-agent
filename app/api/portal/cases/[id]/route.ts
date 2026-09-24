import { NextResponse } from "next/server";
import { caseStore } from "@/lib/data/case-store";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sessionCookie = req.headers.get("cookie")?.split("; ").find(row => row.startsWith("auth_session="));
    const token = sessionCookie?.split("=")[1];
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const c = caseStore.getById(id);
    if (!c) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Access control
    if (user.role === "citizen" && c.citizenPhone !== user.id) {
       // Mock setup has citizen ID as phone or CIT-.. fallback to check both for demo
       if (!c.citizenPhone.includes(user.displayName) && c.citizenPhone !== user.id) {
         return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
       }
    }
    if (user.role === "panel_lawyer" && c.assignedLawyerId !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, case: c });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
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

    // Only dlao and panel_lawyer can update cases (or citizen submitting docs, but simplified here)
    if (user.role === "citizen") {
       return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const updated = caseStore.update(id, body);
    
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, case: updated });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
