import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdmin} from "../../../../lib/auth";
import {rpcError,uuid} from "../../../../lib/api-errors";
import RunGallery from "../../../components/run-gallery";
export default async function RunPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuid(id))notFound();const {client}=await requireAdmin();const {data,error}=await client.rpc("chain_tool_runs_read",{p_id:id,p_chain_id:null});rpcError(error);const run=data?.rows?.[0];if(!run)notFound();return <><div className="page-heading"><Link href={`/chains/${run.chain_id}/media`} className="text-link">← Chain history</Link><h1>Generation results</h1><p>Revision {run.chain_version} · {run.snapshot.name}</p></div><RunGallery runs={[run]}/></>;}
