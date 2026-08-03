import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Stethoscope,
  Camera,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Trophy,
  Leaf,
  Sprout,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  BookHeart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { downscaleFile } from "@/lib/image";
import {
  useCheckPlantHealth,
  useCreateCareGuide,
  type PlantHealthResult,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type PageState = "idle" | "preparing" | "analyzing" | "result" | "error";

function HealthScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-500"
      : score >= 40
        ? "bg-amber-400"
        : "bg-red-500";

  const label =
    score === 100
      ? "Vollkommen gesund"
      : score >= 80
        ? "Gut – kleine Mängel"
        : score >= 60
          ? "Leichte Probleme"
          : score >= 40
            ? "Deutliche Schäden"
            : score >= 20
              ? "Schwer befallen"
              : "Sehr krank";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-bold text-foreground">{score}/100</span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function RemedyCard({ remedy }: { remedy: PlantHealthResult["hausmittel"][number] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Leaf className="w-4 h-4 text-primary shrink-0" />
            {remedy.name}
          </CardTitle>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {remedy.zutaten.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Zutaten
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {remedy.zutaten.map((z: string, i: number) => (
                  <li key={i} className="text-sm text-foreground">
                    {z}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {remedy.anleitung && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Anleitung
              </p>
              <p className="text-sm text-foreground leading-relaxed">{remedy.anleitung}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function PflanzendocPage() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PageState>("idle");
  const [result, setResult] = useState<PlantHealthResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [guideCreating, setGuideCreating] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  const { mutate: analyzeHealth } = useCheckPlantHealth();
  const { mutate: createGuide } = useCreateCareGuide();

  const reset = () => {
    setState("idle");
    setResult(null);
    setErrorMsg(null);
    setPreviewUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("preparing");
    setErrorMsg(null);
    setResult(null);

    void (async () => {
      let image: string;
      try {
        image = await downscaleFile(file);
      } catch {
        setState("error");
        setErrorMsg("Fehler beim Lesen des Bildes. Bitte versuche es erneut.");
        return;
      }

      setPreviewUrl(image);
      setState("analyzing");

      analyzeHealth(
        { data: { image } },
        {
          onSuccess: (data: PlantHealthResult) => {
            setResult(data);
            setState("result");
          },
          onError: (err: unknown) => {
            const status = (err as { status?: number } | null)?.status;
            if (status === 503) {
              setErrorMsg(
                "Die KI-Analyse ist gerade nicht verfügbar. Bitte stelle sicher, dass der Gemini-API-Key eingerichtet ist, und versuche es erneut.",
              );
            } else {
              setErrorMsg(
                "Die Analyse ist fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es erneut.",
              );
            }
            setState("error");
          },
        },
      );
    })();
  };

  const openCamera = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.setAttribute("capture", "environment");
    fileInputRef.current.click();
  };

  const openGallery = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.removeAttribute("capture");
    fileInputRef.current.click();
  };

  const isHealthy = result?.gesundheits_score === 100;

  return (
    <div className="flex flex-col items-center p-6 space-y-6 animate-in fade-in duration-500 min-h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="text-center space-y-2 mt-8 w-full">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Stethoscope className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-serif text-foreground">Pflanzendoc</h1>
        <p className="text-muted-foreground max-w-sm mx-auto text-sm">
          Fotografiere deine Pflanze und erhalte sofort eine Gesundheitsdiagnose
          mit biologischen Hausmitteln.
        </p>
      </div>

      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {/* Idle: show capture buttons */}
      {state === "idle" && (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <Button
            size="lg"
            className="w-full h-16 rounded-2xl text-lg shadow-lg hover:shadow-xl transition-all"
            onClick={openCamera}
          >
            <Camera className="w-6 h-6 mr-2" />
            Pflanze fotografieren
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full h-16 rounded-2xl text-lg"
            onClick={openGallery}
          >
            <ImageIcon className="w-6 h-6 mr-2" />
            Aus Galerie wählen
          </Button>
        </div>
      )}

      {/* Preparing / Analyzing: spinner */}
      {(state === "preparing" || state === "analyzing") && (
        <div className="flex flex-col items-center gap-3 text-muted-foreground animate-in fade-in">
          {previewUrl && (
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg aspect-[4/3] bg-black/5">
              <img
                src={previewUrl}
                alt="Zu analysierende Pflanze"
                className="object-cover w-full h-full"
              />
            </div>
          )}
          <Loader2 className="w-8 h-8 animate-spin text-primary mt-2" />
          <p className="text-sm">
            {state === "preparing" ? "Foto wird vorbereitet…" : "Pflanze wird untersucht…"}
          </p>
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3 animate-in slide-in-from-bottom-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{errorMsg}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={reset}>
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Result */}
      {state === "result" && result && (
        <div className="w-full max-w-sm space-y-4 pb-4 animate-in slide-in-from-bottom-4">
          {/* Photo thumbnail */}
          {previewUrl && (
            <div className="w-full rounded-2xl overflow-hidden shadow-lg aspect-[4/3] bg-black/5">
              <img
                src={previewUrl}
                alt={result.pflanzen_name}
                className="object-cover w-full h-full"
              />
            </div>
          )}

          {/* Plant name */}
          <p className="text-center text-sm font-medium text-muted-foreground italic">
            {result.pflanzen_name}
          </p>

          {/* Score = 100: success card */}
          {isHealthy ? (
            <Card className="border-green-500/40 bg-green-500/10 shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 py-6">
                <Trophy className="w-12 h-12 text-green-600" />
                <div className="text-center space-y-1">
                  <p className="text-lg font-serif font-semibold text-green-700 dark:text-green-400">
                    Kerngesund! 🌿
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Deine Pflanze sieht ausgezeichnet aus – keine Symptome erkennbar.
                  </p>
                </div>
                <Badge className="bg-green-500 text-white border-none text-base px-4 py-1">
                  100 / 100
                </Badge>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Health score bar */}
              <Card className="border border-border shadow-sm">
                <CardContent className="py-4 px-4">
                  <HealthScoreBar score={result.gesundheits_score} />
                </CardContent>
              </Card>

              {/* Symptoms */}
              {result.symptome.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Erkannte Symptome
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.symptome.map((s, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-sm px-3 py-1 rounded-full"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Hausmittel */}
              {result.hausmittel.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Biologische Hausmittel
                  </p>
                  <div className="space-y-2">
                    {result.hausmittel.map((remedy, i) => (
                      <RemedyCard key={i} remedy={remedy} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Fertilizer recommendations — always shown */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Düngeempfehlung
            </p>
            <Card className="border border-border shadow-sm">
              <CardContent className="py-3 px-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Sprout className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                      Biologisch
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {result.duenge_biologisch}
                    </p>
                  </div>
                </div>
                <div className="border-t border-border" />
                <div className="flex items-start gap-3">
                  <FlaskConical className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      Mineralisch
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {result.duenge_chemisch}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Care guide button */}
          <div className="pt-1 space-y-2">
            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                if (!result) return;
                setGuideCreating(true);
                setGuideError(null);
                createGuide(
                  {
                    data: {
                      plantName: result.pflanzen_name,
                      imageDay1: previewUrl ?? undefined,
                      healthScore: result.gesundheits_score,
                      symptoms: result.symptome,
                      duengeBiologisch: result.duenge_biologisch,
                      duegeChemisch: result.duenge_chemisch,
                    },
                  },
                  {
                    onSuccess: (guide) => {
                      setGuideCreating(false);
                      setLocation(`/pflege-guide/${guide.id}`);
                    },
                    onError: () => {
                      setGuideCreating(false);
                      setGuideError(
                        "Pflege-Guide konnte nicht erstellt werden. Bitte versuche es erneut.",
                      );
                    },
                  },
                );
              }}
              disabled={guideCreating}
            >
              {guideCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guide wird erstellt…
                </>
              ) : (
                <>
                  <BookHeart className="w-4 h-4" />
                  Erstelle einen Pflegeguide für die Pflanze
                </>
              )}
            </Button>
            {guideError && (
              <p className="text-xs text-destructive text-center">{guideError}</p>
            )}
          </div>

          <Button variant="outline" className="w-full" onClick={reset}>
            <Camera className="w-4 h-4 mr-2" />
            Neue Diagnose
          </Button>
        </div>
      )}
    </div>
  );
}
