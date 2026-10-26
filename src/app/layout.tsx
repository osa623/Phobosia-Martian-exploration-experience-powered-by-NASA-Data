import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PHOBOSIA", description: "Mars observation prototype" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
