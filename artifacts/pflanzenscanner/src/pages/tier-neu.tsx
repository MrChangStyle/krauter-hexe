import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { useActiveFarm } from "@/hooks/use-active-farm";

/** /farm/tier/neu – "Tier bestimmen" from the scan menu: the new-animal form of the active farm. */
export default function TierNeuPage() {
  const { farm, failed } = useActiveFarm();
  if (failed) return <Redirect to="/farm" replace />;
  if (!farm) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />;
  // Guests cannot add animals; they land on the farm instead.
  return <Redirect to={farm.role === "guest" ? "/farm" : `/farm/${farm.id}/tier/neu`} replace />;
}
