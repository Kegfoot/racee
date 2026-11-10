"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import { useLeague } from "@/app/context/LeagueContext";
import { orpc } from "@/lib/orpc/client";
import { RequireUser } from "@/components/RequireUser";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import { PickInput, KIND_LABEL, type QuestionKind } from "@/components/season-props/SeasonPropInputs";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** A player's year-long picks: answered once at the start of the season. */
export default function SeasonPicksPage() {
  const { user } = useUser();
  const { activeLeagueId } = useLeague();
  const query = useQuery(
    orpc.seasonProps.get.queryOptions({ input: { leagueId: activeLeagueId ?? "" }, enabled: !!user && !!activeLeagueId }),
  );
  const data = query.data;

  return (
    <PageShell title="Season picks">
      <Link href="/predict" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ChevronLeft className="size-3.5" />
        Predict
      </Link>
      <RequireUser>
        {!activeLeagueId ? (
          <p className="text-sm text-muted-foreground">Pick a league first.</p>
        ) : query.isPending ? (
          <QueryLoading />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={() => query.refetch()} />
        ) : !data!.enabled || !data!.open ? (
          <p className="text-sm text-muted-foreground">This league isn&apos;t playing season bets right now.</p>
        ) : (
          <PickForm key={activeLeagueId} leagueId={activeLeagueId} data={data!} />
        )}
      </RequireUser>
    </PageShell>
  );
}

type ViewData = NonNullable<Awaited<ReturnType<typeof orpc.seasonProps.get.call>>>;

function PickForm({ leagueId, data }: { leagueId: string; data: ViewData }) {
  const queryClient = useQueryClient();
  const [picks, setPicks] = useState<Record<string, string>>(data.myPicks);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = useMutation(
    orpc.seasonProps.submitPicks.mutationOptions({
      onSuccess: () => {
        setError(null);
        setSaved(true);
        queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() });
      },
      onError: (e) => setError(errorMessage(e, "Couldn't save your picks.")),
    }),
  );

  const answered = data.questions.filter((q) => (picks[q.questionId] ?? "").trim() !== "").length;

  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-border bg-subtle px-4 py-3 text-sm space-y-1">
        <p>
          Year-long bets: answer once, then watch them play out over the season.
          {data.locksAt && !data.locked && ` Picks lock on ${new Date(`${data.locksAt}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`}
        </p>
        {data.locked && !data.canPick && <p className="text-muted-foreground">Picks are locked.</p>}
        {data.pointsReveal !== "always" && !data.pointsRevealed && (
          <p className="text-xs text-muted-foreground">The bonus points are hidden in the standings until later in the season.</p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {data.questions.map((q) => (
          <Card key={q.questionId}>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm font-semibold">{q.prompt}</p>
              <p className="text-[11px] text-muted-foreground">
                {KIND_LABEL[q.kind as QuestionKind]}
                {q.kind === "number" && (q.numberMode === "closest" ? " · closest guess wins" : " · must be exact")}
                {q.scoring === "flat" && ` · worth ${[q.flatDriverPoints ? `${q.flatDriverPoints} (drivers)` : "", q.flatTeamPoints ? `${q.flatTeamPoints} (teams)` : ""].filter(Boolean).join(" + ") || "0"}`}
              </p>
              <PickInput
                kind={q.kind as QuestionKind}
                options={q.options}
                grid={data.grid}
                value={picks[q.questionId] ?? ""}
                disabled={!data.canPick}
                onChange={(v) => { setSaved(false); setPicks({ ...picks, [q.questionId]: v }); }}
              />
              {q.answerState === "answered" && (
                <p className="text-xs text-muted-foreground">Answer: <span className="text-foreground">{q.correctAnswers.join(", ")}</span></p>
              )}
              {q.answerState === "voided" && <p className="text-xs text-muted-foreground">Thrown out.</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.canPick && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => submit.mutate({ leagueId, picks })} disabled={submit.isPending}>
            {submit.isPending && <Spinner className="w-3 h-3 mr-1" />}
            Save my picks
          </Button>
          <span className="text-xs text-muted-foreground">
            {saved ? "Saved." : `${answered} of ${data.questions.length} answered. You can change them until picks lock.`}
          </span>
        </div>
      )}

      {data.everyone && data.everyone.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Everyone&apos;s picks</h2>
          {data.everyone.map((p) => (
            <Card key={p.userId}>
              <CardContent className="space-y-1 pt-6 text-sm">
                <p className="font-semibold">
                  {p.name}
                  {p.result && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {p.result.driverPoints} pts{p.result.teamPoints > 0 ? ` · ${p.result.teamPoints} for their team` : ""}
                    </span>
                  )}
                </p>
                {data.questions.map((q) => (
                  <p key={q.questionId} className="text-xs text-muted-foreground">
                    {q.prompt}: <span className="text-foreground">{p.picks[q.questionId] ?? "no pick"}</span>
                    {p.result?.byQuestion[q.questionId] === true && " ✓"}
                    {p.result?.byQuestion[q.questionId] === false && " ✗"}
                  </p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
