"use client";

import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Grid = { drivers: string[]; teams: string[] };
export type QuestionKind = "choice" | "driver" | "team" | "number";

export const KIND_LABEL: Record<QuestionKind, string> = {
  choice: "Pick from a list",
  driver: "Pick a driver",
  team: "Pick a team",
  number: "A number",
};

const NONE = "__none__";

/** The choices a question offers: its own list, or the season's drivers / teams. */
export function choicesFor(kind: QuestionKind, options: readonly string[], grid: Grid): string[] {
  if (kind === "driver") return grid.drivers;
  if (kind === "team") return grid.teams;
  if (kind === "choice") return [...options];
  return [];
}

/** A player's single answer to a question. */
export function PickInput({
  kind,
  options,
  grid,
  value,
  onChange,
  disabled,
}: {
  kind: QuestionKind;
  options: readonly string[];
  grid: Grid;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (kind === "number") {
    return (
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        placeholder="Your number"
        className="w-40"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const choices = choicesFor(kind, options, grid);
  return (
    <Select value={value || NONE} disabled={disabled} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full sm:w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No pick yet</SelectItem>
        {choices.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The correct answer(s) to a question: several are allowed (ties). */
export function AnswerEditor({
  kind,
  options,
  grid,
  answers,
  onChange,
}: {
  kind: QuestionKind;
  options: readonly string[];
  grid: Grid;
  answers: string[];
  onChange: (answers: string[]) => void;
}) {
  if (kind === "number") {
    return (
      <Input
        type="number"
        inputMode="decimal"
        value={answers[0] ?? ""}
        placeholder="Correct number"
        className="w-40"
        onChange={(e) => onChange(e.target.value === "" ? [] : [e.target.value])}
      />
    );
  }
  const choices = choicesFor(kind, options, grid).filter((c) => !answers.includes(c));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {answers.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
          {a}
          <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(answers.filter((x) => x !== a))}>
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Select value={NONE} onValueChange={(v) => v !== NONE && onChange([...answers, v])}>
        <SelectTrigger size="sm" className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{answers.length === 0 ? "Set the correct answer…" : "Add a tied answer…"}</SelectItem>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Options typed as one comma-separated line. */
export function parseOptions(text: string): string[] {
  return [...new Set(text.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 30);
}
