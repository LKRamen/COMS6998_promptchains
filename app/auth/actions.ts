"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { sessionClient } from "../../lib/supabase";
export async function login() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) redirect("/login?error=config");
  // Start PKCE on the registered host so the verifier cookie and callback share an origin.
  const requestOrigin = (await headers()).get("origin");
  if (requestOrigin && requestOrigin !== origin) redirect(`${origin}/login`);
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
