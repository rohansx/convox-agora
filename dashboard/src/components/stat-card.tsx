import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  hint,
  tone,
  invert,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  hint?: React.ReactNode;
  tone?: "good" | "warn" | "bad" | "none";
  /** true when a rise is bad (delay, errors) */
  invert?: boolean;
}) {
  const up = delta != null && delta > 0;
  const good = delta != null && (invert ? delta < 0 : delta > 0);
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="eyebrow font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div
          className={cn(
            "font-mono text-2xl font-bold tracking-tight tabular-nums",
            tone === "good" && "text-emerald-700 dark:text-emerald-400",
            tone === "warn" && "text-amber-700 dark:text-amber-400",
            tone === "bad" && "text-red-700 dark:text-red-400",
          )}
        >
          {value}
        </div>
        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          {delta != null && delta !== 0 && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
              {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {fmtDelta(delta)}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
