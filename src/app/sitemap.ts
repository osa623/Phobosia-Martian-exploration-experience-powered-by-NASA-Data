import type { MetadataRoute } from "next";
import { siteUrl } from "./site";

const publicPaths = ["/", "/about", "/experience", "/missions", "/science-and-data", "/technology"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl;
  if (!base) return [];
  return publicPaths.map(path => ({ url: new URL(path, base).toString() }));
}
