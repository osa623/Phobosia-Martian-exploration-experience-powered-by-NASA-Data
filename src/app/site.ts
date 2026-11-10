import type { Metadata } from "next";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const siteUrl = (() => {
  if (!configuredSiteUrl) return null;
  try {
    const url = new URL(configuredSiteUrl);
    const secureOrigin = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
    return secureOrigin && url.pathname === "/" && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
})();

export function canonical(path: string) {
  return siteUrl ? new URL(path, siteUrl).toString() : undefined;
}

export function publicSocialMetadata(title: string, description: string, path: string): Pick<Metadata, "openGraph" | "twitter"> {
  const images = siteUrl ? [{ url: "/phobosia-social.png", width: 1200, height: 630, alt: "PHOBOSIA — an interactive 3D Mars exploration experience" }] : undefined;
  return {
    openGraph: { title, description, type: "website", siteName: "PHOBOSIA", url: canonical(path), images },
    twitter: { card: siteUrl ? "summary_large_image" : "summary", title, description, ...(images ? { images: [images[0].url] } : {}) },
  };
}
