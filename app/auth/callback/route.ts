import { NextResponse, type NextRequest } from "next/server";
import { sessionClient } from "../../../lib/supabase";
import { adminSession } from "../../../lib/auth";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"),
    flowId = request.nextUrl.searchParams.get("sb_flow_id");
  if (code) {
    const client = await sessionClient();
    const { error } = await client.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) {
      try {
        await adminSession();
        return NextResponse.redirect(new URL("/", request.url));
      } catch {
        return NextResponse.redirect(
          new URL("/login?error=access", request.url),
        );
      }
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
