export function googleSession(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const c = claims as {
    app_metadata?: { provider?: unknown };
    amr?: unknown[];
  };
  return (
    c.app_metadata?.provider === "google" &&
    Array.isArray(c.amr) &&
    c.amr.some(
      (item) =>
        item &&
        typeof item === "object" &&
        "method" in item &&
        item.method === "oauth",
    )
  );
}
export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /^\/(auth|login)(\/|\?|$)/.test(value)
  )
    return "/";
  return value;
}
