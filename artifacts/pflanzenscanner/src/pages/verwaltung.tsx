import { Link } from "wouter";
import { Activity, ArrowLeft, Crown, Flag, ImagePlus, MessageCircle, NotebookPen, Trash2, Users } from "lucide-react";
import { CropDraftsCard } from "@/components/crop-drafts-card";
import { HubGrid, HubTile } from "@/components/hub-tile";
import { ModerationCard } from "@/components/moderation-card";
import { FeedbackCard } from "@/components/feedback-card";
import { OperationsCard } from "@/components/operations-card";
import { OrphanCleanupCard } from "@/components/orphan-cleanup-card";
import { PremiumAdminCard } from "@/components/premium-admin-card";
import { RecipeDraftsCard } from "@/components/recipe-drafts-card";
import { SiteImagesCard } from "@/components/site-images-card";
import { useAuthContext } from "@/lib/auth-context";
import { Benutzerverwaltung } from "@/pages/mehr";

/** /verwaltung – the owner's tools, moved out of "Mehr": tiles on top, the sections below. */
export default function VerwaltungPage() {
  const { user: me } = useAuthContext();
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Verwaltung</h1>
        <p className="text-sm text-muted-foreground mt-1">Betrieb der App – nur für dich als Betreiber.</p>
      </div>

      {!me?.isOwner ? (
        <p className="text-sm text-muted-foreground">Diese Seite gibt es nur für den Betreiber.</p>
      ) : (
        <>
          <HubGrid>
            {/* Eight tiles in pairs: Feedback, read most often, and the homepage pictures take the full width. */}
            <HubTile href="#feedback" icon={MessageCircle} label="Feedback" hint="Ideen und Wünsche der Tester" tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" className="col-span-2" />
            <HubTile href="#betrieb" icon={Activity} label="Betrieb" hint="Fehler, Status, Nutzung" tone="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" />
            <HubTile href="#moderation" icon={Flag} label="Moderation" hint="Gemeldete Inhalte" tone="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" />
            <HubTile href="#entwuerfe" icon={NotebookPen} label="Entwürfe" hint="Pflanzen & Futter-Rezepte" tone="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" />
            <HubTile href="#premium" icon={Crown} label="Premium" hint="Per Hand vergeben" tone="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300" />
            <HubTile href="#benutzer" icon={Users} label="Benutzer" hint="Freigeben, verwalten" tone="bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" />
            <HubTile href="#aufraeumen" icon={Trash2} label="Aufräumen" hint="Verwaiste Daten" tone="bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200" />
            <HubTile href="#homepage" icon={ImagePlus} label="Homepage-Bilder" hint="Realistische Bilder per KI" tone="bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300" className="col-span-2" />
          </HubGrid>

          <div id="betrieb" className="scroll-mt-4">
            <OperationsCard />
          </div>
          <div id="feedback" className="scroll-mt-4">
            <FeedbackCard />
          </div>
          <div id="moderation" className="scroll-mt-4">
            <ModerationCard />
          </div>
          <div id="entwuerfe" className="scroll-mt-4 space-y-5">
            <CropDraftsCard />
            <RecipeDraftsCard />
          </div>
          <div id="premium" className="scroll-mt-4">
            <PremiumAdminCard />
          </div>
          <div id="benutzer" className="scroll-mt-4">
            <Benutzerverwaltung />
          </div>
          <div id="aufraeumen" className="scroll-mt-4">
            <OrphanCleanupCard />
          </div>
          <div id="homepage" className="scroll-mt-4">
            <SiteImagesCard />
          </div>
        </>
      )}
    </div>
  );
}
