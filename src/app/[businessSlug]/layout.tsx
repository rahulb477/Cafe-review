import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getClientBySlug, listClientSlugs } from "@/services/clientService";
import { ClientProvider } from "@/components/ClientProvider";
import { AppShell } from "@/components/AppShell";
import { QrCapture } from "@/components/QrCapture";

type Params = Promise<{ businessSlug: string }>;

// Tenants come from Firestore: known ones are prerendered, new ones render on
// demand, and everything is re-validated every 60s (live listeners update instantly).
export const dynamicParams = true;
export const revalidate = 60;

export async function generateStaticParams() {
  return (await listClientSlugs()).map((businessSlug) => ({ businessSlug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { businessSlug } = await params;
  const client = await getClientBySlug(businessSlug);
  if (!client) return { title: "Business Not Found", robots: { index: false } };
  const icon = client.favicon ?? client.logo;
  return {
    title: { default: `${client.businessName} — Customer Experience`, template: `%s · ${client.businessName}` },
    description: client.description,
    applicationName: client.businessName,
    icons: icon ? { icon, apple: icon } : undefined,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: client.displayName },
    openGraph: {
      title: client.businessName,
      description: client.description,
      images: client.coverImage ? [client.coverImage] : undefined,
    },
  };
}

export async function generateViewport({ params }: { params: Params }): Promise<Viewport> {
  const { businessSlug } = await params;
  const client = await getClientBySlug(businessSlug);
  return { themeColor: client?.theme.primaryDark ?? "#222222" };
}

export default async function ClientLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { businessSlug } = await params;
  const client = await getClientBySlug(businessSlug);
  if (!client) notFound();

  return (
    <ClientProvider key={client.slug} client={client}>
      <QrCapture />
      <AppShell>{children}</AppShell>
    </ClientProvider>
  );
}
