import { NextResponse } from "next/server";
import { adminSession, AccessError } from "../../../lib/auth";
import { isSameOriginRequest } from "../../../lib/request-origin";
import { parseChainInput } from "../../../lib/chains";
import { apiError,rpcError,uuid } from "../../../lib/api-errors";
export async function POST(request:Request) {
 try {
  const {client}=await adminSession();
  if(!isSameOriginRequest(request)) throw new AccessError(403,"Invalid request origin.");
  const raw=await request.text(); if(raw.length>150000) throw new Error("Chain is too large.");
  const body=JSON.parse(raw);
  if(!body || typeof body!=="object" || !["save","delete"].includes(body.action)) throw new Error("Invalid operation.");
  if(body.id && (!uuid(body.id)||!Number.isInteger(body.version)||body.version<1)) throw new Error("Reload this chain before editing.");
  if(body.action==="delete") {
   if(!uuid(body.id)) throw new Error("Choose a chain to delete.");
   const {error}=await client.rpc("chain_tool_delete",{p_id:body.id,p_version:body.version}); rpcError(error);
   return NextResponse.json({ok:true});
  }
  const data=parseChainInput(body.data);
  const result=await client.rpc("chain_tool_save",{p_id:body.id??null,p_version:body.version??null,p_data:data}); rpcError(result.error);
  return NextResponse.json({chain:result.data});
 }catch(error){return apiError(error);}
}
