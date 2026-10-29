import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, MessageCircle, Mic, Send } from "lucide-react";
import { useSendFeedback } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePushToTalk } from "@/hooks/use-push-to-talk";
import { appendPhrase } from "@/lib/speech";

const OPEN_EVENT = "lf-feedback";

/** Opens the feedback dialog from anywhere in the app, with a text to start from. */
export function openFeedback(text = ""): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: text }));
}

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/**
 * Feedback (docs/feedback.md): a small speech bubble above the bottom bar.
 * Testers type or dictate an idea; it goes to the owner (Verwaltung →
 * Feedback) together with the page it was sent from.
 */
export function FeedbackBubble() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  // Hold to speak, let go when done (docs/spracheingabe.md).
  const { supported: canDictate, listening, stop, handlers } = usePushToTalk((phrase) => {
    setUsedVoice(true);
    setText((t) => appendPhrase(t, phrase));
  });
  const send = useSendFeedback({
    mutation: {
      onSuccess() {
        setOpen(false);
        setText("");
        setUsedVoice(false);
        toast({ title: "Danke für dein Feedback!", description: "Es ist beim Little-Farming-Team angekommen." });
      },
      onError: (err) => toast({ title: "Nicht gesendet", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" }),
    },
  });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const start = (event as CustomEvent<string>).detail ?? "";
      if (start) setText((t) => (t.trim() ? t : start));
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Feedback senden"
        title="Feedback senden"
        data-testid="feedback-bubble"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-card/95 text-primary shadow-lg backdrop-blur transition-transform active:scale-95"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={(o) => !send.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Feedback an das Team</DialogTitle>
            <DialogDescription>
              Was fehlt, was stört, was wäre toll? {canDictate ? "Schreib es auf oder sprich es ein." : "Schreib es einfach auf."} Wir sehen, auf welcher Seite du gerade bist.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Deine Nachricht"
            rows={5}
            maxLength={2000}
            placeholder="Mir ist aufgefallen …"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {listening && (
            <p className="flex items-center gap-2 text-xs text-primary" role="status">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Ich höre zu … lass los, wenn du fertig bist.
            </p>
          )}
          <div className="flex items-center gap-2">
            {canDictate && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                className={listening ? "animate-pulse gap-1.5" : "gap-1.5"}
                aria-label="Sprechen – gedrückt halten"
                aria-pressed={listening}
                {...handlers}
              >
                <Mic className="h-4 w-4" />
                {listening ? "Loslassen = fertig" : "Halten & sprechen"}
              </Button>
            )}
            <Button
              className="ml-auto gap-1.5"
              disabled={send.isPending || text.trim().length < 3}
              onClick={() => {
                stop();
                send.mutate({ data: { text: text.trim(), page: location, voice: usedVoice } });
              }}
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Senden
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
