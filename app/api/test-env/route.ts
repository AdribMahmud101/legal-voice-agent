import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

export async function GET() {
  try {
    const ctx = getCloudflareContext();
    return NextResponse.json({ ok: true, env: Object.keys(ctx.env) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
