import Link from "next/link";
import { logout } from "../auth/actions";
import ThemeSelector from "./theme-selector";
export default function AppHeader({email}:{email?:string}){return <header className="app-header"><Link href="/" className="brand" aria-label="Quip Chains home"><span className="brand-mark">q.</span><span>quip <b>chains</b></span></Link><div className="header-actions"><ThemeSelector/>{email&&<><span className="account-email" title={email}>{email}</span><form action={logout}><button className="text-button">Sign out</button></form></>}</div></header>;}
