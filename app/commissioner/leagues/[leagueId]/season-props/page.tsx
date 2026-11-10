"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PlusIcon, Trash2Icon } from "lucide-react";
import { orpc } from "@/lib/orpc/client";
import { PageShell } from "@/components/ui/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnswerEditor, KIND_LABEL, parseOptions, type QuestionKind } from "@/components/season-props/SeasonPropInputs";

type Question = {
  questionId: string;
  libraryQuestionId: string | null;
  prompt: string;
  kind: QuestionKind;
  options: string[];
  numberMode: "exact" | "closest";
  scoring: "scale" | "flat";
  flatDriverPoints: number;
  flatTeamPoints: number;
  answers: string[];
  voided: boolean;
};
type Step = { correct: number; driverPoints: number; teamPoints: number };

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}
const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h2>
);

export default function CommissionerSeasonPropsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const query = useQuery(orpc.seasonProps.get.queryOptions({ input: { leagueId } }));
  const data = query.data;

  return (
    <PageShell title="Season bets">
      <Link
        href={`/commissioner/leagues/${leagueId}`}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ChevronLeft className="size-3.5" />
        League
      </Link>
      {query.isPending ? (
        <QueryLoading />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => query.refetch()} />
      ) : !data!.canManage ? (
        <p className="text-sm text-muted-foreground">Only commissioners can set up season bets.</p>
      ) : (
        <Editor leagueId={leagueId} data={data!} />
      )}
    </PageShell>
  );
}

type ViewData = NonNullable<Awaited<ReturnType<typeof orpc.seasonProps.get.call>>>;

