import { useEffect } from "react";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { AreaPage, FarmPage, FinderPage, PricingPage, StartPage } from "@/components/site/site-pages";
import { SiteLayout, type SiteActions } from "@/components/site/site-parts";
import { SITE_PATHS, SITE_TITLES, sitePageOf } from "@/lib/site";
import { sendSiteVisit } from "@/lib/site-visit";

/** Title and description per page, for the tab and for search engines. */
function useMeta() {
  const [location] = useLocation();
  useEffect(() => {
    const page = sitePageOf(location) ?? "start";
    const meta = SITE_TITLES[page];
    document.title = meta.title;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "description";
      document.head.appendChild(tag);
    }
    tag.content = meta.description;
    sendSiteVisit(location);
  }, [location]);
}

function Pages({ actions }: { actions: SiteActions }) {
  useMeta();
  return (
    <SiteLayout actions={actions}>
      <Switch>
        <Route path={SITE_PATHS.plants}>
          <AreaPage area="pflanzen" actions={actions} />
        </Route>
        <Route path={SITE_PATHS.animals}>
          <AreaPage area="tiere" actions={actions} />
        </Route>
        <Route path={SITE_PATHS.farm}>
          <FarmPage actions={actions} />
        </Route>
        <Route path={SITE_PATHS.pricing}>
          <PricingPage actions={actions} />
        </Route>
        <Route path={SITE_PATHS.finder}>
          <FinderPage actions={actions} />
        </Route>
        <Route>
          <StartPage actions={actions} />
        </Route>
      </Switch>
    </SiteLayout>
  );
}

/**
 * The public homepage (docs/landingpage.md): start, Pflanzen, Tiere,
 * Gemeinsam auf dem Hof, Preise & Pakete and the Modul-Finder, each at its own
 * address. Signed out on "/", the AuthGate shows it with the form actions;
 * the sub pages are picked before the AuthGate and work for everyone.
 */
export function SiteApp(actions: SiteActions) {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Pages actions={actions} />
    </WouterRouter>
  );
}
