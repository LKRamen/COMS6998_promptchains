import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "./supabase";
import { googleSession } from "./security";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function adminSession() {
  const client = await sessionClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new AccessError(401, "Sign in with Google to continue.");
  const claims = await client.auth.getClaims();
  if (claims.error || !googleSession(claims.data?.claims))
    throw new AccessError(
      403,
      "A Google login is required. Sign out and continue with Google.",
    );
  const access = await client.rpc("admin_access");
  if (access.error || access.data !== true)
    throw new AccessError(
      403,
      "This Google account does not have superadmin access.",
    );
  return { client, user };
}
export async function requireAdmin() {
  try {
    return await adminSession();
  } catch (e) {
    if (e instanceof AccessError)
      redirect(e.status === 401 ? "/login" : "/login?error=access");
    throw e;
  }
}
