import { describe, expect, it } from "vitest";
import { SEO_PAGES, SITE_FAQ, SITE_ORIGIN, pageHtml, sitemapXml, structuredData } from "./site-meta";
import { SITE_SPECIES } from "./site";

const INDEX = `<html><head>\n    <meta name="description" content="App" />\n    <title>Little Farming</title>\n</head><body></body></html>`;

describe("SEO pages", () => {
  it("lists every homepage page and the legal pages once", () => {
    const paths = SEO_PAGES.map((p) => p.path);
    expect(paths).toEqual(["/", "/funktionen/pflanzen", "/funktionen/tiere", "/funktionen/hof", "/preise", "/modul-finder", "/impressum", "/datenschutz", "/nutzungsbedingungen"]);
    for (const p of SEO_PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(70);
      expect(p.description.length, p.path).toBeLessThanOrEqual(160);
    }
  });

  it("gives each page its title, canonical address and link preview", () => {
    const start = pageHtml(INDEX, SEO_PAGES[0]!);
    expect(start).toContain("<title>Little Farming – Pflanzen, Garten und Tiere in einer App</title>");
    expect(start).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
    expect(start).toContain('"@type":"WebApplication"');
    // A sub page built from the homepage's file replaces its tags instead of adding to them.
    const prices = pageHtml(start, SEO_PAGES.find((p) => p.path === "/preise")!);
    expect(prices.match(/rel="canonical"/g)).toHaveLength(1);
    expect(prices).toContain(`<meta property="og:url" content="${SITE_ORIGIN}/preise" />`);
    expect(prices).toContain("<title>Preise &amp; Pakete – Little Farming</title>");
    expect(prices).not.toContain("ld+json");
    expect(prices).not.toContain('content="App"');
  });

  it("answers the common questions on the homepage and for search engines", () => {
    expect(SITE_FAQ.length).toBeGreaterThanOrEqual(6);
    for (const { q, a } of SITE_FAQ) {
      expect(q.endsWith("?"), q).toBe(true);
      expect(a.length, q).toBeLessThanOrEqual(400);
    }
    const ld = JSON.parse(structuredData().replace(/^<script[^>]*>|<\/script>$/g, ""));
    const faq = ld["@graph"].find((g: { "@type": string }) => g["@type"] === "FAQPage");
    expect(faq.mainEntity).toHaveLength(SITE_FAQ.length);
    // The species answer names every animal the Tiere page shows.
    const species = SITE_FAQ.find((f) => f.q.startsWith("Welche Tiere"))!.a;
    for (const s of SITE_SPECIES) expect(species, s.label).toContain(s.label);
  });

  it("writes a sitemap with every page", () => {
    const xml = sitemapXml("2026-10-29");
    expect(xml.match(/<url>/g)).toHaveLength(SEO_PAGES.length);
    expect(xml).toContain(`<loc>${SITE_ORIGIN}/modul-finder</loc>`);
    expect(xml).toContain("<lastmod>2026-10-29</lastmod>");
  });
});
