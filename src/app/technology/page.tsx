import type { Metadata } from "next";
import { PageIntro, PublicShell } from "@/components/public/PublicSite";
import { canonical, publicSocialMetadata } from "../site";

export const metadata: Metadata = {
  title: "Browser 3D Technology",
  description: "Learn how PHOBOSIA delivers its interactive Mars outpost through a Next.js web application and Three.js 3D rendering.",
  alternates: { canonical: canonical("/technology") },
  ...publicSocialMetadata("PHOBOSIA Browser 3D Technology", "An overview of the web technologies behind the interactive Mars environment.", "/technology"),
};

export default function TechnologyPage() {
  return <PublicShell><main className="public-content"><PageIntro eyebrow="Technical overview" title="An interactive 3D environment in the browser" description="PHOBOSIA is implemented as a web application so its fictional Mars outpost can be explored through a supported browser." />
    <section className="public-prose"><h2>Web application and 3D rendering</h2><p>The project uses Next.js with the App Router and React for its web interface. Three.js renders the interactive 3D environments and handles scene presentation in the browser. The game loads its 3D models, environment maps, audio, and other assets when visitors choose to launch the experience from the public site.</p><h2>Browser access</h2><p>The interactive environment requires a modern browser with WebGL enabled. Browser performance depends on the device and its graphics capabilities. The informational pages are regular web pages and do not require the 3D environment to start.</p><h2>Project scope</h2><p>The public site describes the current project implementation. It does not claim that PHOBOSIA is a planetary data visualization service, a NASA simulator, or a scientific research instrument.</p></section>
  </main></PublicShell>;
}
