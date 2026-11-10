import type { Metadata } from "next";
import { LaunchExperience } from "@/components/loading/LaunchExperience";
import { canonical } from "../site";

export const metadata: Metadata = {
  title: "Launch the Mars Exploration Experience",
  description: "Launch PHOBOSIA's interactive 3D Mars outpost and continue or begin the mission-based expedition.",
  alternates: { canonical: canonical("/play") },
  robots: { index: false, follow: true },
  openGraph: { title: "Launch PHOBOSIA", description: "Enter the interactive 3D Mars outpost experience.", url: canonical("/play") },
};

export default function PlayPage() {
  return <main className="h-screen w-screen"><LaunchExperience /></main>;
}
