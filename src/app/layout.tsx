import type { Metadata } from "next";
import "./globals.css";
import "../components/menu/MainMenu.css";
export const metadata: Metadata = { title: "PHOBOSIA", description: "Mars observation prototype" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /></head><body className="m-0 select-none overflow-hidden bg-[#05090d] font-sans [color-scheme:dark]">{children}</body></html>; }
