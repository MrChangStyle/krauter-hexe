import { openFeedback } from "@/components/feedback-bubble";
import { SPECIES_WISH_TEXT } from "@/lib/site";

/**
 * "Tierart anfragen" (docs/gefluegel.md): a missing species goes to the owner
 * as feedback (Verwaltung → Feedback). A species needs its own feed, brood and
 * weather values, so it is added by the team, not typed in freely.
 */
export function SpeciesRequestLink({ beforeOpen }: { beforeOpen?: () => void }) {
  return (
    <button
      type="button"
      className="self-start text-xs text-muted-foreground underline underline-offset-4"
      data-testid="species-request"
      onClick={() => {
        beforeOpen?.();
        // After a dialog closed, so the feedback dialog gets the focus.
        setTimeout(() => openFeedback(SPECIES_WISH_TEXT), 0);
      }}
    >
      Deine Tierart fehlt? Anfragen
    </button>
  );
}