function Editor({ leagueId, data }: { leagueId: string; data: ViewData }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [open, setOpen] = useState(data.open);
  const [locksAt, setLocksAt] = useState<string>(data.locksAt ?? "");
  const [late, setLate] = useState<string[]>(data.latePickUserIds);
  const [picksVisible, setPicksVisible] = useState(data.picksVisible);
  const [pointsReveal, setPointsReveal] = useState(data.pointsReveal);
  const [revealRacesLeft, setRevealRacesLeft] = useState(data.revealRacesLeft);
  const [scale, setScale] = useState<Step[]>(data.scale);
  const [questions, setQuestions] = useState<Question[]>(data.questions as Question[]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = () => setSaved(false);

  const save = useMutation(
    orpc.seasonProps.save.mutationOptions({
      onSuccess: () => {
        setError(null);
        setSaved(true);
        queryClient.invalidateQueries({ queryKey: orpc.seasonProps.key() });
        queryClient.invalidateQueries({ queryKey: orpc.standings.key() });
        queryClient.invalidateQueries({ queryKey: orpc.history.key() });
      },
      onError: (e) => setError(errorMessage(e, "Couldn't save.")),
    }),
  );

  const edit = (id: string, patch: Partial<Question>) => {
    dirty();
    setQuestions((qs) => qs.map((q) => (q.questionId === id ? { ...q, ...patch } : q)));
  };
  const addCustom = () => {
    dirty();
    setQuestions((qs) => [
      ...qs,
      { questionId: crypto.randomUUID(), libraryQuestionId: null, prompt: "", kind: "choice", options: [], numberMode: "exact", scoring: "scale", flatDriverPoints: 0, flatTeamPoints: 0, answers: [], voided: false },
    ]);
  };
  const addFromLibrary = (libraryId: string) => {
    const lq = data.library.find((l) => l.questionId === libraryId);
    if (!lq) return;
    dirty();
    setQuestions((qs) => [
      ...qs,
      { questionId: crypto.randomUUID(), libraryQuestionId: lq.questionId, prompt: lq.prompt, kind: lq.kind, options: lq.options, numberMode: "exact", scoring: "scale", flatDriverPoints: 0, flatTeamPoints: 0, answers: [], voided: false },
    ]);
  };
  const available = data.library.filter((l) => !questions.some((q) => q.libraryQuestionId === l.questionId));
  const scaledCount = questions.filter((q) => q.scoring === "scale").length;
  const blank = questions.some((q) => !q.prompt.trim());
  const emptyChoice = questions.some((q) => q.kind === "choice" && q.options.length < 2);

  const submit = () =>
    save.mutate({
      leagueId,
      setup: {
        enabled,
        open,
        locksAt: locksAt || null,
        latePickUserIds: late,
        picksVisible,
        pointsReveal,
        revealRacesLeft,
        scale,
        questions,
      },
    });

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={enabled} onCheckedChange={(v) => { dirty(); setEnabled(v); }} />
            <span>
              <span className="font-semibold">This league plays season bets</span>
              <span className="block text-xs text-muted-foreground">
                Year-long prop bets, like who finishes 4th in the Constructors&apos; Cup. Leagues don&apos;t have to play them.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={open} disabled={!enabled} onCheckedChange={(v) => { dirty(); setOpen(v); }} />
            <span>
              <span className="font-semibold">Open to players</span>
              <span className="block text-xs text-muted-foreground">
                Players see the questions and can make their picks once this is on and you&apos;ve saved. Keep it off while you build.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionTitle>Questions</SectionTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Add questions the admins built (they enter the correct answer for you at the end of the season), or write your own
            and set the answer yourself. Each question either counts on the scale below, or is worth flat points of its own.
          </p>
          {questions.map((q) => (
            <div key={q.questionId} className="space-y-3 rounded-sm border border-border p-3">
              <div className="flex gap-2">
                {q.libraryQuestionId ? (
                  <p className="flex-1 text-sm font-semibold">{q.prompt}</p>
                ) : (
                  <Input value={q.prompt} maxLength={200} placeholder="Your question" onChange={(e) => edit(q.questionId, { prompt: e.target.value })} />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove question"
                  onClick={() => { dirty(); setQuestions((qs) => qs.filter((x) => x.questionId !== q.questionId)); }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>

              {q.libraryQuestionId ? (
                <p className="text-[11px] text-muted-foreground">
                  {KIND_LABEL[q.kind]}. From the admins&apos; list, they enter the answer.
                </p>
              ) : (
                <div className="space-y-2">
                  <Select value={q.kind} onValueChange={(kind) => edit(q.questionId, { kind: kind as QuestionKind, answers: [], options: kind === "choice" ? q.options : [] })}>
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
                        <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {q.kind === "choice" && (
                    <Input
                      defaultValue={q.options.join(", ")}
                      placeholder="Answer options, separated by commas (at least 2)"
                      onBlur={(e) => {
                        const options = parseOptions(e.target.value);
                        edit(q.questionId, { options, answers: q.answers.filter((a) => options.includes(a)) });
                      }}
                    />
                  )}
                </div>
              )}

              {q.kind === "number" && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch size="sm" checked={q.numberMode === "closest"} onCheckedChange={(v) => edit(q.questionId, { numberMode: v ? "closest" : "exact" })} />
                  Closest guess wins (ties all win). Off means only the exact number counts.
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Select value={q.scoring} onValueChange={(v) => edit(q.questionId, { scoring: v as "scale" | "flat" })}>
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scale">Counts on the scale</SelectItem>
                    <SelectItem value="flat">Flat points</SelectItem>
                  </SelectContent>
                </Select>
                {q.scoring === "flat" && (
                  <>
                    <label className="flex items-center gap-1.5">
                      Drivers&apos; Cup
                      <Input type="number" min={0} className="w-20 h-8" value={q.flatDriverPoints} onChange={(e) => edit(q.questionId, { flatDriverPoints: num(e.target.value) })} />
                    </label>
                    <label className="flex items-center gap-1.5">
                      Constructors&apos; Cup
                      <Input type="number" min={0} className="w-20 h-8" value={q.flatTeamPoints} onChange={(e) => edit(q.questionId, { flatTeamPoints: num(e.target.value) })} />
                    </label>
                  </>
                )}
              </div>

              {!q.libraryQuestionId && (
                <div className="space-y-1.5 rounded-sm border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Correct answer</p>
                  {q.voided ? (
                    <p className="text-xs text-muted-foreground">Thrown out: nobody scores this question.</p>
                  ) : (
                    <AnswerEditor kind={q.kind} options={q.options} grid={data.grid} answers={q.answers} onChange={(answers) => edit(q.questionId, { answers })} />
                  )}
                  <label className="flex items-center gap-2 text-xs pt-1">
                    <Switch size="sm" checked={q.voided} onCheckedChange={(voided) => edit(q.questionId, { voided })} />
                    Throw this question out
                  </label>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            {available.length > 0 && (
              <Select value="__none__" onValueChange={(v) => v !== "__none__" && addFromLibrary(v)}>
                <SelectTrigger size="sm" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Add a question from the admins…</SelectItem>
                  {available.map((l) => (
                    <SelectItem key={l.questionId} value={l.questionId}>{l.prompt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={addCustom}>
              <PlusIcon className="size-3.5 mr-1" />
              Write my own
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionTitle>Scale</SectionTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The more scaled questions a player gets right, the more it&apos;s worth. For example 1 right = 15, 2 = 30, 3 = 50.
            Points go to the Drivers&apos; Cup, the Constructors&apos; Cup (to the player&apos;s team), or both. Leave a box at 0 to skip
            that cup. You have {scaledCount} question{scaledCount === 1 ? "" : "s"} on the scale.
          </p>
          {scale.length > 0 && (
            <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-xs">
              <span />
              <span className="text-muted-foreground">Drivers&apos; Cup</span>
              <span className="text-muted-foreground">Constructors&apos; Cup</span>
              <span />
              {scale.map((s, i) => (
                <div key={i} className="contents">
                  <span className="tabular-nums">{s.correct} right</span>
                  <Input type="number" min={0} className="h-8" value={s.driverPoints} onChange={(e) => { dirty(); setScale(scale.map((x, j) => (j === i ? { ...x, driverPoints: num(e.target.value) } : x))); }} />
                  <Input type="number" min={0} className="h-8" value={s.teamPoints} onChange={(e) => { dirty(); setScale(scale.map((x, j) => (j === i ? { ...x, teamPoints: num(e.target.value) } : x))); }} />
                  <Button variant="ghost" size="icon" aria-label="Remove step" onClick={() => { dirty(); setScale(scale.filter((_, j) => j !== i).map((x, j) => ({ ...x, correct: j + 1 }))); }}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => { dirty(); setScale([...scale, { correct: scale.length + 1, driverPoints: 0, teamPoints: 0 }]); }}>
            <PlusIcon className="size-3.5 mr-1" />
            Add a step
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionTitle>Timing and visibility</SectionTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="flex flex-wrap items-center gap-2">
            Picks lock on
            <Input type="date" className="w-44" value={locksAt} onChange={(e) => { dirty(); setLocksAt(e.target.value); }} />
            <span className="text-xs text-muted-foreground">{locksAt ? "" : "No lock: open until the season ends."}</span>
          </label>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Everyone can see each other&apos;s picks…</p>
            <Select value={picksVisible} onValueChange={(v) => { dirty(); setPicksVisible(v as typeof picksVisible); }}>
              <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="afterLock">Once picks lock</SelectItem>
                <SelectItem value="seasonEnd">Only when the season ends</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">The bonus points count in the standings…</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={pointsReveal} onValueChange={(v) => { dirty(); setPointsReveal(v as typeof pointsReveal); }}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">As soon as questions are answered</SelectItem>
                  <SelectItem value="racesLeft">When a few races are left</SelectItem>
                  <SelectItem value="seasonEnd">Only when the season ends</SelectItem>
                </SelectContent>
              </Select>
              {pointsReveal === "racesLeft" && (
                <label className="flex items-center gap-1.5 text-xs">
                  Races left
                  <Input type="number" min={0} className="w-20 h-8" value={revealRacesLeft} onChange={(e) => { dirty(); setRevealRacesLeft(Math.max(0, Math.floor(Number(e.target.value) || 0))); }} />
                </label>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hidden points stay out of the standings and every calculation until they&apos;re revealed, so the totals jump on reveal day.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">May still pick after the lock</p>
            <p className="text-xs text-muted-foreground">
              Someone who joins mid-season can&apos;t pick once picks lock, unless you allow it here. Players you don&apos;t tick just don&apos;t play the season bets.
            </p>
            <div className="divide-y divide-border rounded-sm border border-border">
              {data.members.map((m) => (
                <label key={m.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Switch size="sm" checked={late.includes(m.userId)} onCheckedChange={(v) => { dirty(); setLate(v ? [...late, m.userId] : late.filter((id) => id !== m.userId)); }} />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={save.isPending || blank || emptyChoice}>
          {save.isPending && <Spinner className="w-3 h-3 mr-1" />}
          Save
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
        {blank && <span className="text-xs text-destructive">Every question needs some text.</span>}
        {emptyChoice && <span className="text-xs text-destructive">Pick-from-a-list questions need at least 2 options.</span>}
      </div>

      {data.everyone && data.everyone.length > 0 && (
        <Card>
          <CardHeader>
            <SectionTitle>Everyone&apos;s picks</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.everyone.map((p) => (
              <div key={p.userId} className="space-y-1 text-sm">
                <p className="font-semibold">
                  {p.name}
                  {p.result && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {p.result.driverPoints} Drivers&apos; · {p.result.teamPoints} Constructors&apos;
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
