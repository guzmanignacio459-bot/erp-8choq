import { DashboardOverview } from "@/components/erp/layout/dashboard-overview";
import { getDashboardOverview } from "@/services/erp-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data } = await getDashboardOverview();

  return <DashboardOverview data={data} />;
}
