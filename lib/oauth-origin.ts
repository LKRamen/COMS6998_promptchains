/** Keep the PKCE cookie and callback on an explicitly trusted app origin. */
export function resolveOAuthOrigin(requestOrigin: string | null, stableOrigin: string | undefined, deploymentHost: string | undefined): string | null {
  if (!requestOrigin) return null;
  try {
    const parsed = new URL(requestOrigin);
    if (parsed.origin !== requestOrigin) return null;
    const deploymentOrigin = deploymentHost ? `https://${deploymentHost}` : null;
    return requestOrigin === stableOrigin || requestOrigin === deploymentOrigin ? requestOrigin : null;
  } catch { return null; }
}
