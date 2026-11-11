import type { Metadata } from "next";
import { siteUrl } from "./site";
import "./globals.css";
import "./public.css";
import "../components/menu/MainMenu.css";
export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  title: { default: "PHOBOSIA | Interactive Mars Exploration", template: "%s | PHOBOSIA" },
  description: "Explore PHOBOSIA, a browser-based 3D Mars experience set at a fictional outpost, with mission-based exploration and scientific observation activities.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "PHOBOSIA",
    ...(siteUrl ? { images: [{ url: "/phobosia-social.png", width: 1200, height: 630, alt: "PHOBOSIA — an interactive 3D Mars exploration experience" }] } : {}),
  },
  twitter: { card: siteUrl ? "summary_large_image" : "summary", ...(siteUrl ? { images: ["/phobosia-social.png"] } : {}) },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  other: {
    "msapplication-TileColor": "#05090d",
    "msapplication-TileImage": "/mstile-150x150.png",
    "msapplication-config": "/browserconfig.xml",
  },
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className="m-0 min-h-screen bg-[#05090d] font-sans [color-scheme:dark]">{children}</body></html>; }
