"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { resolveOAuthOrigin } from "../../lib/oauth-origin";
import { sessionClient } from "../../lib/supabase";
export async function login() {
  const stableOrigin = process.env.APP_ORIGIN;
  if (!stableOrigin) redirect("/login?error=config");
  const origin = resolveOAuthOrigin((await headers()).get("origin"), stableOrigin, process.env.VERCEL_URL);
  if (!origin) redirect(`${stableOrigin}/login`);
  const client = await sessionClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}
export async function logout() {
  const client = await sessionClient();
  await client.auth.signOut();
  redirect("/login");
}
