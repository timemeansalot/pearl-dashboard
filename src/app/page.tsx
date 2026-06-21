import { DashboardClient } from "./dashboard-client";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialStatus = await getStore().getDashboardStatus();
  return <DashboardClient initialStatus={initialStatus} />;
}
