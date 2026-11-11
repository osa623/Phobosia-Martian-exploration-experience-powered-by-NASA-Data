import type { Metadata } from "next";
import { PageIntro, PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata } from "../site";

export const metadata: Metadata = {
  title: "How to Explore PHOBOSIA",
  description: "See how to launch and navigate PHOBOSIA's browser-based 3D Mars outpost, use its first-person controls, and follow mission activities.",
  alternates: { canonical: canonical("/experience") },
  ...publicSocialMetadata("How to Explore PHOBOSIA", "A guide to launching and navigating the interactive 3D Mars outpost.", "/experience"),
};

export default function ExperiencePage() {
  return <PublicShell><main className="public-content"><PageIntro eyebrow="Experience guide" title="How to explore PHOBOSIA" description="Launch the browser experience, move through the fictional outpost, and use the mission prompts to guide your exploration." />
    <section className="public-prose"><h2>Start an expedition</h2><p>Choose “Launch experience” to load the interactive environment. From the main menu, you can begin a new exploration, continue an existing record, or select a previous Sol where a saved record is available. The game stores mission progress in the browser's local storage.</p><h2>Move through the outpost</h2><p>In the first-person environment, use <kbd>W</kbd>, <kbd>A</kbd>, <kbd>S</kbd>, and <kbd>D</kbd> to move, <kbd>Shift</kbd> to jog, and <kbd>Space</kbd> to jump. Move the mouse to look around. Use <kbd>E</kbd> when an interaction or travel prompt is available. Press <kbd>Esc</kbd> to release the pointer lock so you can use browser controls again.</p><p>Some activities use their own controls. For example, the rover and drone sections display contextual instructions when active. Follow the on-screen prompts for those modes.</p><h2>Follow the mission prompts</h2><p>The expedition is organized by Sol. Mission briefings and objectives identify the relevant locations and tasks. You can explore modules such as Habitat, Mission Control, Research Lab, Engineering, Central Hub, and Airlock, as well as the outdoor terrain. Later activities include drone reconnaissance, a field investigation, a simulated dust-storm response, system repair activities, and a final expedition review.</p><h2>Browser requirements</h2><p>PHOBOSIA renders its interactive environment with WebGL. Use a modern browser with WebGL enabled. The public information pages remain available without launching the 3D environment.</p><p><a className="public-button" href="/play">Launch PHOBOSIA <span aria-hidden="true">↗</span></a></p></section>
  </main></PublicShell>;
}
