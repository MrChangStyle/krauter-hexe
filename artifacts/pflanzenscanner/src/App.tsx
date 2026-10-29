import { useEffect, useState } from 'react';
import { syncPushSubscription } from '@/lib/push';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import FarmPage from '@/pages/farm';
import FarmAnimalPage from '@/pages/farm-animal';
import FarmCamerasPage from '@/pages/farm-cameras';
import BeetePage from '@/pages/beete';
import GartenKalenderPage from '@/pages/garten-kalender';
import GartenAssistentPage from '@/pages/garten-assistent';
import BeetPage from '@/pages/beet';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import Layout from '@/components/layout';
import AuthGate from '@/components/auth-gate';
import ScanPage from '@/pages/scan';
import PflanzenPage from '@/pages/pflanzen';
import AufgabenPage from '@/pages/aufgaben';
import HofAufgabenPage from '@/pages/hof-aufgaben';
import NotizenPage from '@/pages/notizen';
import ArchivePage from '@/pages/archive';
import CategoriesPage from '@/pages/categories';
import KraeuterHexePage from '@/pages/kraeuter-hexe';
import PflanzendocPage from '@/pages/pflanzendoc';
import HilfePage from '@/pages/hilfe';
import PflanzenHubPage from '@/pages/pflanzen-hub';
import MeinePflanzenPage from '@/pages/meine-pflanzen';
import SchaedlingePage from '@/pages/schaedlinge';
import MeineTierePage from '@/pages/meine-tiere';
import { BeneficialPage, ProblemPage } from '@/pages/nuetzlinge';
import PlantDetailPage from '@/pages/plant-detail';
import InsectScanPage from '@/pages/insect-scan';
import InsectDetailPage from '@/pages/insect-detail';
import PendingPage from '@/pages/pending';
import MehrPage from '@/pages/mehr';
import PflegeGuidesPage from '@/pages/pflege-guides';
import PflegeGuideDetailPage from '@/pages/pflege-guide-detail';
import { AuthProvider } from '@/lib/auth-context';
import { LEGAL_PATHS } from '@/lib/legal';
import {
  AgbPage,
  DatenschutzPage,
  ImpressumPage,
  NutzungsbedingungenPage,
  WiderrufPage,
} from '@/pages/rechtliches';
import AboPage, { TestkassePage } from '@/pages/abo';
import { SiteApp } from '@/components/site/site-app';
import { sitePageOf } from '@/lib/site';
import UmzugPage from '@/pages/umzug';
import PasswortNeuPage from '@/pages/passwort-neu';
import { MoveGate } from '@/components/move-screen';
import { ScanQueueProvider } from '@/lib/scan-queue-context';
import { UpdatePrompt } from '@/components/update-prompt';
import { useOfflineWarmup } from '@/lib/use-offline-warmup';
import { useAnimalBackfill } from '@/lib/use-animal-backfill';
import { useSymptomBackfill } from '@/lib/use-symptom-backfill';
import { useToxicityBackfill } from '@/lib/use-toxicity-backfill';
import { useFruitsBackfill } from '@/lib/use-fruits-backfill';
import { usePreparationBackfill } from '@/lib/use-preparation-backfill';
import { useSymptomApplicationsBackfill } from '@/lib/use-symptom-applications-backfill';
import { useMedicinalReviewBackfill } from '@/lib/use-medicinal-review-backfill';
import { useEdibleMedicinalBackfill } from '@/lib/use-edible-medicinal-backfill';
import { ErrorBoundary } from '@/components/error-boundary';
import FutterplanerPage from '@/pages/futterplaner';
import FutterVorratPage from '@/pages/futter-vorrat';
import FutterTippsPage from '@/pages/futter-tipps';
import ArzneimittelPage from '@/pages/arzneimittel';
import UebergabePage from '@/pages/uebergabe';
import PflichtenPage from '@/pages/pflichten';
import ZuchtPage from '@/pages/zucht';
import SaatgutPage from '@/pages/saatgut';
import ErtragPage from '@/pages/ertrag';
import LegeleistungPage from '@/pages/legeleistung';
import StallPage from '@/pages/stall';
import BienenPage from '@/pages/bienen';
import BienenVolkPage from '@/pages/bienen-volk';
import VorratPage from '@/pages/vorrat';
import WeidePage from '@/pages/weide';
import ErnteAuswertungPage from '@/pages/ernte-auswertung';
import GrowPage from '@/pages/grow';
import GrowPlantPage from '@/pages/grow-plant';
import GrowKostenPage from '@/pages/grow-kosten';
import VerwaltungPage from '@/pages/verwaltung';
import ModulePage from '@/pages/module';
import FarmAufgabenPage from '@/pages/farm-aufgaben';
import FarmExportPage from '@/pages/farm-export';
import TeamPage from '@/pages/team';
import TierNeuPage from '@/pages/tier-neu';
import SuchePage from '@/pages/suche';
import GrowWissenPage from '@/pages/grow-wissen';
import GrowRechtPage from '@/pages/grow-recht';
import { StatusBanner } from '@/components/status-banner';
import { resolveEntry } from '@/lib/app-entry';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // "offlineFirst" makes React Query always run the fetch instead of
      // pausing it when the browser reports no connection. The request then
      // hits the service worker, which serves the last cached plant data - so
      // the archive and categories stay visible offline. When online, the
      // service worker's NetworkFirst rule still returns fresh data.
      networkMode: 'offlineFirst',
      // Keep previously loaded data around long enough to survive navigation
      // and a cold reload while offline.
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24, // 24h
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  // Keep the offline cache complete (plant list + all photos) while online.
  useOfflineWarmup();
  // Re-sync this device's push subscription with the server on app start so
  // reminders keep arriving after a subscription refresh or re-login.
  useEffect(() => {
    void syncPushSubscription();
  }, []);
  // Owner-only: fill in per-animal fact sheets for older plants in the background.
  const animalsBackfilled = useAnimalBackfill();
  // Owner-only: fill in treatable-symptom tags for older plants in the background.
  // Gated on the animal backfill so symptoms are grounded in the animal benefits.
  useSymptomBackfill(animalsBackfilled);
  // Owner-only: fill in the three-tier toxicity level (unverträglich/giftig/tödlich)
  // for poisonous plants scanned before the feature existed.
  // Gated on the symptom backfill to keep server load bounded.
  const toxicityBackfilled = useToxicityBackfill(animalsBackfilled);
  // Owner-only: fill in the edible-fruits flag for trees/shrubs scanned before
  // the feature existed. Gated on toxicity backfill to keep load bounded.
  const fruitsBackfilled = useFruitsBackfill(toxicityBackfilled);
  // Owner-only: fill in the preparation description for edible plants scanned
  // before the feature existed. Gated on fruits backfill to keep load bounded.
  const preparationBackfilled = usePreparationBackfill(fruitsBackfilled);
  // Owner-only: fill in per-symptom application instructions for plants scanned
  // before the feature existed. Gated on preparation backfill (keeps load bounded
  // and ensures symptom tags are already filled before this runs).
  useSymptomApplicationsBackfill(preparationBackfilled);
  // Owner-only: re-evaluate stored "medicinal" plants against current
  // phytotherapy standards and reclassify any that are no longer recommended.
  useMedicinalReviewBackfill();
  // Owner-only: promote "edible" plants to "medicinal" where current
  // phytotherapy supports it (e.g. Löwenzahn, Strahlenlose Kamille).
  useEdibleMedicinalBackfill();

  return (
    <Layout>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={ScanPage} />
        <Route path="/pflanzen" component={PflanzenHubPage} />
        <Route path="/lexikon" component={PflanzenPage} />
        <Route path="/meine-pflanzen" component={MeinePflanzenPage} />
        <Route path="/schaedlinge" component={SchaedlingePage} />
        <Route path="/schaedlinge/hilfe/:problem" component={ProblemPage} />
        <Route path="/schaedlinge/nuetzling/:id" component={BeneficialPage} />
        <Route path="/tiere"><Redirect to="/farm" replace /></Route>
        <Route path="/mehr" component={MehrPage} />
        <Route path="/abo" component={AboPage} />
        <Route path="/abo/testkasse" component={TestkassePage} />
        <Route path="/verwaltung" component={VerwaltungPage} />
        <Route path="/module" component={ModulePage} />
        <Route path="/hilfe" component={HilfePage} />
        <Route path="/aufgaben" component={AufgabenPage} />
        <Route path="/hof-aufgaben" component={HofAufgabenPage} />
        <Route path="/notizen" component={NotizenPage} />
        <Route path="/farm" component={FarmPage} />
        <Route path="/farm/tiere" component={MeineTierePage} />
        <Route path="/farm/kameras" component={FarmCamerasPage} />
        <Route path="/farm/futter" component={FutterplanerPage} />
        <Route path="/farm/futter/vorrat" component={FutterVorratPage} />
        <Route path="/farm/futter/tipps" component={FutterTippsPage} />
        <Route path="/farm/arzneimittel" component={ArzneimittelPage} />
        <Route path="/farm/uebergabe" component={UebergabePage} />
        <Route path="/farm/pflichten" component={PflichtenPage} />
        <Route path="/farm/aufgaben" component={FarmAufgabenPage} />
        <Route path="/farm/export" component={FarmExportPage} />
        <Route path="/farm/mitglieder"><Redirect to="/team" replace /></Route>
        <Route path="/team" component={TeamPage} />
        <Route path="/suche" component={SuchePage} />
        <Route path="/farm/tier/neu" component={TierNeuPage} />
        <Route path="/farm/zucht" component={ZuchtPage} />
        <Route path="/farm/ertrag" component={ErtragPage} />
        <Route path="/farm/legeleistung" component={LegeleistungPage} />
        <Route path="/farm/stall" component={StallPage} />
        <Route path="/farm/bienen" component={BienenPage} />
        <Route path="/farm/bienen/:colonyId" component={BienenVolkPage} />
        <Route path="/vorrat" component={VorratPage} />
        <Route path="/farm/weide" component={WeidePage} />
        <Route path="/grow" component={GrowPage} />
        <Route path="/grow/pflanze/:plantId" component={GrowPlantPage} />
        <Route path="/grow/kosten/:growId" component={GrowKostenPage} />
        <Route path="/grow/wissen" component={GrowWissenPage} />
        <Route path="/grow/recht" component={GrowRechtPage} />
        <Route path="/farm/:farmId/tier/:animalId" component={FarmAnimalPage} />
        <Route path="/beete" component={BeetePage} />
        <Route path="/beete/kalender" component={GartenKalenderPage} />
        <Route path="/beete/assistent" component={GartenAssistentPage} />
        <Route path="/beete/saatgut" component={SaatgutPage} />
        <Route path="/beete/ernte" component={ErnteAuswertungPage} />
        <Route path="/beete/:farmId/:bedId" component={BeetPage} />
        {/* Legacy redirects — keep old deep links working */}
        <Route path="/insekten">{() => { window.location.replace(import.meta.env.BASE_URL + "insekten-scanner"); return null; }}</Route>
        <Route path="/archiv"><Redirect to="/lexikon" replace /></Route>
        <Route path="/arten"><Redirect to="/lexikon?tab=arten" replace /></Route>
        <Route path="/kraeuter-hexe" component={KraeuterHexePage} />
        <Route path="/pflanzendoc" component={PflanzendocPage} />
        <Route path="/werkzeug"><Redirect to="/pflanzen" replace /></Route>
        <Route path="/insekten-scanner" component={InsectScanPage} />
        <Route path="/insekt/:id" component={InsectDetailPage} />
        <Route path="/warteschlange" component={PendingPage} />
        <Route path="/benutzer"><Redirect to="/mehr" replace /></Route>
        <Route path="/pflanze/:id" component={PlantDetailPage} />
        <Route path="/pflege-guides" component={PflegeGuidesPage} />
        <Route path="/pflege-guide/:id" component={PflegeGuideDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

/**
 * Pages that work without an account, picked before the AuthGate: Impressum,
 * Datenschutz and Nutzungsbedingungen (the registration form links to them),
 * /umzug, which receives this device's photos from the old address,
 * /passwort-neu behind a reset link (docs/konto.md), and the
 * homepage's sub pages (lib/site.ts).
 * Links to them are plain page loads, so reading the path once is enough.
 */
function publicPageFor(pathname: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  switch (path.replace(/\/$/, '')) {
    case LEGAL_PATHS.impressum:
      return <ImpressumPage />;
    case LEGAL_PATHS.datenschutz:
      return <DatenschutzPage />;
    case LEGAL_PATHS.nutzungsbedingungen:
      return <NutzungsbedingungenPage />;
    case LEGAL_PATHS.agb:
      return <AgbPage />;
    case LEGAL_PATHS.widerruf:
      return <WiderrufPage />;
    case '/umzug':
      return <UmzugPage />;
    case '/passwort-neu':
      return <PasswortNeuPage />;
    default:
      // The homepage's sub pages (Pflanzen, Tiere, Preise …) – for everyone.
      return sitePageOf(path) ? <SiteApp /> : null;
  }
}

function App() {
  const publicPage = publicPageFor(window.location.pathname);
  // "/" in a browser tab is the homepage, "/app" the app (lib/app-entry.ts) – decided once per load.
  const [site] = useState(() => (publicPage ? false : resolveEntry(import.meta.env.BASE_URL.replace(/\/$/, '')) === 'site'));
  if (publicPage) return publicPage;

  return (
    // At an old address after the move, the move helper replaces the app.
    <ErrorBoundary>
    <MoveGate>
      <QueryClientProvider client={queryClient}>
        <StatusBanner />
        <AuthProvider>
          {/* Everything - including the offline scan queue - only runs for
              signed-in, approved accounts. */}
          <AuthGate site={site}>
            <ScanQueueProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                  <Router />
                </WouterRouter>
              </TooltipProvider>
            </ScanQueueProvider>
          </AuthGate>
          {/* Automatic "new version available" popup. Rendered outside AuthGate
              so it also appears on the login screen if an update lands there. */}
          <UpdatePrompt />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </MoveGate>
    </ErrorBoundary>
  );
}

export default App;
