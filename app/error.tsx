"use client";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main id="main-content" className="page empty-state"><span className="eyebrow">SOMETHING WENT WRONG</span><h1>This page could not load.</h1><p>Your saved chains are still there. Try loading the page again.</p><button className="button primary" onClick={reset}>Try again</button></main>;}
