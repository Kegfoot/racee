import { TrophyIcon } from "lucide-react";

/** Stands in for the standings while the commissioner finishes grading the season. */
export function FinalePendingSplash() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-6 text-center">
      <TrophyIcon className="h-12 w-12 text-primary" />
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Final results</p>
      <h2 className="text-3xl font-bold uppercase tracking-wide">Pending</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        The last race has started. Once the admins and your commissioner finish grading, the finale unlocks and the final standings are revealed.
      </p>
    </div>
  );
}
