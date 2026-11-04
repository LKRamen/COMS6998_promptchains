/** Next can construct an internal localhost URL while serving an external Host. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const internal = new URL(request.url);
    const host = request.headers.get("host") || internal.host;
    const external = new URL(`${internal.protocol}//${host}`);
    return new URL(origin).origin === external.origin;
  } catch {
    return false;
  }
}
