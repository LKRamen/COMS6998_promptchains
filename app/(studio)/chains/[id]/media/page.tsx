import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdmin} from "../../../../../lib/auth";
import {rpcError,uuid} from "../../../../../lib/api-errors";
import RunGallery from "../../../../components/run-gallery";
export default async function MediaPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!uuid(id))notFound();const {client}=await requireAdmin();const {data,error}=await client.rpc("chain_tool_runs_read",{p_chain_id:id,p_id:null});rpcError(error);return <><div className="page-heading"><Link href={`/chains/${id}`} className="text-link">← Back to chain</Link><h1>Generated media</h1><p>Saved results and exact prompts from this chain’s runs.</p></div><RunGallery runs={data?.rows??[]}/></>;}
