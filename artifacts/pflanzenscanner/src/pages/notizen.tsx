import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, LogOut, Plus, Share2, ShoppingCart, Sparkles, StickyNote, Trash2, X } from "lucide-react";
import {
  getListNoteSharesQueryKey,
  getListNotesQueryKey,
  useClearDoneNotes,
  useCreateNote,
  useDeleteNote,
  useListNoteShares,
  useListNotes,
  usePlanNotes,
  useRemoveNoteShare,
  useUpdateNote,
  type DailyNote,
  type NoteCategory,
  type NoteKind,
} from "@workspace/api-client-react";
import { DictateButton } from "@/components/dictate-button";
import { SpeakHint } from "@/components/speak-hint";
import { MAX_SAID, TOOL_FRAME, TOOL_SAVE, ToolActions, ToolCardHeader } from "@/components/tool-card";
import { errorText, useTeam } from "@/components/hof-tasks";
import { ShareListsDialog } from "@/components/share-lists-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveFarm } from "@/hooks/use-active-farm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_ORDER, groupNotes, notesNeedPlan, splitNotes, type NoteDraft } from "@/lib/daily-notes";

/**
 * /notizen – Alltagsnotizen (docs/alltagsnotizen.md): the own shopping list
 * and things to remember, and the lists others share. Speak or type freely;
 * the AI makes single notes and sorts them into the sections of the shop.
 */
