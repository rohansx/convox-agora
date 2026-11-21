import { Bot } from "lucide-react";
import { Empty, ErrorState, Loading } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerdictBadge } from "@/components/verdict-badge";
import { type Call, hhmm, median, openCall, pair, secs, toolCalls, turns, useCalls, verdict } from "@/lib/data";

export function CallsTable({ calls, title }: { calls: Call[]; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Newest first. Open a call to see both phones, the call card and the transcript.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Languages</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead className="hidden lg:table-cell">Summary</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Details</TableHead>
              <TableHead className="text-right">Tools</TableHead>
              <TableHead className="text-right">Delay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((c) => {
              const t = turns(c);
              return (
                <TableRow key={c.channel} className="cursor-pointer" onClick={() => openCall(c.channel)}>
                  <TableCell className="font-mono text-xs">{hhmm(c.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {pair(c)}
                    {c.ai_role && <span title="AI rider (Try it live)"><Bot className="text-muted-foreground ml-1.5 inline size-3.5" /></span>}
                  </TableCell>
                  <TableCell>{c.purpose ?? "—"}</TableCell>
                  <TableCell><VerdictBadge v={verdict(c)} /></TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md truncate lg:table-cell">
                    {c.outcome ? `${c.outcome.reason ? `${c.outcome.reason} · ` : ""}${c.outcome.summary}` : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{t.length}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{c.details.length}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{toolCalls(c).length}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{secs(median(t.map((l) => l.latency_ms)))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CallsPage() {
  const { calls, error } = useCalls();
  if (error && !calls) return <ErrorState message={error} />;
  if (!calls) return <Loading />;
  if (calls.length === 0) return <Empty title="No calls yet" hint="Start one from Try it live or New call." />;
  return <CallsTable calls={calls} title={`All calls (${calls.length})`} />;
}
