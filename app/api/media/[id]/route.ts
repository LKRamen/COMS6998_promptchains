import { NextResponse } from "next/server";
import { adminSession } from "../../../../lib/auth";
import { storageClient } from "../../../../lib/supabase";
import type { ChainRun } from "../../../../lib/chains";
import { apiError,rpcError,uuid } from "../../../../lib/api-errors";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 try {
  const {client}=await adminSession(),{id}=await params;
  if(!uuid(id)) return new NextResponse("Not found",{status:404});
  const result=await client.rpc("chain_tool_runs_read",{p_id:id,p_chain_id:null}); rpcError(result.error);
  const run=result.data?.rows?.[0] as ChainRun|undefined;
  if(!run||run.status!=="succeeded") return new NextResponse("Not found",{status:404});
  const query=new URL(request.url).searchParams,index=Number(query.get("index")??0);
  if(!Number.isInteger(index)||index<0||index>=run.output_paths.length) return new NextResponse("Not found",{status:404});
  const path=query.get("variant")==="input"?run.input_path:run.output_paths[index];
  const {data,error}=await storageClient().storage.from("chain-tool-media").download(path);
  if(error||!data) return new NextResponse("Media unavailable",{status:404});
  return new NextResponse(await data.arrayBuffer(),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){return apiError(error);}
}
