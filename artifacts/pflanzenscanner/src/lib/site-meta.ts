/**
 * Titles, descriptions and addresses of the public pages (docs/seo.md). No
 * imports, so vite.config.ts can use it at build time: it writes one HTML file
 * per page with its own title, description, link preview and canonical
 * address, plus sitemap.xml – search engines and messengers read those
 * without running the app.
 */

/** The address the site is reached at (docs/PROJEKT.md). */
export const SITE_ORIGIN = "https://littlefarming.de";

export const SITE_PATHS = {
  start: "/",
  plants: "/funktionen/pflanzen",
  animals: "/funktionen/tiere",
  farm: "/funktionen/hof",
  pricing: "/preise",
  finder: "/modul-finder",
} as const;
export type SitePage = keyof typeof SITE_PATHS;

export const SITE_TITLES: Record<SitePage, { title: string; description: string }> = {
  start: { title: "Little Farming – Pflanzen, Garten und Tiere in einer App", description: "Pflanzen erkennen, Beete planen, Tiere versorgen, Pflichten im Blick: die App für Balkon, Garten und kleinen Hof." },
  plants: { title: "Pflanzen & Garten – Little Farming", description: "Pflanzen-Scan, Pflegeplan, Pflanzendoc, Beet-Architekt, Vorratskammer und mehr." },
  animals: { title: "Tiere & Hof – Little Farming", description: "Stall-Aufgaben, Futterplaner, Zucht, Arzneimittel, Pflichten, Weide, Bienen und Wildtier-Radar." },
  farm: { title: "Gemeinsam auf dem Hof – Little Farming", description: "Team, Rollen, Urlaubsvertretung, Erinnerungen und Wetterwarnungen für alle, die mit anpacken." },
  pricing: { title: "Preise & Pakete – Little Farming", description: "Basis kostenlos, Lite und Premium mit KI. Welches Paket passt zu dir?" },
  finder: { title: "Modul-Finder – Little Farming", description: "Sag uns, was du hast – Garten, Hühner, Ziegen, Bienen – und wir empfehlen die passenden Module und das Paket." },
};

export interface SeoPage {
  path: string;
  title: string;
  description: string;
  /** For sitemap.xml: 0.0–1.0. */
  priority: number;
}

/** Every public page that belongs in the sitemap: the homepage pages and the legal pages. */
export const SEO_PAGES: SeoPage[] = [
  ...(Object.keys(SITE_PATHS) as SitePage[]).map((page) => ({
    path: SITE_PATHS[page],
    ...SITE_TITLES[page],
    priority: page === "start" ? 1 : 0.8,
  })),
  { path: "/impressum", title: "Impressum – Little Farming", description: "Anbieter und Kontakt von Little Farming.", priority: 0.2 },
  { path: "/datenschutz", title: "Datenschutz – Little Farming", description: "Welche Daten Little Farming verarbeitet, wofür und wie lange.", priority: 0.2 },
  { path: "/nutzungsbedingungen", title: "Nutzungsbedingungen – Little Farming", description: "Die Bedingungen für die Nutzung von Little Farming.", priority: 0.2 },
];

/**
 * Häufige Fragen on the homepage, also sent to search engines as FAQPage.
 * Plain text, no links – the answers must stand on their own.
 */
