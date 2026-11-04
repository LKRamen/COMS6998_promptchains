import {notFound} from "next/navigation";
import {requireAdmin} from "../../../../lib/auth";
import {rpcError,uuid} from "../../../../lib/api-errors";
import ChainEditor from "../../../components/chain-editor";
export default async function ChainPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id!=="new"&&!uuid(id))notFound();const {client}=await requireAdmin();if(id==="new")return <ChainEditor/>;const {data,error}=await client.rpc("chain_tool_read",{p_id:id});rpcError(error);const chain=data?.rows?.[0];if(!chain)notFound();return <ChainEditor key={id} initialChain={chain}/>;}
