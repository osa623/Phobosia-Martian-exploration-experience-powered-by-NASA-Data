import type { Metadata } from "next";
import { PageIntro, PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata } from "../site";

export const metadata: Metadata = {
  title: "Mission Overview | SOL 1–11",
  description: "Explore the PHOBOSIA expedition at a high level, from outpost orientation and Mars observation activities through the SOL 11 departure.",
  alternates: { canonical: canonical("/missions") },
  ...publicSocialMetadata("PHOBOSIA Mission Overview", "A high-level guide to the eleven-Sol fictional Mars outpost expedition.", "/missions"),
};

const missions = [
  ["SOL 1", "Outpost Orientation", "Explore the outpost, inspect its zones and systems, and complete the orientation checklist."],
  ["SOL 2", "Outpost Readiness", "Review Habitat and Engineering systems, investigate operational logs, and submit an evidence-supported readiness assessment."],
  ["SOL 3", "Scientific Target Selection", "Review observation sites and operational constraints, evaluate available project datasets, and submit a target proposal."],
  ["SOL 4", "Selected Target Investigation and Drone Mission Preparation", "Review records and terrain information for the selected target, inspect the drone, and prepare for aerial reconnaissance."],
  ["SOL 5", "Aerial Reconnaissance", "Use the drone activity to inspect the approach to the selected target and prepare observations for the ground investigation."],
  ["SOL 6", "Mars Surface Field Investigation", "Travel to the selected target, record field observations, register a simulated sample, and review it in the Science Lab."],
  ["SOL 7", "Mars Outpost Dust Storm Emergency Assessment", "Assess outpost status and simulated operational systems during a fictional dust-storm event."],
  ["SOL 8", "Mars Outpost Power and Communication Recovery", "Complete interactive repair simulations for the outpost power and external communications systems."],
  ["SOL 9", "Cultivation Assessment & Water System Recovery", "Review the water supply and cultivation racks, and assess the experiment record started during SOL 6."],
  ["SOL 10", "Final Expedition Verification & Scientific Handover", "Review expedition records, evidence, observations, and system information, then prepare a final handover report."],
  ["SOL 11", "Final Farewell", "Acknowledge an incoming message, write a final expedition log, and follow the departure sequence and cinematic."],
] as const;

export default function MissionsPage() {
  return <PublicShell><main className="public-content"><PageIntro eyebrow="Expedition guide" title="Eleven Sols at the PHOBOSIA outpost" description="The campaign progresses from learning the outpost to selecting and investigating an observation target, responding to fictional operational events, and closing with an expedition handover and departure." />
    <section className="public-mission-list" aria-label="SOL 1 through SOL 11 mission summaries">{missions.map(([sol, title, description]) => <article className="public-mission-card" key={sol}><span className="public-card-index">{sol}</span><div><h2>{title}</h2><p>{description}</p></div></article>)}</section>
    <p className="public-disclaimer">PHOBOSIA's outpost events and operational values are part of a fictional interactive experience. Simulated or unavailable values should not be interpreted as real Mars measurements.</p>
  </main></PublicShell>;
}
