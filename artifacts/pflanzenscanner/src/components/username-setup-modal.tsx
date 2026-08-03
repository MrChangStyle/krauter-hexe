import { useState } from "react";
import { Leaf, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UsernameSetupModalProps {
  onSave: (username: string) => Promise<void>;
}

export function UsernameSetupModal({ onSave }: UsernameSetupModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const normalized = value.toUpperCase().replace(/[^A-Z]/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (normalized.length < 1 || normalized.length > 8) {
      setError("1–8 Buchstaben, bitte.");
      return;
    }
    setError(null);
    setIsPending(true);
    try {
      await onSave(normalized);
    } catch (err: unknown) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Das hat nicht geklappt. Bitte versuche einen anderen Namen.";
      setError(msg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    /* Full-screen blocking overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card shadow-xl p-8 flex flex-col items-center gap-6">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Leaf className="w-8 h-8 text-emerald-600" />
        </div>

        {/* Headline */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Willkommen, Pflanzenretter!</h2>
          <p className="text-sm text-muted-foreground leading-snug">
            Wähle deinen Ranger-Namen für die Rangliste.
            <br />
            Nur Buchstaben, max. 8 Zeichen.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <div className="relative">
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="z.B. WALDELF"
              maxLength={8}
              className="text-center text-lg font-mono uppercase tracking-widest pr-16"
              autoFocus
              disabled={isPending}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
              {normalized.length}/8
            </span>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isPending || normalized.length === 0}
            className="w-full"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Namen bestätigen"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
