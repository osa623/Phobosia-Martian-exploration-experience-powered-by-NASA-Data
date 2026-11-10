import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata, siteUrl } from "./site";

export const metadata: Metadata = {
  title: { absolute: "PHOBOSIA | Explore Mars in an Interactive 3D Experience" },
  description: "Explore PHOBOSIA, a browser-based 3D Mars experience with a fictional outpost, mission-based exploration, and scientific observation activities.",
  alternates: { canonical: canonical("/") },
  ...publicSocialMetadata("PHOBOSIA | Explore Mars in 3D", "Discover a fictional Mars outpost through an interactive, mission-based 3D experience.", "/"),
};

const appSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PHOBOSIA",
  description: "A browser-based interactive 3D Mars exploration experience set at a fictional outpost, with mission-based exploration and scientific observation activities.",
  applicationCategory: "GameApplication",
  browserRequirements: "A modern browser with WebGL support",
  ...(siteUrl ? { url: siteUrl.toString() } : {}),
};

export default function Home() {
  return <PublicShell>
    {siteUrl && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "PHOBOSIA", url: siteUrl.toString() }) }} />}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
    <main>
      <section className="public-hero"><div className="public-hero-copy"><p className="public-eyebrow">A browser-based Mars exploration experience</p><h1>Explore Mars through an interactive 3D experience</h1><p className="public-lede">Step into PHOBOSIA, a fictional Martian outpost. Explore its modules and terrain, follow an eleven-sol expedition, and take part in observation and operations activities in a detailed 3D environment.</p><div className="public-actions"><Link className="public-button" href="/play">Explore PHOBOSIA <span aria-hidden="true">↗</span></Link><Link className="public-text-link" href="/experience">How the experience works <span aria-hidden="true">→</span></Link></div><p className="public-note">Independent project · Fictional outpost · Not affiliated with NASA</p></div><div className="public-hero-art" role="img" aria-label="PHOBOSIA logo on a dark background"><div className="public-orbit public-orbit-one"/><div className="public-orbit public-orbit-two"/><div className="public-planet"/><img src="/phobosia-logo.webp" alt="PHOBOSIA" width="1600" height="533" fetchPriority="high" /></div></section>
      <section className="public-section public-overview"><div><p className="public-eyebrow">What is PHOBOSIA?</p><h2>A mission-based journey through a fictional Mars outpost</h2></div><div><p>PHOBOSIA is an interactive 3D experience that presents an imagined Mars outpost through exploration, operations, and scientific observation activities. Move between the habitat, Mission Control, research lab, engineering unit, central hub, airlock, and outdoor terrain.</p><p>Across SOL 1–11, the expedition develops from outpost orientation and readiness into target selection, drone reconnaissance, surface investigation, storm assessment, system recovery, record review, and a final departure.</p><Link className="public-text-link" href="/missions">See the mission overview <span aria-hidden="true">→</span></Link></div></section>
      <section className="public-section public-cards-section"><div className="public-section-heading"><p className="public-eyebrow">Explore the project</p><h2>Learn about the experience before you launch</h2></div><div className="public-card-grid">
        <article className="public-card"><span className="public-card-index">01 / EXPERIENCE</span><h3>Explore in first person</h3><p>Navigate the outpost and outdoor environment, inspect interactive locations, and use the rover and drone activities in the missions where they appear.</p><Link href="/experience">Read how to play <span aria-hidden="true">→</span></Link></article>
        <article className="public-card"><span className="public-card-index">02 / OBSERVATION</span><h3>Follow the expedition</h3><p>Review a high-level guide to the eleven-sol campaign, from orientation and scientific target selection to field records and expedition handover.</p><Link href="/missions">View mission overview <span aria-hidden="true">→</span></Link></article>
        <article className="public-card"><span className="public-card-index">03 / TRANSPARENCY</span><h3>Understand the science framing</h3><p>Learn what is simulated, what is fictional, and what the project materials do and do not establish about external data sources.</p><Link href="/science-and-data">Read science and data notes <span aria-hidden="true">→</span></Link></article>
      </div></section>
      <section className="public-section public-faq"><div><p className="public-eyebrow">Common questions</p><h2>Before you explore</h2></div><div className="public-faq-list">
        <details><summary>What is PHOBOSIA?</summary><p>An interactive browser-based 3D experience about exploring and operating a fictional Mars outpost through a mission-based expedition.</p></details>
        <details><summary>Can I explore PHOBOSIA in a browser?</summary><p>Yes. The experience runs in a browser and uses WebGL for its 3D environment. A modern browser with WebGL support is needed to launch it.</p></details>
        <details><summary>Is PHOBOSIA an official NASA project or does it use NASA telemetry?</summary><p>No NASA affiliation or endorsement is claimed. Project mission materials identify many outpost readings as simulated; the available repository does not document a verified NASA telemetry integration. <Link href="/science-and-data">Read the science and data notes.</Link></p></details>
        <details><summary>Do I need to download anything?</summary><p>The experience is accessed through the browser. The interactive 3D assets load after you choose to launch PHOBOSIA.</p></details>
      </div></section>
      <section className="public-bottom-cta"><p className="public-eyebrow">Your expedition begins here</p><h2>Step into PHOBOSIA</h2><p>Explore the outpost and follow its mission-based Mars expedition.</p><Link className="public-button" href="/play">Launch the experience <span aria-hidden="true">↗</span></Link></section>
    </main>
  </PublicShell>;
}
