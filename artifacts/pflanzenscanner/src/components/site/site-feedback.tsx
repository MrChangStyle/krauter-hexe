import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Kind = "idea" | "problem";

/**
 * Feedback on the homepage (docs/feedback.md): a speech bubble bottom right.
 * Visitors – with or without an account – send an idea or report a problem,
 * optionally with an e-mail address for a reply. It lands in Verwaltung →
 * Feedback. The hidden "website" field catches bots.
 */
export function SiteFeedback() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function reset(next: boolean) {
    setOpen(next);
    if (!next && state === "sent") {
      setState("idle");
      setText("");
      setContact("");
    }
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch(`${BASE}/api/feedback/site`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind, page: location, contact: contact.trim() || null, website: trap }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Das hat nicht geklappt. Bitte versuch es gleich noch einmal.");
      }
      setState("sent");
    } catch (err) {
      setState("idle");
      setError((err as Error).message);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => reset(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Feedback geben"
        data-testid="site-feedback-bubble"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {state === "sent" ? (
            <div className="space-y-3 py-4 text-center" role="status">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <DialogTitle>Danke für deine Nachricht!</DialogTitle>
              <DialogDescription>{contact.trim() ? "Wir melden uns per E-Mail, wenn wir Fragen haben oder es eine Lösung gibt." : "Sie ist beim Little-Farming-Team angekommen."}</DialogDescription>
              <Button onClick={() => reset(false)}>Schließen</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Feedback an das Team</DialogTitle>
                <DialogDescription>Was können wir besser machen? Oder klappt etwas nicht? Wir lesen jede Nachricht.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Art der Nachricht">
                {(
                  [
                    ["idea", Lightbulb, "Idee / Vorschlag"],
                    ["problem", AlertTriangle, "Problem melden"],
                  ] as const
                ).map(([k, Icon, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${kind === k ? "border-primary bg-primary/10 font-medium text-primary" : "hover:border-primary"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sf-text">{kind === "problem" ? "Was ist passiert?" : "Deine Idee"}</Label>
                <Textarea
                  id="sf-text"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={kind === "problem" ? "Was wolltest du tun, und was ist stattdessen passiert? Welches Gerät und welcher Browser?" : "z. B. ein Modul für Fische im Teich, eine Erinnerung für …"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sf-contact">E-Mail für eine Antwort (optional)</Label>
                <Input id="sf-contact" type="email" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="du@beispiel.de" autoComplete="email" />
              </div>
              {/* Honeypot: invisible for people, bots fill it in. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="sf-website">Website</label>
                <input id="sf-website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Wir speichern deine Nachricht, die Seite und – wenn angegeben – deine E-Mail-Adresse, höchstens ein Jahr.{" "}
                <a href={legalHref(LEGAL_PATHS.datenschutz)} className="underline underline-offset-2">
                  Datenschutz
                </a>
              </p>
              <Button type="submit" className="w-full gap-2" disabled={state === "sending" || text.trim().length < 3}>
                {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Senden
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
