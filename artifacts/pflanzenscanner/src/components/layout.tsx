import { Link, useLocation } from "wouter";
import { Camera, Leaf as LeafIcon, ClipboardList, Wrench, WifiOff, Users, LogOut, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScanQueue } from "@/lib/scan-queue-context";
import { useAuthContext } from "@/lib/auth-context";
import { UpdateButton } from "@/components/update-button";
import { STALE_QUEUE_WARNING_MS } from "@/lib/scan-queue";
import { useNow } from "@/hooks/use-now";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { pendingCount, isOnline, pending } = useScanQueue();
  const now = useNow();
  const hasStaleItem = pending.some((item) => now - item.createdAt > STALE_QUEUE_WARNING_MS);
  const { user, logout } = useAuthContext();

  const navItems = [
    { path: "/",          label: "Scan",     icon: Camera,        badge: 0,            prefixes: ["/"] },
    { path: "/pflanzen",  label: "Pflanzen", icon: LeafIcon,      badge: 0,            prefixes: ["/pflanzen", "/archiv", "/arten", "/pflanze/"] },
    { path: "/aufgaben",  label: "Aufgaben", icon: ClipboardList, badge: 0,            prefixes: ["/aufgaben"] },
    { path: "/werkzeug",  label: "Werkzeug", icon: Wrench,        badge: 0,            prefixes: ["/werkzeug", "/insekten-scanner", "/insekt/", "/kraeuter-hexe", "/pflanzendoc", "/pflege-guide"] },
    { path: "/benutzer",  label: "Home",     icon: Users,         badge: pendingCount, prefixes: ["/benutzer"] },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-11">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Leaf className="h-4 w-4" />
            Kräuterhexe
          </span>
          <div className="flex items-center gap-1">
            <UpdateButton />
            <button
              type="button"
              onClick={logout}
              title="Abmelden"
              aria-label="Abmelden"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </button>
          </div>
        </div>
      </header>
      {!isOnline && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-900 backdrop-blur-sm dark:text-amber-200">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Kein Empfang – Fotos werden gespeichert und später automatisch gescannt.</span>
        </div>
      )}

      <main className="flex-1 pb-24 w-full max-w-2xl mx-auto flex flex-col">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 px-4 pb-safe pt-2 md:pb-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-2xl mx-auto flex justify-between items-center h-16">
          {navItems.map((item) => {
            const isActive =
            item.prefixes.some((prefix) =>
              prefix === "/" ? location === "/" : location.startsWith(prefix),
            );
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-md" />
                )}
                <span className="relative">
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  {item.badge > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                        hasStaleItem
                          ? "bg-amber-500 text-white"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium tracking-wide leading-none text-center">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
