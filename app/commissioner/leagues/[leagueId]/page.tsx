"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ORPCError } from "@orpc/client";
import { ChevronLeft, Settings2, Users, UserCheck, ClipboardCheck, Trophy, ListChecks } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { QueryLoading } from "@/components/ui/query-state";
import { orpc } from "@/lib/orpc/client";

const CARDS = [
  {
    slug: "settings",
    icon: Settings2,
    title: "Settings",
    description: "Scoring, props, and league name.",
  },
  {
    slug: "teams",
    icon: Users,
    title: "Teams",
    description: "Create teams and assign players.",
  },
  {
    slug: "players",
    icon: UserCheck,
    title: "Players",
    description: "Review pending requests and manage league members.",
  },
  {
    slug: "player-status",
    icon: ClipboardCheck,
    title: "Submission Status",
    description: "See who's submitted and who's outstanding for a race.",
  },
  {
    slug: "season-props",
    icon: ListChecks,
    title: "Season bets",
    description: "Year-long prop bets: questions, scale, lock date and when points show.",
  },
  {
    slug: "season",
    icon: Trophy,
    title: "Season",
    description: "End the season, hand out trophies, and start the next one.",
  },
];

export default function CommissionerLeagueHubPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const router = useRouter();
  const input = { leagueId };

  const leagueQuery = useQuery(orpc.leagues.get.queryOptions({ input }));
  // roster is commissioner-only — its FORBIDDEN doubles as the page's access check,
  // replacing the old server-side requireCommissioner + redirect.
  const rosterQuery = useQuery(orpc.leagues.teams.roster.queryOptions({ input }));

  const deniedError = [leagueQuery, rosterQuery]
    .map((q) => q.error)
    .find(
      (e) => e instanceof ORPCError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND"),
    );
  useEffect(() => {
    if (deniedError) router.replace("/commissioner");
  }, [deniedError, router]);

  if (leagueQuery.isPending || rosterQuery.isPending || deniedError) {
    return (
      <PageShell title="Commissioner">
        <QueryLoading />
      </PageShell>
    );
  }

  const teams = rosterQuery.data?.teams ?? [];
  const users = rosterQuery.data?.users ?? [];
  const assignedIds = new Set(teams.flatMap((t) => t.memberIds));
  const playerCount = assignedIds.size;
  const teamCount = teams.length;
  const unassignedCount = users.filter((u) => !assignedIds.has(u.id)).length;

  return (
    <PageShell title={leagueQuery.data?.name ?? "Commissioner"}>
      <Link
        href="/commissioner"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ChevronLeft className="size-3.5" />
        Commissioner
      </Link>

      <p className="text-xs text-muted-foreground">
        {playerCount} {playerCount === 1 ? "player" : "players"} · {teamCount}{" "}
        {teamCount === 1 ? "team" : "teams"}
        {unassignedCount > 0 && ` · ${unassignedCount} unassigned`}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map(({ slug, icon: Icon, title, description }) => (
          <Link
            key={slug}
            href={`/commissioner/leagues/${leagueId}/${slug}`}
            className="group flex flex-col gap-3 rounded-sm border border-border bg-card p-5 transition-colors hover:border-primary"
          >
            <div className="flex items-center gap-3">
              <Icon className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm font-semibold tracking-tight">{title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
