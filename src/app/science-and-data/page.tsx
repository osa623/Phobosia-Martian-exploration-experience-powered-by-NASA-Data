import type { Metadata } from "next";
import { PageIntro, PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata } from "../site";

export const metadata: Metadata = {
  title: "Science and Data Sources",
  description: "Understand the scientific observation themes, fictional events, simulated outpost readings, and documented data sources in PHOBOSIA.",
  alternates: { canonical: canonical("/science-and-data") },
  ...publicSocialMetadata("Science and Data Notes", "A transparent guide to PHOBOSIA's fictional setting, simulated values, and source documentation.", "/science-and-data"),
};

export default function ScienceAndDataPage() {
  return <PublicShell><main className="public-content"><PageIntro eyebrow="Science and transparency" title="Mars observation themes, clearly framed" description="PHOBOSIA uses mission activities to introduce ideas such as target selection, field observation, sample records, system assessment, and scientific handover. It is an interactive experience, not a scientific instrument." />
    <section className="public-prose"><h2>What the project materials establish</h2><p>Mission and screen configuration files describe observation sites, terrain activities, project records, and operational workflows. Some mission interfaces explicitly label outpost readings as simulated and state that they are not live NASA telemetry. The SOL 7 materials also require values to be distinguished as source-backed, existing telemetry, unavailable, or gameplay simulation.</p><h2>External datasets and terrain provenance</h2><p>The repository materials reviewed for this site do not identify a verified NASA dataset integration, a live telemetry service, or a clear source attribution for the terrain and target imagery. For that reason, PHOBOSIA does not claim that its imagery or terrain comes from NASA or another named scientific provider. Its target, terrain, and observation content is presented as project-provided experience material unless an individual screen explicitly identifies another source.</p><p>NASA is referenced in some project UI and internal configuration language, including “NASA-inspired” workflow concepts. That wording describes a design reference and does not establish NASA affiliation, endorsement, or use of NASA measurements.</p><h2>Fictional and simulated elements</h2><ul><li>The PHOBOSIA outpost, expedition storyline, and operational events are fictional.</li><li>Mission-control, habitat, power, environmental, and other operational readings may be gameplay simulation; they are not real-time Martian measurements.</li><li>Observation and sample records are created within the experience and should not be treated as validated scientific findings or research data.</li></ul><h2>Educational use</h2><p>The experience can help visitors engage with broad concepts in planetary exploration and mission operations, including observing a site, recording evidence, considering uncertainty, coordinating systems, and preparing a handover. It is not presented as an accredited educational product or validated research platform.</p></section>
  </main></PublicShell>;
}
