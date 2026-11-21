import { Empty, ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hhmm, lang, openCall, pair, useCalls } from "@/lib/data";

export function FollowupsPage() {
  const { calls, error } = useCalls();
  if (error && !calls) return <ErrorState message={error} />;
  if (!calls) return <Loading />;
  const fus = calls.filter((c) => c.outcome?.kind === "followup");
  if (fus.length === 0) return <Empty title="No follow-ups" hint="Every judged call reached an understanding." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {fus.map((c) => {
        const o = c.outcome!;
        return (
          <Card key={c.channel} className="cursor-pointer border-l-4 border-l-amber-500" onClick={() => openCall(c.channel)}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="capitalize">{o.purpose}</CardTitle>
                <Badge variant="outline" className="font-mono text-[11px]">{hhmm(c.created_at)} · {pair(c)}</Badge>
              </div>
              <CardDescription>{o.reason}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>{o.summary}</p>
              <div className="bg-muted/60 grid gap-2 rounded-lg p-3">
                <p><span className="eyebrow mr-2">Rider · {lang(c.people.rider.text_lang)}</span>{o.summary_rider}</p>
                <p><span className="eyebrow mr-2">Customer · {lang(c.people.customer.text_lang)}</span>{o.summary_customer}</p>
              </div>
              <p><span className="font-medium">Next step: </span>{o.next_step}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
