import Link from "next/link";

const links = [
  ["About", "/about"],
  ["Experience", "/experience"],
  ["Missions", "/missions"],
  ["Science & data", "/science-and-data"],
  ["Technology", "/technology"],
] as const;

export function PublicHeader() {
  return <header className="public-header"><Link className="public-brand" href="/" aria-label="PHOBOSIA home"><span className="public-brand-mark">P</span><span>PHOBOSIA</span></Link><nav aria-label="Main navigation" className="public-nav">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav><Link className="public-nav-cta" href="/play">Launch experience <span aria-hidden="true">↗</span></Link></header>;
}

export function PublicFooter() {
  return <footer className="public-footer"><Link className="public-brand" href="/"><span className="public-brand-mark">P</span><span>PHOBOSIA</span></Link><p>An independent, fictional Mars outpost experience. Not affiliated with or endorsed by NASA.</p><nav aria-label="Footer navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav></footer>;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="public-shell"><PublicHeader />{children}<PublicFooter /></div>;
}

export function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="public-page-intro"><p className="public-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="public-lede">{description}</p></section>;
}
