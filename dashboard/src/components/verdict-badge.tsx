import { Badge } from "@/components/ui/badge";
import type { Verdict } from "@/lib/data";
import { cn } from "@/lib/utils";

const TONE: Record<Verdict, string> = {
  live: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  "follow-up": "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  unclear: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground",
};

export function VerdictBadge({ v }: { v: Verdict }) {
  return (
    <Badge className={cn("border-0 font-mono text-[11px]", TONE[v])}>
      {v === "live" && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />}
      {v}
    </Badge>
  );
}
