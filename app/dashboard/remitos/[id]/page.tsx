import type { Metadata } from "next";

import { ErpRemitoDetailView } from "@/components/erp/remitos/erp-remito-detail-view";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${decodeURIComponent(id)} · Remito · 8CHOQ ERP`,
  };
}

export default function DashboardRemitoDetailPage() {
  return <ErpRemitoDetailView />;
}