export const SITE_FAQ: { q: string; a: string }[] = [
  { q: "Was ist Little Farming?", a: "Eine App für Pflanzen, Garten und Tiere: Pflanzen, Pilze und Insekten per Foto bestimmen, Beete planen, Stall-Aufgaben, Futter, Zucht, Krankenakte und Pflichten im Blick behalten – vom Balkon bis zum kleinen Hof." },
  { q: "Was kostet die App?", a: "Alles, was ohne KI läuft, ist kostenlos. Für Foto-Erkennung und KI-Vorschläge gibt es die Pakete Lite und Premium. In der Testphase ist alles offen, und wer jetzt testet, behält die App auch nach dem Start kostenlos." },
  { q: "Muss ich etwas aus dem App Store installieren?", a: "Nein. Little Farming läuft im Browser und lässt sich wie eine App auf den Startbildschirm legen – auf Android und iPhone. Sie funktioniert auch bei schlechtem Empfang; Fotos werden gescannt, sobald wieder Netz da ist." },
  { q: "Wie zuverlässig ist die Pflanzen- und Pilzerkennung?", a: "Die Bestimmung macht eine KI, und die kann sich irren. Pilze erkennt sie nur mit Fotos von oben und unten – und gegessen wird ein Pilz nie allein nach der App, sondern erst nach Prüfung durch eine Pilzsachverständige oder einen Pilzsachverständigen." },
  { q: "Welche Tiere kennt die App?", a: "Hühner, Enten, Gänse, Puten, Wachteln, Nandus, Ziegen, Schafe, Alpakas, Rinder, Schweine, Pferde, Esel, Kaninchen, Meerschweinchen, Bienen, Hunde und Katzen – jede Art mit eigenem Futterbedarf, Brut- oder Tragzeit und Pflichten." },
  { q: "Kann ich den Hof mit Familie, Team oder Tierarzt teilen?", a: "Ja. Du lädst Mitglieder mit einer Rolle ein (Admin, Mitarbeiter, Gast) und gibst Module frei. Eine Urlaubsvertretung oder der Tierarzt bekommt Zugang bis zu einem Tag, danach endet er von selbst." },
  { q: "Wo liegen meine Daten?", a: "App und Datenbank laufen in Rechenzentren in Frankfurt am Main. Fotos liegen beim Bilddienst Cloudinary, Fotos für die KI-Auswertung gehen an Google – alles dazu steht in der Datenschutzerklärung. Du kannst deine Daten jederzeit herunterladen und dein Konto mit allen persönlichen Daten selbst löschen." },
  { q: "Ist Little Farming eine Bio-App?", a: "Nein – Bio ist eine Option. Jeder Hof stellt unter „Farm & Team“ ein, wie er wirtschaftet: konventionell, naturnah oder Bio, und kann jederzeit wechseln. Wer Bio wählt, bekommt nur biologische Empfehlungen, die doppelte Wartezeit, Bio-Anteile im Futter, einen Platz-Check, den Bio-Check und eine Bio-Dokumentation für die Kontrolle. Wer konventionell wirtschaftet, sieht davon nichts." },
  { q: "Ersetzt die App Tierarzt, Arzt oder Amt?", a: "Nein. Futterwerte, Wartezeiten, Heilkräuter und Fristen sind Richtwerte und Arbeitshilfen. Maßgeblich bleiben Beipackzettel, Tierarzt, Arzt, Veterinäramt und Tierseuchenkasse." },
];

/** Picture for link previews (1200 × 630, public/og-image.png). */
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The head tags of a page: description, canonical address and link preview. */
export function headTags(page: SeoPage): string {
  const url = `${SITE_ORIGIN}${page.path}`;
  const t = escapeHtml(page.title);
  const d = escapeHtml(page.description);
  return [
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Little Farming" />`,
    `<meta property="og:locale" content="de_DE" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
}

/** Structured data for the homepage: the app (free to start) and who offers it. */
export function structuredData(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Little Farming",
        url: SITE_ORIGIN,
        description: SITE_TITLES.start.description,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web, Android, iOS",
        inLanguage: "de",
        image: OG_IMAGE,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
      { "@type": "Organization", name: "Little Farming", url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/icon-512.png`, email: "info@littlefarming.de" },
      {
        "@type": "FAQPage",
        mainEntity: SITE_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

const SEO_BLOCK = /<!-- seo -->[\s\S]*?<!-- \/seo -->|<meta name="description"[^>]*>/;

/**
 * The built index.html for one page: its title, and the head tags (on the
 * homepage with the structured data) in place of the generic description or
 * of another page's tags.
 */
export function pageHtml(indexHtml: string, page: SeoPage): string {
  const extra = page.path === "/" ? `\n    ${structuredData()}` : "";
  return indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(SEO_BLOCK, `<!-- seo -->\n    ${headTags(page)}${extra}\n    <!-- /seo -->`);
}

/** sitemap.xml for all public pages. */
export function sitemapXml(lastmod: string): string {
  const urls = SEO_PAGES.map(
    (p) => `  <url>\n    <loc>${SITE_ORIGIN}${p.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
