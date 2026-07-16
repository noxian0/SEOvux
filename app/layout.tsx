import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "SEOvux - Boost Your Rankings, Grow Your Business.", description: "Evidence-first live SEO auditing" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
