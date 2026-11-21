import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, CheckCircle2, CircleHelp, ExternalLink, MessageSquare, TriangleAlert, Wrench } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VerdictBadge } from "@/components/verdict-badge";
import { type Call, hhmm, hms, lang, median, pair, secs, toolCalls, turns, verdict } from "@/lib/data";
import { cn } from "@/lib/utils";
import { DEMO_CALLS, isDemoChannel } from "@/lib/demo";

const HIDE_ARGS = new Set(["summary_rider", "summary_customer", "value_rider", "value_customer"]);
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  awaiting: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  said: "bg-muted text-muted-foreground",
};

function useCall(id: string) {
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const sample = isDemoChannel(id) ? DEMO_CALLS.find((c) => c.channel === id) : undefined;
    if (sample) { setCall(sample); return; }
    const load = async () => {
      try {
        const r = await fetch(`/calls/${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(r.status === 404 ? "This call no longer exists." : `HTTP ${r.status}`);
        const c = (await r.json()) as Call;
        if (!alive) return;
        setCall(c);
        setError(null);
        if (!c.ended) timer = setTimeout(load, 3000); // live: keep following it
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);
  return { call, error };
}

function Outcome({ c }: { c: Call }) {
  const o = c.outcome;
  const v = verdict(c);
  if (!o) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-3 py-6">
          <MessageSquare className="size-5" />
          {v === "live" ? "The call is in progress. Convox judges it when it ends." : "No judgment was recorded for this call."}
        </CardContent>
      </Card>
    );
  }
  const follow = o.kind === "followup";
  const ok = !follow && o.status === "resolved";
  const Icon = follow ? TriangleAlert : ok ? CheckCircle2 : CircleHelp;
  return (
    <Card className={cn("border-l-4", follow ? "border-l-amber-500" : ok ? "border-l-emerald-500" : "border-l-muted-foreground/40")}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Icon className={cn("size-6", follow ? "text-amber-600" : ok ? "text-emerald-600" : "text-muted-foreground")} />
          <CardTitle className="text-xl">
            {follow ? "Not resolved: follow-up raised" : ok ? "Resolved: they reached an understanding" : "Unclear: not enough to judge"}
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-[11px]">{follow ? "create_followup" : "log_call_outcome"} → platform</Badge>
        </div>
        <CardDescription className="capitalize">Purpose: {o.purpose}{o.reason ? ` · reason: ${o.reason}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-base">{o.summary}</p>
        {o.agreed_details && o.agreed_details.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Agreed</div>
            <ul className="grid gap-1.5">
              {o.agreed_details.map((d) => (
                <li key={d} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{d}</li>
              ))}
            </ul>
          </div>
        )}
        {o.next_step && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <div className="eyebrow mb-1">Suggested next step for the platform</div>
            <p>{o.next_step}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CallDetailPage() {
  const { id = "" } = useParams();
  const { call: c, error } = useCall(id);
  if (error && !c) return <ErrorState message={error} />;
  if (!c) return <Loading />;

  const t = turns(c);
  const tools = toolCalls(c);
  const name = (role: string) => (c.ai_role === role ? `${role} (AI)` : role);
  // one time-ordered story: what was said, and what the agent did about it
  const timeline = [
    ...t.map((l) => ({ t: l.t, kind: "line" as const, l })),
    ...tools.map((e) => ({ t: e.t, kind: "tool" as const, e })),
  ].sort((a, b) => a.t - b.t);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/calls"><ArrowLeft className="size-4" /> Calls</Link></Button>
        <h1 className="text-xl font-semibold tracking-tight">{pair(c)}</h1>
        {c.ai_role && <Badge variant="outline" className="gap-1"><Bot className="size-3" /> Try it live</Badge>}
        <VerdictBadge v={verdict(c)} />
        <span className="text-muted-foreground font-mono text-xs">{hhmm(c.created_at)} · {c.channel} · {c.purpose ?? "purpose unknown"}</span>
        {!isDemoChannel(c.channel) && <Button asChild size="sm" variant="outline" className="ml-auto">
          <a href={`/call?ch=${encodeURIComponent(c.channel)}`}><ExternalLink className="size-4" /> Open live view</a>
        </Button>}
      </div>

      <Outcome c={c} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lines interpreted" value={t.length} hint={`rider ${t.filter((l) => l.speaker === "rider").length} · customer ${t.filter((l) => l.speaker === "customer").length}`} />
        <StatCard label="Translation delay p50" value={secs(median(t.map((l) => l.latency_ms)))} hint="per line" />
        <StatCard label="Details captured" value={c.details.length} hint={`${c.details.filter((d) => d.status === "confirmed").length} confirmed`} />
        <StatCard label="Agent tool calls" value={tools.length} hint={[...new Set(tools.map((e) => e.tool))].join(", ") || "none"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call card</CardTitle>
          <CardDescription>Details Convox captured, shown to each person in their own language. Critical ones are confirmed by whoever did not say them.</CardDescription>
        </CardHeader>
        <CardContent>
          {c.details.length === 0 ? <p className="text-muted-foreground text-sm">No details captured.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead><TableHead>Detail</TableHead>
                  <TableHead>Rider sees · {lang(c.people.rider.text_lang)}</TableHead>
                  <TableHead>Customer sees · {lang(c.people.customer.text_lang)}</TableHead>
                  <TableHead>Said by</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.details.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs uppercase">{d.type.replace("_", " ")}{d.critical && <span className="ml-1 text-amber-600">●</span>}</TableCell>
                    <TableCell className="font-medium whitespace-normal">{d.value}</TableCell>
                    <TableCell className="whitespace-normal">{d.value_rider}</TableCell>
                    <TableCell className="whitespace-normal">{d.value_customer}</TableCell>
                    <TableCell className="capitalize">{name(d.said_by)}</TableCell>
                    <TableCell>
                      <Badge className={cn("border-0 font-mono text-[11px]", STATUS_TONE[d.status] ?? STATUS_TONE.said)}>
                        {d.status}{d.status === "awaiting" && d.confirm_by ? ` · ${d.confirm_by}` : ""}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Every line as it was said and heard, and every action the Claude agent took, in order.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative grid gap-3 border-l pl-5">
            {timeline.map((x, i) => x.kind === "line" ? (
              <li key={i} className="relative">
                <span className={cn("absolute -left-[26px] top-1.5 size-3 rounded-full border-2 border-background",
                  x.l.speaker === "rider" ? "bg-orange-500" : "bg-indigo-500")} />
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="font-mono">{hms(x.l.t)}</span>
                  <span className="capitalize font-medium text-foreground">{name(x.l.speaker)}</span>
                  <span>· {lang(c.people[x.l.speaker as "rider" | "customer"].speak_lang)}</span>
                  {x.l.latency_ms > 0 && <span className="font-mono">· {secs(x.l.latency_ms)}</span>}
                </div>
                <p className="mt-0.5">{x.l.text}</p>
                <p className="text-muted-foreground">→ {x.l.translation || "…"}</p>
              </li>
            ) : (
              <li key={i} className="relative">
                <span className="bg-primary absolute -left-[27px] top-1 grid size-3.5 place-items-center rounded-sm border-2 border-background" />
                <div className="bg-muted/60 rounded-lg px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Wrench className="size-3.5" />
                    <Badge variant="secondary" className="font-mono text-[11px]">{x.e.tool}</Badge>
                    <span className="font-medium">{x.e.text}</span>
                    <span className="text-muted-foreground ml-auto font-mono text-xs">{hms(x.e.t)}</span>
                  </div>
                  {x.e.args && (
                    <div className="text-muted-foreground mt-1 font-mono text-xs break-words">
                      {Object.entries(x.e.args).filter(([k]) => !HIDE_ARGS.has(k))
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("  ·  ")}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
