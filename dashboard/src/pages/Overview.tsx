import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { StatCard } from "@/components/stat-card";
import { Empty, ErrorState, Loading } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CallsTable } from "@/pages/Calls";
import { median, pair, secs, toolCalls, turns, useCalls, verdict, type Verdict } from "@/lib/data";

const VERDICT_COLOR: Record<Verdict, string> = {
  resolved: "var(--chart-3)", "follow-up": "var(--chart-4)", unclear: "var(--chart-5)",
  live: "var(--chart-2)", ended: "var(--chart-5)",
};
const verdictConfig = {
  calls: { label: "Calls" }, resolved: { label: "Resolved" }, "follow-up": { label: "Follow-up" },
  unclear: { label: "Unclear" }, live: { label: "Live" }, ended: { label: "Ended" },
} satisfies ChartConfig;
const delayConfig = { ms: { label: "Delay (ms)", color: "var(--chart-2)" } } satisfies ChartConfig;
const toolConfig = { n: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const pairConfig = { calls: { label: "Calls", color: "var(--chart-2)" } } satisfies ChartConfig;

export function OverviewPage() {
  const { calls, error } = useCalls();
  if (error && !calls) return <ErrorState message={error} />;
  if (!calls) return <Loading />;
  if (calls.length === 0) return <Empty title="No calls yet" hint="Start one from Try it live or New call." />;

  const judged = calls.filter((c) => c.outcome);
  const count = (v: Verdict) => calls.filter((c) => verdict(c) === v).length;
  const resolved = count("resolved");
  const lines = calls.flatMap(turns);
  const tools = calls.flatMap(toolCalls);
  const nums = lines.filter((l) => /\d/.test(l.text)).length;

  const verdicts = (["resolved", "follow-up", "unclear", "live"] as Verdict[])
    .map((v) => ({ verdict: v, calls: count(v), fill: VERDICT_COLOR[v] }))
    .filter((d) => d.calls > 0);
  const delays = [...lines].sort((a, b) => a.t - b.t).slice(-40)
    .map((l, i) => ({ i: i + 1, ms: l.latency_ms })).filter((d) => d.ms > 0);
  const byTool = Object.entries(tools.reduce<Record<string, number>>((m, e) => ({ ...m, [e.tool!]: (m[e.tool!] ?? 0) + 1 }), {}))
    .map(([tool, n]) => ({ tool, n })).sort((a, b) => b.n - a.n);
  const byPair = Object.entries(calls.reduce<Record<string, number>>((m, c) => ({ ...m, [pair(c)]: (m[pair(c)] ?? 0) + 1 }), {}))
    .map(([name, calls]) => ({ name, calls })).sort((a, b) => b.calls - a.calls).slice(0, 6);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Calls" value={calls.length} hint={`${count("live")} live now`} />
        <StatCard label="Resolved" value={judged.length ? `${Math.round((100 * resolved) / judged.length)}%` : "—"} tone={resolved ? "good" : "none"} hint={`${resolved} of ${judged.length} judged`} />
        <StatCard label="Follow-ups raised" value={count("follow-up")} tone={count("follow-up") ? "warn" : "none"} hint="sent to the platform" />
        <StatCard label="Translation delay p50" value={secs(median(lines.map((l) => l.latency_ms)))} hint={`${lines.length} lines interpreted`} />
        <StatCard label="Details captured" value={calls.reduce((n, c) => n + c.details.length, 0)} hint={`${calls.reduce((n, c) => n + c.details.filter((d) => d.status === "confirmed").length, 0)} confirmed`} />
        <StatCard label="Agent tool calls" value={tools.length} hint={`${nums} lines carried numbers`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Call outcomes</CardTitle>
            <CardDescription>What Convox judged at the end of each call</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={verdictConfig} className="mx-auto h-[220px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="verdict" hideLabel />} />
                <Pie data={verdicts} dataKey="calls" nameKey="verdict" innerRadius={55} strokeWidth={4}>
                  {verdicts.map((d) => <Cell key={d.verdict} fill={d.fill} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
              {verdicts.map((d) => (
                <span key={d.verdict} className="text-muted-foreground inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: d.fill }} />{d.verdict} <b className="text-foreground tabular-nums">{d.calls}</b>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Translation delay per line</CardTitle>
            <CardDescription>Last 40 lines: speech recognised → translated, number-checked, ready to speak</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={delayConfig} className="h-[240px] w-full">
              <LineChart data={delays} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="i" tickLine={false} axisLine={false} />
                <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(1)}s`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="ms" type="monotone" stroke="var(--color-ms)" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agent tool calls</CardTitle>
            <CardDescription>Claude's actions, by tool</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={toolConfig} className="h-[200px] w-full">
              <BarChart data={byTool} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="tool" width={120} tickLine={false} axisLine={false} className="font-mono" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="n" fill="var(--color-n)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Calls by language pair</CardTitle>
            <CardDescription>Rider ⇄ customer</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pairConfig} className="h-[200px] w-full">
              <BarChart data={byPair} margin={{ left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <CallsTable calls={calls.slice(0, 6)} title="Recent calls" />
    </>
  );
}
