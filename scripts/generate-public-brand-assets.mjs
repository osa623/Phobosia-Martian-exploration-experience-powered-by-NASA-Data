import sharp from "sharp";

const source = "public/assets/PHOBOSIA_Martian_Modern_Logo_4K.png";
const socialLogo = await sharp(source).resize(980, 327, { fit: "contain" }).png().toBuffer();
const socialBackground = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g"><stop stop-color="#632d1d"/><stop offset="1" stop-color="#05090d"/></radialGradient></defs><rect width="1200" height="630" fill="#05090d"/><circle cx="850" cy="310" r="360" fill="url(#g)"/><ellipse cx="850" cy="310" rx="500" ry="165" fill="none" stroke="#bd7047" stroke-opacity=".3"/><text x="600" y="545" text-anchor="middle" fill="#d99669" font-family="Arial,sans-serif" font-size="20" letter-spacing="6">INTERACTIVE 3D MARS EXPLORATION</text></svg>`);

await sharp(socialBackground).composite([{ input: socialLogo, left: 110, top: 130 }]).png().toFile("public/phobosia-social.png");
await sharp(source).resize({ width: 1600 }).webp({ quality: 86 }).toFile("public/phobosia-logo.webp");
