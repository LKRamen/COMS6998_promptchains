import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:{default:"Quip Chains",template:"%s | Quip Chains"},description:"Build prompt chains, generate captions, and compare the results."};
const themeScript=`try{var t=localStorage.getItem("quip-chains-theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:"system"}catch(e){document.documentElement.dataset.theme="system"}`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;}
