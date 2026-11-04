import { NextResponse } from "next/server";
import { AccessError } from "./auth";
export function apiError(error: unknown) {
  const status = error instanceof AccessError ? error.status : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed." }, { status });
}
export function rpcError(error: {code?:string;message?:string}|null) {
 if (!error) return;
 const messages:Record<string,string>={"40001":"This chain changed in another tab. Reload before saving or generating.","42501":"Your superadmin session is no longer valid. Sign in again.","P0002":"This chain or run no longer exists.","55000":"A generation is already running. Wait before trying again.","54000":"Generation limit reached. Try again later."};
 throw new Error(messages[error.code??""] ?? "The operation could not be completed. Check your inputs and try again.");
}
export function uuid(value:unknown):value is string { return typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value); }
