import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata } from "../site";

export const metadata: Metadata = {
  title: "About the Mars Experience",
  description: "Learn what PHOBOSIA is: an independent, fictional Mars outpost explored through a browser-based 3D environment and mission-based activities.",
  alternates: { canonical: canonical("/about") },
  ...publicSocialMetadata("About PHOBOSIA", "The project, its fictional setting, and its approach to interactive Mars exploration.", "/about"),
};

export default function AboutPage() {
  return <PublicShell><main className="public-content"><PageIntro eyebrow="About the project" title="A fictional Mars outpost, explored in 3D" description="PHOBOSIA is an independent browser-based experience built around a mission-based expedition through an imagined Martian outpost." />
    <section className="public-prose"><h2>Explore, observe, and operate</h2><p>PHOBOSIA brings together a first-person 3D environment, interactive outpost modules, and a sequence of mission activities. Visitors can explore the habitat, Mission Control, research lab, engineering unit, central hub, airlock, and outdoor terrain. The expedition asks players to inspect systems, consider observation targets, record findings, and review mission records.</p><p>The setting and story are fictional. Interactive activities are designed as an exploration experience and do not represent a validated scientific research platform or a real Mars mission.</p><h2>Built as an independent project</h2><p>The repository contains the application and its project assets, but does not identify a named authoring organization or provide verified institutional affiliations. PHOBOSIA is not affiliated with, endorsed by, or an official product of NASA.</p><p>Learn more about the <Link href="/missions">mission sequence</Link>, the <Link href="/science-and-data">science and data framing</Link>, and the <Link href="/technology">technology used in the browser experience</Link>.</p><Link className="public-button" href="/play">Explore PHOBOSIA <span aria-hidden="true">↗</span></Link></section>
  </main></PublicShell>;
}
