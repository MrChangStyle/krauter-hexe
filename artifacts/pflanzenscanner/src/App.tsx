import { useEffect } from 'react';
import { syncPushSubscription } from '@/lib/push';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import Layout from '@/components/layout';
import AuthGate from '@/components/auth-gate';
import ScanPage from '@/pages/scan';
import PflanzenPage from '@/pages/pflanzen';
import AufgabenPage from '@/pages/aufgaben';
import ArchivePage from '@/pages/archive';
import CategoriesPage from '@/pages/categories';
import KraeuterHexePage from '@/pages/kraeuter-hexe';
import PflanzendocPage from '@/pages/pflanzendoc';
import WerkzeugPage from '@/pages/werkzeug';
import PlantDetailPage from '@/pages/plant-detail';
import InsectScanPage from '@/pages/insect-scan';
import InsectDetailPage from '@/pages/insect-detail';
import PendingPage from '@/pages/pending';
import UsersPage from '@/pages/users';
import PflegeGuidesPage from '@/pages/pflege-guides';
import PflegeGuideDetailPage from '@/pages/pflege-guide-detail';
import { AuthProvider } from '@/lib/auth-context';
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
        <Route path="/pflanzen" component={PflanzenPage} />
        <Route path="/aufgaben" component={AufgabenPage} />
        {/* Legacy redirects — keep old deep links working */}
        <Route path="/insekten">{() => { window.location.replace(import.meta.env.BASE_URL + "insekten-scanner"); return null; }}</Route>
        <Route path="/archiv">{() => { window.location.replace(import.meta.env.BASE_URL + "pflanzen"); return null; }}</Route>
        <Route path="/arten">{() => { window.location.replace(import.meta.env.BASE_URL + "pflanzen"); return null; }}</Route>
        <Route path="/kraeuter-hexe" component={KraeuterHexePage} />
        <Route path="/pflanzendoc" component={PflanzendocPage} />
        <Route path="/werkzeug" component={WerkzeugPage} />
        <Route path="/insekten-scanner" component={InsectScanPage} />
        <Route path="/insekt/:id" component={InsectDetailPage} />
        <Route path="/warteschlange" component={PendingPage} />
        <Route path="/benutzer" component={UsersPage} />
        <Route path="/pflanze/:id" component={PlantDetailPage} />
        <Route path="/pflege-guides" component={PflegeGuidesPage} />
        <Route path="/pflege-guide/:id" component={PflegeGuideDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Everything - including the offline scan queue - only runs for
            signed-in, approved accounts. */}
        <AuthGate>
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
  );
}

export default App;
