import { requireAdmin } from "../../lib/auth";
import AppHeader from "../components/app-header";
export const dynamic="force-dynamic";
export default async function StudioLayout({children}:{children:React.ReactNode}) {
 const {user}=await requireAdmin(); return <><AppHeader email={user.email}/><main id="main-content" className="page">{children}</main></>;
}
