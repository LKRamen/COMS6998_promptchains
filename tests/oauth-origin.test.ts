import { expect, it } from "vitest";
import { resolveOAuthOrigin } from "../lib/oauth-origin";
const stable = "https://coms6998-promptchains.vercel.app";
const deployment = "coms6998-promptchains-example-lkr2124-2742s-projects.vercel.app";
it("keeps stable and exact current deployment logins on their own hosts", () => {
  expect(resolveOAuthOrigin(stable, stable, deployment)).toBe(stable);
  expect(resolveOAuthOrigin(`https://${deployment}`, stable, deployment)).toBe(`https://${deployment}`);
});
it.each([null, "null", "https://evil.example", `https://${deployment}.evil.example`, `https://${deployment}/path`, `http://${deployment}`, `https://user@${deployment}`, "https://another-deployment.vercel.app"])("rejects untrusted or malformed origin %s", origin => {
  expect(resolveOAuthOrigin(origin, stable, deployment)).toBeNull();
});
it("does not invent a deployment host when the environment is missing", () => {
  expect(resolveOAuthOrigin(`https://${deployment}`, stable, undefined)).toBeNull();
});
