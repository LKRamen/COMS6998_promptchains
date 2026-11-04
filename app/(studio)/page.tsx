import {requireAdmin} from "../../lib/auth";
import ChainList from "../components/chain-list";
import {rpcError} from "../../lib/api-errors";
export default async function Home(){const {client}=await requireAdmin();const {data,error}=await client.rpc("chain_tool_read",{p_id:null});rpcError(error);return <ChainList chains={data?.rows??[]}/>;}
