import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookUser, Loader2, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import {
  getListFarmContactsQueryKey,
  useCreateFarmContact,
  useDeleteFarmContact,
  useListFarmContacts,
  useUpdateFarmContact,
  type FarmContact,
  type FarmContactInput,
  type FarmContactKind,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CONTACT_KINDS, groupContacts, telHref } from "@/lib/contact-labels";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY: FarmContactInput = { kind: "vet", name: "", role: "", phone: "", email: "", note: "" };

function ContactDialog({ farmId, contact, onClose }: { farmId: number; contact: FarmContact | "new"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FarmContactInput>(contact === "new" ? EMPTY : { ...contact });
  const [error, setError] = useState<string | null>(null);
  const done = {
    onSuccess(list: FarmContact[]) {
      queryClient.setQueryData(getListFarmContactsQueryKey(farmId), list);
      onClose();
    },
    onError: (err: unknown) => setError(errorText(err, "Das hat nicht geklappt.")),
  };
  const create = useCreateFarmContact({ mutation: done });
  const update = useUpdateFarmContact({ mutation: done });
  const pending = create.isPending || update.isPending;
  const set = (patch: Partial<FarmContactInput>) => setDraft({ ...draft, ...patch });

  function submit(event: FormEvent) {
    event.preventDefault();
    const data = { ...draft, name: draft.name.trim() };
    if (!data.name) return setError("Bitte gib einen Namen an.");
    setError(null);
    if (contact === "new") create.mutate({ farmId, data });
    else update.mutate({ farmId, contactId: contact.id, data });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact === "new" ? "Kontakt hinzufügen" : "Kontakt bearbeiten"}</DialogTitle>
          <DialogDescription>Alle Mitglieder der Farm sehen die Kontakte, auch die Vertretung.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="contact-kind">Wer ist das?</Label>
            <select id="contact-kind" className={selectClass} value={draft.kind} onChange={(e) => set({ kind: e.target.value as FarmContactKind })}>
              {CONTACT_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" maxLength={80} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-role">Aufgabe (freiwillig)</Label>
            <Input id="contact-role" maxLength={80} placeholder="z. B. Hoftierarzt, Melkerin Mo–Fr" value={draft.role ?? ""} onChange={(e) => set({ role: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="contact-phone">Telefon</Label>
              <Input id="contact-phone" type="tel" inputMode="tel" maxLength={40} value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact-email">E-Mail</Label>
              <Input id="contact-email" type="email" inputMode="email" maxLength={200} value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-note">Notiz (freiwillig)</Label>
            <Textarea id="contact-note" rows={2} maxLength={1000} placeholder="z. B. Notdienst über die Praxisnummer" value={draft.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Farm & Team – Wichtige Kontakte: everyone reads, admins keep them. `compact` for the Übergabe page. */
export function FarmContactsCard({ farm, compact = false }: { farm: FarmSummary; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = farm.role === "admin" && !compact;
  const contacts = useListFarmContacts(farm.id);
  const [editing, setEditing] = useState<FarmContact | "new" | null>(null);
  const remove = useDeleteFarmContact({
    mutation: {
      onSuccess: (list) => queryClient.setQueryData(getListFarmContactsQueryKey(farm.id), list),
      onError: () => toast({ title: "Nicht gelöscht", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });
  const groups = groupContacts(contacts.data ?? []);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="farm-contacts">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <BookUser className="h-4 w-4 text-primary" />
          Wichtige Kontakte
        </h2>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Kontakt
          </Button>
        )}
      </div>
      {contacts.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Trag ein, wen man auf dem Hof erreichen muss: dich selbst, den Tierarzt, dein Team, die Vertretung." : "Noch keine Kontakte eingetragen."}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.kind} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h3>
            <ul className="divide-y divide-border rounded-lg border">
              {g.contacts.map((c) => (
                <li key={c.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    {c.role && <p className="truncate text-xs text-muted-foreground">{c.role}</p>}
                    {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {c.phone && (
                        <a href={telHref(c.phone)} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 truncate text-primary underline-offset-4 hover:underline">
                          <Mail className="h-3 w-3 shrink-0" />
                          {c.email}
                        </a>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <>
                      <button type="button" aria-label={`${c.name} bearbeiten`} className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${c.name} löschen`}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() => window.confirm(`${c.name} aus den Kontakten löschen?`) && remove.mutate({ farmId: farm.id, contactId: c.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {editing && <ContactDialog farmId={farm.id} contact={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
