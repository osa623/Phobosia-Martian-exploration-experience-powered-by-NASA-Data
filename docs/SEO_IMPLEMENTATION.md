# PHOBOSIA SEO implementation notes

## Public page map

| URL | Search intent |
| --- | --- |
| `/` | Interactive 3D Mars exploration |
| `/about` | What PHOBOSIA is and its fictional project setting |
| `/experience` | How to launch and explore the browser experience |
| `/missions` | High-level overview of the SOL 1–11 campaign |
| `/science-and-data` | Scientific themes, simulation notes, and data provenance |
| `/technology` | Browser and 3D implementation overview |
| `/play` | Game launch; excluded from the sitemap and set to noindex |

## Production domain setup

The repository does not identify a production hostname or deployment provider. Set `NEXT_PUBLIC_SITE_URL` in the production environment to the verified canonical origin, including the scheme and no path, for example `https://your-real-domain.example`. The example is a format only and must be replaced with the actual production origin. Canonical links, absolute sitemap URLs, the robots sitemap directive, and the site's structured-data URL are emitted only when this value is a valid HTTPS URL (or localhost for local development). Do not configure a staging hostname as the production value.

Until configured, `robots.txt` remains crawl-allowed but has no sitemap directive; `/sitemap.xml` is empty and canonical links are omitted. Configure the actual hostname before submitting the sitemap in Google Search Console or Bing Webmaster Tools. No search-engine verification token or analytics ID is present; add those only through the appropriate owner account and deployment settings.

## Content and source limits

Search phrases are mapped by user intent in the public page map; no search-volume or ranking claims are made. The project repository's mission and interface materials identify simulated operational readings and fictional narrative elements. The reviewed materials do not establish a verified NASA dataset integration, telemetry feed, terrain imagery provenance, author organization, or endorsement. The science page reflects these evidence limits and should be updated if the project later documents exact source URLs, licenses, and asset provenance.

## Analytics

No analytics provider was found in the repository. This implementation adds no tracking scripts or personal-data collection. Add a privacy-reviewed analytics provider only after selecting it and configuring any consent requirements.
