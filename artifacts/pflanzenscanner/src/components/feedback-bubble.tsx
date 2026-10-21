import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, MessageCircle, Mic, MicOff, Send } from "lucide-react";
import { useSendFeedback } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { appendPhrase, speechSupported, startDictation, type Recognition } from "@/lib/speech";

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
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const canDictate = speechSupported();
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

  const stop = () => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  };
  useEffect(() => {
    if (!open) stop();
  }, [open]);

  function dictate() {
    if (listening) return stop();
    const r = startDictation(
      (phrase) => {
        setUsedVoice(true);
        setText((t) => appendPhrase(t, phrase));
      },
      (error) => {
        rec.current = null;
        setListening(false);
        if (error === "not-allowed") toast({ title: "Kein Mikrofon", description: "Bitte erlaube den Zugriff aufs Mikrofon – oder tippe einfach.", variant: "destructive" });
      },
    );
    if (r) {
      rec.current = r;
      setListening(true);
    }
  }

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
              Ich höre zu … tippe auf das Mikrofon, wenn du fertig bist.
            </p>
          )}
          <div className="flex items-center gap-2">
            {canDictate && (
              <Button type="button" variant={listening ? "default" : "outline"} className="gap-1.5" onClick={dictate} aria-pressed={listening}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {listening ? "Stopp" : "Sprechen"}
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
