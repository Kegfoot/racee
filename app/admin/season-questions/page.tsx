"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { orpc } from "@/lib/orpc/client";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnswerEditor, KIND_LABEL, parseOptions, type QuestionKind } from "@/components/season-props/SeasonPropInputs";

type LibraryQuestion = {
  questionId: string;
  motorsportSeasonId: string | null;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  answers: string[];
  voided: boolean;
};

const ANY_SEASON = "__any__";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Admin → Season questions: year-long prop bets that leagues can pick from when
 * they set up a season. Build the questions here, then at the end of the season
 * enter the correct answers; every league using a question is graded from them.
 */
export default function AdminSeasonQuestionsPage() {
  const queryClient = useQueryClient();
  const motorsportsQuery = useQuery(orpc.motorsports.list.queryOptions());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const motorsportId = pickedId ?? motorsportsQuery.data?.[0]?.id ?? null;
  const input = { motorsportId: motorsportId ?? "" };
  const libraryQuery = useQuery(orpc.seasonProps.library.get.queryOptions({ input, enabled: !!motorsportId }));
  const seasonsQuery = useQuery(orpc.motorsports.seasons.queryOptions({ input, enabled: !!motorsportId }));
  const [draft, setDraft] = useState<LibraryQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation(
    orpc.seasonProps.library.save.mutationOptions({
      onSuccess: () => {
        setError(null);
        setSaved(true);
        setDraft(null);
        queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() });
        queryClient.invalidateQueries({ queryKey: orpc.standings.key() });
        queryClient.invalidateQueries({ queryKey: orpc.history.key() });
      },
      onError: (e) => setError(errorMessage(e, "Couldn't save the questions.")),
    }),
  );

  const stored = libraryQuery.data;
  const questions: LibraryQuestion[] = draft ?? (stored?.questions as LibraryQuestion[] | undefined) ?? [];
  const grid = stored?.grid ?? { drivers: [], teams: [] };
  const seasons = seasonsQuery.data?.seasons ?? [];

  const edit = (id: string, patch: Partial<LibraryQuestion>) => {
    setSaved(false);
    setDraft(questions.map((q) => (q.questionId === id ? { ...q, ...patch } : q)));
  };
  const add = () => {
    setSaved(false);
    setDraft([
      ...questions,
      { questionId: crypto.randomUUID(), motorsportSeasonId: seasons[seasons.length - 1]?.seasonId ?? null, prompt: "", kind: "choice", options: [], answers: [], voided: false },
    ]);
  };
  const remove = (id: string) => {
    setSaved(false);
    setDraft(questions.filter((q) => q.questionId !== id));
  };
  const blank = questions.some((q) => !q.prompt.trim());

  return (
    <PageShell title="Season questions">
      <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        ← Admin
      </Link>
      <p className="text-sm text-muted-foreground">
        Year-long prop bets that commissioners can pick from when they set up a season, like &quot;Who finishes 4th in the
        Constructors&apos; Cup?&quot; Players answer them at the start of the year. At the end of the season, set the correct
        answer here and every league using the question is graded automatically. Changing an answer later regrades them all.
      </p>

      {(motorsportsQuery.data?.length ?? 0) > 1 && (
        <div className="flex flex-wrap gap-2">
          {motorsportsQuery.data?.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={m.id === motorsportId ? "default" : "outline"}
              onClick={() => {
                setPickedId(m.id);
                setDraft(null);
              }}
            >
              {m.name}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
          </AlertDescription>
        </Alert>
      )}

      {libraryQuery.isPending ? (
        <QueryLoading />
      ) : libraryQuery.isError ? (
        <QueryError error={libraryQuery.error} onRetry={() => libraryQuery.refetch()} />
      ) : (
        <div className="space-y-4">
          {questions.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
          {questions.map((q) => (
            <Card key={q.questionId}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex gap-2">
                  <Input
                    value={q.prompt}
                    maxLength={200}
                    placeholder="Question, e.g. Which driver won't have a seat by the end of the season?"
                    onChange={(e) => edit(q.questionId, { prompt: e.target.value })}
                  />
                  <Button variant="ghost" size="icon" aria-label="Delete question" onClick={() => remove(q.questionId)}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Select
                    value={q.kind}
                    onValueChange={(kind) => edit(q.questionId, { kind: kind as QuestionKind, answers: [], options: kind === "choice" ? q.options : [] })}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={q.motorsportSeasonId ?? ANY_SEASON}
                    onValueChange={(v) => edit(q.questionId, { motorsportSeasonId: v === ANY_SEASON ? null : v })}
                  >
                    <SelectTrigger size="sm" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_SEASON}>Any season</SelectItem>
                      {seasons.map((s) => (
                        <SelectItem key={s.seasonId} value={s.seasonId}>
                          {s.label} season
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {q.kind === "choice" && (
                  <Input
                    defaultValue={q.options.join(", ")}
                    placeholder="Answer options, separated by commas (e.g. Lando, Oscar)"
                    onBlur={(e) => edit(q.questionId, { options: parseOptions(e.target.value), answers: q.answers.filter((a) => parseOptions(e.target.value).includes(a)) })}
                  />
                )}
                {(q.kind === "driver" || q.kind === "team") && (
                  <p className="text-xs text-muted-foreground">
                    Players choose from the season&apos;s {q.kind === "driver" ? "drivers" : "teams"} (from Admin → Drivers).
                  </p>
                )}
                <div className="space-y-1.5 rounded-sm border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Correct answer</p>
                  {q.voided ? (
                    <p className="text-xs text-muted-foreground">Thrown out: nobody scores this question.</p>
                  ) : (
                    <AnswerEditor kind={q.kind} options={q.options} grid={grid} answers={q.answers} onChange={(answers) => edit(q.questionId, { answers })} />
                  )}
                  {q.answers.length === 0 && !q.voided && (
                    <p className="text-[10px] text-muted-foreground">Not answered yet. Leagues wait until you set it.</p>
                  )}
                  <label className="flex items-center gap-2 text-xs pt-1">
                    <Switch size="sm" checked={q.voided} onCheckedChange={(voided) => edit(q.questionId, { voided })} />
                    Throw this question out (for example, nobody lost their seat)
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={add}>
              <PlusIcon className="size-3.5 mr-1" />
              Add a question
            </Button>
            <Button onClick={() => save.mutate({ motorsportId: motorsportId ?? "", questions })} disabled={!draft || blank || save.isPending}>
              {save.isPending && <Spinner className="w-3 h-3 mr-1" />}
              Save questions
            </Button>
            {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
            {blank && <span className="text-xs text-destructive">Every question needs some text.</span>}
          </div>
        </div>
      )}
    </PageShell>
  );
}
