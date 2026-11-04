import Link from "next/link";
export default function NotFound(){return <main id="main-content" className="page empty-state"><span className="eyebrow">PAGE NOT FOUND</span><h1>This chain is missing.</h1><p>It may have been deleted, or this link is incomplete.</p><Link className="button primary" href="/">Back to chains</Link></main>;}
