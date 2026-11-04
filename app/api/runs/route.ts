import { NextResponse } from "next/server";
import { adminSession, AccessError } from "../../../lib/auth";
import { storageClient } from "../../../lib/supabase";
import { isSameOriginRequest } from "../../../lib/request-origin";
import { normalizePhoto } from "../../../lib/caption-photo";
import { renderMeme } from "../../../lib/meme-render";
import { runChain } from "../../../lib/chain-runtime";
import type { ChainRun } from "../../../lib/chains";
import { apiError,rpcError,uuid } from "../../../lib/api-errors";
export const maxDuration=300;
export const runtime="nodejs";
export async function POST(request:Request) {
 let run:ChainRun|undefined;
 let finishing=false;
 const uploaded:string[]=[];
 try {
  const {client}=await adminSession();
  if(!isSameOriginRequest(request)) throw new AccessError(403,"Invalid request origin.");
  if(Number(request.headers.get("content-length"))>6*1024*1024) throw new Error("Choose an image under 5 MiB.");
  const form=await request.formData();
  const id=form.get("chain_id"),version=Number(form.get("version")),context=String(form.get("context")??"").trim();
  const photo=form.get("photo");
  if(!uuid(id)||!Number.isInteger(version)||version<1||context.length>1000) throw new Error("Check the chain revision and context.");
  if(!(photo instanceof File)) throw new Error("Choose an image to generate captions.");
  const image=await normalizePhoto(photo);
  const reservation=await client.rpc("chain_tool_start_run",{p_chain_id:id,p_version:version,p_context:context}); rpcError(reservation.error);
  run=reservation.data as ChainRun;
  const service=storageClient(),bucket=service.storage.from("chain-tool-media");
  const input=await bucket.upload(run.input_path,image,{contentType:"image/jpeg",upsert:false});
  if(input.error) throw new Error("The input image could not be saved. Try again.");
  uploaded.push(run.input_path);
  const result=await runChain({steps:run.snapshot.steps,image,context,captionCount:run.snapshot.caption_count});
  const output_paths:string[]=[];
  for(let i=0;i<result.captions.length;i++) {
   const path=run.input_path.replace(/input\.jpg$/,`output-${i+1}.jpg`);
   const rendered=await renderMeme(image,result.captions[i]);
   const saved=await bucket.upload(path,rendered,{contentType:"image/jpeg",upsert:false});
   if(saved.error) throw new Error("Generated media could not be saved. Try again.");
   uploaded.push(path); output_paths.push(path);
  }
  finishing=true;
  const finished=await service.rpc("chain_tool_finish_run",{p_id:run.id,p_status:"succeeded",p_result:{...result,output_paths},p_error:null}); rpcError(finished.error);
  return NextResponse.json({run:finished.data});
 }catch(error){
  if(run && !finishing) {
   try {
    const service=storageClient();
    await service.rpc("chain_tool_finish_run",{p_id:run.id,p_status:"failed",p_result:null,p_error:error instanceof Error?error.message:"Generation failed."});
   } catch { /* Preserve the original failure; pending reservations expire. */ }
   if(uploaded.length) {
    try { await storageClient().storage.from("chain-tool-media").remove(uploaded); }
    catch { /* Private orphaned objects may be reconciled later; never hide the original failure. */ }
   }
  }
  if(finishing) return apiError(new Error("The result could not be confirmed. Check this chain’s media history before running it again."));
  return apiError(error);
 }
}
