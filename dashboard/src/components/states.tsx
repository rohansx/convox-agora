import { AlertTriangle, Database, Inbox } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-14 text-center">
        <Inbox className="size-6" />
        <div className="text-foreground font-medium">{title}</div>
        {hint && <div className="text-sm">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function NoStore() {
  return (
    <Alert>
      <Database className="size-4" />
      <AlertTitle>No database configured</AlertTitle>
      <AlertDescription>Set DATABASE_URL and run `make migrate`; the dashboard reads from the store.</AlertDescription>
    </Alert>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>Could not load</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function Alerts({ alerts }: { alerts: string[] }) {
  if (!alerts.length) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
      <AlertTriangle className="size-4" />
      <AlertTitle>Needs attention</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {alerts.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
