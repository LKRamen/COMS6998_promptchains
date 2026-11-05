import {notFound} from "next/navigation";
import {requireAdmin} from "../../../../lib/auth";
import {rpcError,uuid} from "../../../../lib/api-errors";
import ChainEditor from "../../../components/chain-editor";
export default async function ChainPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id!=="new"&&!uuid(id))notFound();const {client,user}=await requireAdmin();if(id==="new"){const {data,error}=await client.rpc("chain_tool_read",{p_id:null});rpcError(error);return <ChainEditor userId={user.id} firstChain={!(data?.rows??[]).some((item:{created_by:string})=>item.created_by===user.id)}/>;}const {data,error}=await client.rpc("chain_tool_read",{p_id:id});rpcError(error);const chain=data?.rows?.[0];if(!chain)notFound();return <ChainEditor key={id} initialChain={chain} userId={user.id} firstChain={false}/>;}