export default function NotizenPage() {
  const { farm } = useActiveFarm();
  const notes = useListNotes();
  const shares = useListNoteShares();
  const team = useTeam(farm ?? ({ id: 0, role: "guest", modules: [] } as never));
  const [list, setList] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const all = notes.data ?? [];
  // My own list is the one whose notes are mine; without any, the first owner not shared with me.
  const sharedWithMe = shares.data?.sharedWithMe ?? [];
  const ownId = all.find((n) => n.isOwnList)?.listOwnerId ?? "me";
  const current = list ?? ownId;
  const isOwn = current === ownId;
  const owner = isOwn ? null : sharedWithMe.find((p) => p.userId === current);
  const shown = isOwn ? all.filter((n) => n.isOwnList) : all.filter((n) => n.listOwnerId === current);
  const groups = groupNotes(shown, null);

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Hof
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Alltagsnotizen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Einkaufsliste und was du dir merken willst – getrennt von den Hof-Aufgaben.</p>
      </div>

      {sharedWithMe.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Listen">
          {[{ userId: ownId, name: "Meine Liste" }, ...sharedWithMe.map((p) => ({ userId: p.userId, name: `Liste von ${p.name}` }))].map((p) => (
            <button
              key={p.userId}
              type="button"
              role="tab"
              aria-selected={current === p.userId}
              onClick={() => setList(p.userId)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", current === p.userId ? "border-orange-500 bg-orange-500 text-white" : "border-border bg-card")}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <QuickAdd listOwnerId={isOwn ? null : current} ownerName={owner?.name ?? null} />

      {notes.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <section className="space-y-2" aria-labelledby="notes-shopping">
            <h2 id="notes-shopping" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <ShoppingCart className="h-4 w-4" />
              Einkaufsliste {groups.shopping.length > 0 && `(${groups.shopping.reduce((n, g) => n + g.notes.length, 0)})`}
            </h2>
            {groups.shopping.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Nichts auf der Einkaufsliste.</p>
            ) : (
              groups.shopping.map((g) => (
                <div key={g.category} className="rounded-2xl border bg-card p-3">
                  <p className="mb-1 text-xs font-semibold text-orange-700 dark:text-orange-400">{CATEGORY_LABELS[g.category]}</p>
                  <ul className="divide-y">
                    {g.notes.map((n) => (
                      <NoteRow key={n.id} note={n} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
          <section className="space-y-2" aria-labelledby="notes-remember">
            <h2 id="notes-remember" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-4 w-4" />
              Merken & Erledigen {groups.remember.length > 0 && `(${groups.remember.length})`}
            </h2>
            {groups.remember.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Nichts zu merken.</p>
            ) : (
              <ul className="divide-y rounded-2xl border bg-card px-3">
                {groups.remember.map((n) => (
                  <NoteRow key={n.id} note={n} />
                ))}
              </ul>
            )}
          </section>
          {groups.done.length > 0 && <DoneSection notes={groups.done} own={isOwn} />}
        </>
      )}

      <ShareCard own={isOwn} ownerId={current} ownerName={owner?.name ?? null} onShare={() => setSharing(true)} />
      {sharing && <ShareListsDialog farm={farm} team={team} initial={{ hof: false, notes: true }} onClose={() => setSharing(false)} />}
    </div>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
}

function NoteRow({ note }: { note: DailyNote }) {
  const refresh = useRefresh();
  const { toast } = useToast();
  const fail = (err: unknown) => toast({ title: errorText(err, "Nicht gespeichert"), variant: "destructive" });
  const update = useUpdateNote({ mutation: { onSuccess: refresh, onError: fail } });
  const remove = useDeleteNote({ mutation: { onSuccess: refresh, onError: fail } });
  const fromOther = note.addedByName !== note.listOwnerName;
  return (
    <li className="flex items-center gap-3 py-2" data-testid="note">
      <button
        type="button"
        role="checkbox"
        aria-checked={note.done}
        aria-label={note.done ? `${note.text}: Haken zurücknehmen` : `${note.text} erledigt`}
        disabled={update.isPending}
        onClick={() => update.mutate({ noteId: note.id, data: { done: !note.done } })}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2",
          note.done ? "border-orange-500 bg-orange-500 text-white" : "border-muted-foreground/40",
        )}
      >
        {note.done && <Check className="h-4 w-4" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className={cn("block break-words text-sm", note.done && "text-muted-foreground line-through")}>{note.text}</span>
        {(fromOther || (note.done && note.doneByName)) && (
          <span className="block text-xs text-muted-foreground">
            {fromOther && `von ${note.addedByName}`}
            {fromOther && note.done && note.doneByName ? " · " : ""}
            {note.done && note.doneByName && `erledigt von ${note.doneByName}`}
          </span>
        )}
      </span>
      {/* Only the owner of the list deletes. */}
      {note.isOwnList && (
        <button type="button" aria-label={`${note.text} löschen`} className="p-1 text-muted-foreground" onClick={() => remove.mutate({ noteId: note.id })}>
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function DoneSection({ notes, own }: { notes: DailyNote[]; own: boolean }) {
  const refresh = useRefresh();
  const clear = useClearDoneNotes({ mutation: { onSuccess: refresh } });
  return (
    <section className="space-y-2" aria-labelledby="notes-done">
      <div className="flex items-center justify-between">
        <h2 id="notes-done" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Erledigt ({notes.length})</h2>
        {own && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={clear.isPending} onClick={() => clear.mutate()}>
            <Trash2 className="h-4 w-4" />
            Erledigte entfernen
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-2xl border bg-card px-3 opacity-80">
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} />
        ))}
      </ul>
    </section>
  );
}

const KINDS: Array<[NoteKind | "auto", string]> = [
  ["auto", "automatisch"],
  ["einkauf", "Einkaufen"],
  ["merken", "Merken"],
];

/**
 * Speak or type freely ("Ich muss Zahnbürsten kaufen, Fleisch holen und Oma
 * anrufen") – the AI makes single notes and sorts them. One plain thing goes
 * straight on the list. Without the AI the app splits the text itself.
 */
function QuickAdd({ listOwnerId, ownerName }: { listOwnerId: string | null; ownerName: string | null }) {
  const refresh = useRefresh();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ notes: NoteDraft[]; byAi: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useCreateNote();
  const plan = usePlanNotes();

  async function save(drafts: NoteDraft[]) {
    setSaving(true);
    let saved = 0;
    try {
      for (const d of drafts) {
        await create.mutateAsync({ data: { text: d.text, kind: d.kind, category: d.category, listOwnerId } });
        saved++;
      }
      setText("");
      setPreview(null);
      toast({ title: saved === 1 ? "Notiert" : `${saved} Notizen angelegt` });
    } catch (err) {
      toast({ title: errorText(err, "Nicht gespeichert"), description: saved > 0 ? `${saved} von ${drafts.length} sind gespeichert.` : undefined, variant: "destructive" });
      if (saved > 0 && preview) setPreview({ ...preview, notes: drafts.slice(saved) });
    } finally {
      setSaving(false);
      refresh();
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const said = text.trim();
    if (!said) return;
    if (!notesNeedPlan(said)) return void save([{ text: said.slice(0, 120), kind: null, category: null }]);
    try {
      const result = await plan.mutateAsync({ data: { text: said } });
      setPreview({ notes: result.notes, byAi: true });
    } catch (err) {
      const local = splitNotes(said);
      if (local.length === 0) return void toast({ title: errorText(err, "Daraus wurde keine Notiz."), variant: "destructive" });
      setPreview({ notes: local, byAi: false });
      toast({ title: "Ohne KI aufgeteilt", description: errorText(err, "Die KI ist gerade nicht erreichbar.") + " Bitte prüf die Liste." });
    }
  }

  const change = (i: number, patch: Partial<NoteDraft>) => preview && setPreview({ ...preview, notes: preview.notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const needsPlan = notesNeedPlan(text);

  return (
    <section className={cn("space-y-3 p-3.5", TOOL_FRAME)} aria-label="Neue Notiz" data-testid="notes-quick-card">
      <ToolCardHeader
        icon={<StickyNote className="h-5 w-5" />}
        title={<label htmlFor="notes-quick">{ownerName ? `Auf die Liste von ${ownerName}` : "Neue Notiz"}</label>}
        hint="Einkauf oder Merkzettel – sprechen oder tippen"
      />
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <textarea
          id="notes-quick"
          rows={text.length > 50 || text.includes("\n") ? 3 : 1}
          maxLength={MAX_SAID}
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Sprechen oder tippen, z. B. Zahnbürsten"
          className="w-full resize-none rounded-xl border border-orange-200 bg-background px-3 py-2.5 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-orange-900"
        />
        <ToolActions>
          <DictateButton value={text} onChange={(t) => { setText(t); setPreview(null); }} max={MAX_SAID} label="Notizen sprechen" big />
          <Button type="submit" className={TOOL_SAVE} disabled={saving || plan.isPending || !text.trim()}>
            {saving || plan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : needsPlan ? <Sparkles className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {plan.isPending ? "KI sortiert …" : needsPlan ? "Liste erstellen" : "Speichern"}
          </Button>
        </ToolActions>
      </form>
      <SpeakHint title="Einfach reinsprechen" tone="orange" testId="notes-speak-hint">
        <p>
          Halte „Halten & sprechen“ gedrückt, sag frei, was du brauchst, und lass los, wenn du fertig bist, z. B.: <span className="italic">„Ich muss Zahnbürsten kaufen, Fleisch holen und Oma anrufen.“</span> Die KI
          macht daraus einzelne Notizen und sortiert die Einkäufe nach Bereichen im Laden.
        </p>
      </SpeakHint>
      {preview && (
        <div className="space-y-2 rounded-xl bg-muted/60 p-2.5" data-testid="notes-preview">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {preview.byAi && <Sparkles className="h-4 w-4 text-orange-600" />}
            {preview.notes.length} {preview.notes.length === 1 ? "Notiz" : "Notizen"} {preview.byAi ? "von der KI erkannt" : "erkannt (ohne KI)"} – bitte prüfen:
          </p>
          <ul className="space-y-1.5">
            {preview.notes.map((n, i) => (
              <li key={i} className="space-y-1.5 rounded-lg bg-background p-2" data-testid="planned-note">
                <div className="flex items-center gap-1.5">
                  <Input aria-label={`Notiz ${i + 1}`} value={n.text} maxLength={120} onChange={(e) => change(i, { text: e.target.value })} className="h-8 text-sm" />
                  <button type="button" aria-label={`${n.text} entfernen`} className="p-1 text-muted-foreground" onClick={() => setPreview({ ...preview, notes: preview.notes.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <select
                    aria-label={`Art: ${n.text}`}
                    value={n.kind ?? "auto"}
                    onChange={(e) => change(i, { kind: e.target.value === "auto" ? null : (e.target.value as NoteKind), category: e.target.value === "einkauf" ? n.category : null })}
                    className="h-8 rounded-md border border-input bg-background px-1.5"
                  >
                    {KINDS.map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                  {n.kind === "einkauf" && (
                    <select
                      aria-label={`Bereich: ${n.text}`}
                      value={n.category ?? "auto"}
                      onChange={(e) => change(i, { category: e.target.value === "auto" ? null : (e.target.value as NoteCategory) })}
                      className="h-8 rounded-md border border-input bg-background px-1.5"
                    >
                      <option value="auto">Bereich automatisch</option>
                      {CATEGORY_ORDER.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)} disabled={saving}>Verwerfen</Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
              onClick={() => void save(preview.notes.filter((n) => n.text.trim().length >= 2))}
              disabled={saving || preview.notes.length === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {preview.notes.length === 1 ? "Notieren" : "Alle notieren"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Who works on the list – and for a list shared with me, the way out. */
function ShareCard({ own, ownerId, ownerName, onShare }: { own: boolean; ownerId: string; ownerName: string | null; onShare: () => void }) {
  const queryClient = useQueryClient();
  const shares = useListNoteShares();
  const remove = useRemoveNoteShare({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListNoteSharesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      },
    },
  });
  if (!own) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
        <Share2 className="h-5 w-5 shrink-0 text-orange-600" />
        <span className="flex-1">
          <span className="block font-medium">Liste von {ownerName}</span>
          <span className="block text-xs text-muted-foreground">Du kannst abhaken und hinzufügen. Löschen kann nur {ownerName}.</span>
        </span>
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={remove.isPending} onClick={() => window.confirm("Diese Liste verlassen?") && remove.mutate({ userId: ownerId })}>
          <LogOut className="h-4 w-4" />
          Verlassen
        </Button>
      </div>
    );
  }
  const people = shares.data?.sharedWith ?? [];
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
      <div className="flex items-center gap-3">
        <Share2 className="h-5 w-5 shrink-0 text-orange-600" />
        <span className="flex-1">
          <span className="block font-medium">{people.length > 0 ? `Geteilt mit ${people.map((p) => p.name).join(", ")}` : "Liste teilen"}</span>
          <span className="block text-xs text-muted-foreground">Wer mitmacht, kann abhaken und hinzufügen – löschen kannst nur du.</span>
        </span>
        <Button size="sm" variant="outline" onClick={onShare}>Teilen</Button>
      </div>
      {people.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <li key={p.userId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
              {p.name}
              <button type="button" aria-label={`Nicht mehr mit ${p.name} teilen`} onClick={() => remove.mutate({ userId: p.userId })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
