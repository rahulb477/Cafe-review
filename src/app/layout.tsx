import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Intentionally brand-neutral: each client's layout supplies its own metadata.
export const metadata: Metadata = {
  title: "Customer Experience",
  description: "Scan, review, browse the menu and earn rewards.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the on-screen keyboard resizes the layout viewport (and dvh), so
  // fixed/sticky footers stay above the keyboard instead of behind it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
