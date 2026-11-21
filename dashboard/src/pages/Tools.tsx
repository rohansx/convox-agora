import { Empty, ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hms, openCall, toolCalls, useCalls } from "@/lib/data";

const HIDE = new Set(["summary_rider", "summary_customer"]);

export function ToolsPage() {
  const { calls, error } = useCalls();
  if (error && !calls) return <ErrorState message={error} />;
  if (!calls) return <Loading />;
  const rows = calls.flatMap((c) => toolCalls(c).map((e) => ({ ...e, ch: c.channel }))).sort((a, b) => b.t - a.t);
  if (rows.length === 0) return <Empty title="No tool calls yet" hint="They appear as calls happen." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool calls ({rows.length})</CardTitle>
        <CardDescription>Every action the Claude agent took, across all calls: capture_detail, confirm_detail, log_call_outcome, create_followup.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Call</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead className="hidden xl:table-cell">Arguments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 300).map((e, i) => (
              <TableRow key={`${e.ch}-${e.t}-${i}`} className="cursor-pointer" onClick={() => openCall(e.ch)}>
                <TableCell className="font-mono text-xs">{hms(e.t)}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{e.ch}</TableCell>
                <TableCell><Badge variant="secondary" className="font-mono text-[11px]">{e.tool}</Badge></TableCell>
                <TableCell className="max-w-sm whitespace-normal">{e.text}</TableCell>
                <TableCell className="text-muted-foreground hidden max-w-lg font-mono text-xs whitespace-normal xl:table-cell">
                  {e.args && Object.entries(e.args).filter(([k]) => !HIDE.has(k))
                    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
