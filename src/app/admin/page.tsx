import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminEnabled, AI_MONTHLY_PRICE } from "@/config/platform";
import { listClients } from "@/services/clientService";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const metadata: Metadata = { title: "Client Configuration (Dev)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminEnabled()) notFound();
  return <AdminConsole clients={await listClients()} aiMonthlyPrice={AI_MONTHLY_PRICE} />;
}
