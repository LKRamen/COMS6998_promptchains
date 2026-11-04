import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),sessionClient:vi.fn(),rpc:vi.fn(),storage:vi.fn(),serviceRpc:vi.fn(),upload:vi.fn(),remove:vi.fn(),normalize:vi.fn(),run:vi.fn(),render:vi.fn()}));
vi.mock("../lib/auth",()=>({adminSession:mocks.session,AccessError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
vi.mock("server-only",()=>({}));
vi.mock("../lib/supabase",()=>({storageClient:mocks.storage,sessionClient:mocks.sessionClient}));
vi.mock("../lib/caption-photo",()=>({normalizePhoto:mocks.normalize}));
vi.mock("../lib/chain-runtime",()=>({runChain:mocks.run}));
vi.mock("../lib/meme-render",()=>({renderMeme:mocks.render}));
import {AccessError} from "../lib/auth";
import {POST as chains} from "../app/api/chains/route";
import {POST as runs} from "../app/api/runs/route";
const id="11111111-1111-4111-8111-111111111111", runId="22222222-2222-4222-8222-222222222222";
const data={name:"Photo captions",description:"",caption_count:2,steps:[{id:"33333333-3333-4333-8333-333333333333",name:"Caption",systemPrompt:"Be funny",userPrompt:"{{context}}",model:"default"}]};
const reserved={id:runId,chain_id:id,chain_version:7,input_path:`actor/${runId}/input.jpg`,snapshot:{...data,caption_count:2},status:"pending"};
function json(body:unknown,origin="https://chains.example"){return new Request("https://chains.example/api/chains",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});}
function photo(origin="https://chains.example",version="7"){const form=new FormData();form.set("chain_id",id);form.set("version",version);form.set("context","Visible context");form.set("photo",new File(["image"],"photo.jpg",{type:"image/jpeg"}));return new Request("https://chains.example/api/runs",{method:"POST",headers:{origin},body:form});}
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.session.mockResolvedValue({client:{rpc:mocks.rpc},user:{id:"actor"}});
 mocks.rpc.mockResolvedValue({data:reserved,error:null});
 mocks.storage.mockReturnValue({rpc:mocks.serviceRpc,storage:{from:()=>({upload:mocks.upload,remove:mocks.remove})}});
 mocks.upload.mockResolvedValue({error:null});mocks.remove.mockResolvedValue({error:null});
 mocks.serviceRpc.mockResolvedValue({data:{...reserved,status:"succeeded"},error:null});
 mocks.normalize.mockResolvedValue(Buffer.from("normalized"));mocks.render.mockResolvedValue(Buffer.from("rendered"));
 mocks.run.mockResolvedValue({captions:["One joke","Another joke"],traces:[]});
});
it.each([401,403])("rejects unauthorized mutations before database or storage access (%s)",async(status)=>{
 mocks.session.mockRejectedValue(new AccessError(status,"Denied"));
 expect((await chains(json({action:"save",data}))).status).toBe(status);
 expect((await runs(photo())).status).toBe(status);
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();expect(mocks.normalize).not.toHaveBeenCalled();
});
it("rejects cross-origin writes before any data mutation or image processing",async()=>{
 expect((await chains(json({action:"save",data},"https://attacker.example"))).status).toBe(403);
 expect((await runs(photo("https://attacker.example"))).status).toBe(403);
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();expect(mocks.normalize).not.toHaveBeenCalled();
});
it("passes the original revision and validated step order to save",async()=>{
 mocks.rpc.mockResolvedValue({data:{...data,id,version:8},error:null});
 const response=await chains(json({action:"save",id,version:7,data}));
 expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("chain_tool_save",{p_id:id,p_version:7,p_data:data});
});
it("rejects malformed ids, missing delete revisions and unsupported actions",async()=>{
 for(const body of [{action:"delete",id:"bad",version:7},{action:"delete",id},{action:"publish",id,version:7}]) expect((await chains(json(body))).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("passes the deletion revision without invoking storage",async()=>{
 expect((await chains(json({action:"delete",id,version:7}))).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("chain_tool_delete",{p_id:id,p_version:7});expect(mocks.storage).not.toHaveBeenCalled();
});
it("rejects invalid run revisions before reserving or uploading",async()=>{
 expect((await runs(photo("https://chains.example","0"))).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();
});
it("generates from the server-frozen snapshot and saves every rendered output",async()=>{
 const response=await runs(photo());expect(response.status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("chain_tool_start_run",{p_chain_id:id,p_version:7,p_context:"Visible context"});
 expect(mocks.run).toHaveBeenCalledWith({steps:reserved.snapshot.steps,image:Buffer.from("normalized"),context:"Visible context",captionCount:2});
 expect(mocks.upload.mock.calls.map(call=>call[0])).toEqual([`actor/${runId}/input.jpg`,`actor/${runId}/output-1.jpg`,`actor/${runId}/output-2.jpg`]);
 expect(mocks.serviceRpc).toHaveBeenCalledWith("chain_tool_finish_run",expect.objectContaining({p_id:runId,p_status:"succeeded",p_result:{captions:["One joke","Another joke"],traces:[],output_paths:[`actor/${runId}/output-1.jpg`,`actor/${runId}/output-2.jpg`]}}));
});
it("records generation failures and removes only uploads from this attempt",async()=>{
 mocks.run.mockRejectedValue(new Error("Provider timed out"));
 const response=await runs(photo());expect(response.status).toBe(400);
 expect(await response.json()).toEqual({error:"Provider timed out"});
 expect(mocks.serviceRpc).toHaveBeenCalledWith("chain_tool_finish_run",expect.objectContaining({p_id:runId,p_status:"failed",p_error:"Provider timed out"}));
 expect(mocks.remove).toHaveBeenCalledWith([`actor/${runId}/input.jpg`]);
});
it("returns the original generation error even if recording failure or cleanup throws",async()=>{
 mocks.run.mockRejectedValue(new Error("Provider timed out"));mocks.serviceRpc.mockRejectedValue(new Error("Database offline"));mocks.remove.mockRejectedValue(new Error("Storage offline"));
 const response=await runs(photo());expect(response.status).toBe(400);expect(await response.json()).toEqual({error:"Provider timed out"});
});

it("retains media when completion may have committed before a network failure",async()=>{
 mocks.serviceRpc.mockRejectedValue(new Error("Connection reset after commit"));
 const response=await runs(photo());expect(response.status).toBe(400);
 expect((await response.json()).error).toContain("media history");
 expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
 expect(mocks.serviceRpc).toHaveBeenCalledWith("chain_tool_finish_run",expect.objectContaining({p_status:"succeeded"}));
 expect(mocks.remove).not.toHaveBeenCalled();
});


it("checks the live user, current Google claims and superadmin access on every request",async()=>{
 const {adminSession}=await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
 const getUser=vi.fn().mockResolvedValue({data:{user:{id:"actor"}},error:null});
 const getClaims=vi.fn().mockResolvedValue({data:{claims:{app_metadata:{provider:"google"},amr:[{method:"oauth"}]}},error:null});
 const rpc=vi.fn().mockResolvedValue({data:true,error:null});
 mocks.sessionClient.mockResolvedValue({auth:{getUser,getClaims},rpc});
 await expect(adminSession()).resolves.toMatchObject({user:{id:"actor"}});
 rpc.mockResolvedValue({data:false,error:null});
 await expect(adminSession()).rejects.toMatchObject({status:403});
 expect(getUser).toHaveBeenCalledTimes(2);expect(getClaims).toHaveBeenCalledTimes(2);
 expect(rpc).toHaveBeenNthCalledWith(2,"admin_access");expect(mocks.storage).not.toHaveBeenCalled();
});
it("refuses absent sessions and non-Google claims before checking admin access",async()=>{
 const {adminSession}=await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
 const getUser=vi.fn().mockResolvedValue({data:{user:null},error:null});
 const getClaims=vi.fn().mockResolvedValue({data:{claims:{app_metadata:{provider:"google"},amr:[{method:"password"}]}},error:null});
 const rpc=vi.fn();mocks.sessionClient.mockResolvedValue({auth:{getUser,getClaims},rpc});
 await expect(adminSession()).rejects.toMatchObject({status:401});expect(getClaims).not.toHaveBeenCalled();
 getUser.mockResolvedValue({data:{user:{id:"actor"}},error:null});
 await expect(adminSession()).rejects.toMatchObject({status:403});
 expect(rpc).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();
});
