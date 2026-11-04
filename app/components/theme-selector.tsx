"use client";
import { useSyncExternalStore } from "react";
type Theme = "system" | "light" | "dark";
function current(): Theme { try { const value=localStorage.getItem("quip-chains-theme"); return value==="dark"||value==="light"?value:"system"; } catch { return "system"; } }
function subscribe(callback:()=>void) { window.addEventListener("storage",callback);window.addEventListener("theme-change",callback);return ()=>{window.removeEventListener("storage",callback);window.removeEventListener("theme-change",callback);}; }
export default function ThemeSelector(){
 const theme=useSyncExternalStore(subscribe,current,()=>"system" as Theme);
 return <label className="theme-control"><span className="sr-only">Appearance</span><select aria-label="Appearance" value={theme} onChange={event=>{const value=event.target.value;try{localStorage.setItem("quip-chains-theme",value);}catch{}document.documentElement.dataset.theme=value;window.dispatchEvent(new Event("theme-change"));}}><option value="system">System theme</option><option value="light">Light theme</option><option value="dark">Dark theme</option></select></label>;
}
