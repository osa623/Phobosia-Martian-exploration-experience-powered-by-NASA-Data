import type { Metadata } from "next";
import OSPreviewClient from "./OSPreviewClient";

export const metadata: Metadata = { title: "OS Preview", robots: { index: false, follow: false } };

export default function OSPreviewPage() {
  return <OSPreviewClient />;
}
