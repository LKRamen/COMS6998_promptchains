import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    return NextResponse.redirect(callback);
  }
  if (pathname !== "/auth/callback") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      return new NextResponse("Admin configuration unavailable", {
        status: 503,
      });
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user && !pathname.startsWith("/auth/") && pathname !== "/login") {
      if (pathname.startsWith("/api/"))
        response = NextResponse.json(
          { error: "Authentication required" },
          { status: 401 },
        );
      else {
        const login = request.nextUrl.clone();
        login.pathname = "/login";
        login.search = "";
        const target = NextResponse.redirect(login);
        response.cookies.getAll().forEach((c) => target.cookies.set(c));
        response = target;
      }
    }
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
