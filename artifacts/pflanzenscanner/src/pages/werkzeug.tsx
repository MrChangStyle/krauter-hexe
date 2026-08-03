import { Link } from "wouter";
import { Sparkles, Stethoscope, Bug } from "lucide-react";

const activeTools = [
  {
    path: "/kraeuter-hexe",
    icon: Sparkles,
    label: "Kräuter-Hexe",
    description:
      "Frag die Kräuterhexe nach Heilpflanzen, Wirkungen und Rezepten – dein persönlicher Kräuter­ratgeber.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-200 dark:border-violet-800",
  },
  {
    path: "/pflanzendoc",
    icon: Stethoscope,
    label: "Pflanzendoc",
    description:
      "Beschreibe Symptome und erfahre, welche Pflanzen helfen können – der botanische Gesundheits­berater.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  {
    path: "/insekten-scanner",
    icon: Bug,
    label: "Insekten Scanner",
    description:
      "Fotografiere ein Insekt und erfahre, ob es ein Schädling oder Nützling ist – mit Bestimmungs­daten und Bekämpfungs­tipps.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
  },
];

const comingSoonTools: typeof activeTools = [];

export default function WerkzeugPage() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Werkzeug</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interaktive Helfer rund um Heilpflanzen und Naturmedizin.
        </p>
      </div>

      <div className="space-y-4">
        {activeTools.map(({ path, icon: Icon, label, description, color, bg, border }) => (
          <Link
            key={path}
            href={path}
            className={`block rounded-2xl border p-5 transition-all hover:shadow-md active:scale-[0.98] ${bg} ${border}`}
          >
            <div className="flex items-start gap-4">
              <div className={`mt-0.5 shrink-0 ${color}`}>
                <Icon className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className={`font-semibold text-base ${color}`}>{label}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-snug">
                  {description}
                </p>
              </div>
            </div>
          </Link>
        ))}

        {comingSoonTools.map(({ icon: Icon, label, color, bg, border }) => (
          <div
            key={label}
            className={`rounded-2xl border p-5 opacity-60 ${bg} ${border}`}
          >
            <div className="flex items-start gap-4">
              <div className={`mt-0.5 shrink-0 ${color}`}>
                <Icon className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className={`font-semibold text-base ${color}`}>{label}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-snug italic">
                  Derzeit im Aufbau.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
