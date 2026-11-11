"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClapperboardIcon } from "lucide-react";
import { orpc } from "@/lib/orpc/client";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { QueryError, QueryLoading } from "@/components/ui/query-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/app/context/UserContext";
import { SeasonFinale } from "@/app/standings/finale/SeasonFinale";

/** Admin → Finale preview: pick any league and watch its season finale with the current standings. */
export default function AdminFinalePreviewPage() {
  const { user } = useUser();
  const leagues = useQuery(orpc.leagues.listAll.queryOptions());
  const [leagueId, setLeagueId] = useState("");
  const [watching, setWatching] = useState(false);
  const finale = useQuery(orpc.seasonProps.finale.adminPreview.queryOptions({ input: { leagueId }, enabled: watching && !!leagueId }));

  return (
    <PageShell title="Finale preview">
      {leagues.isPending ? (
        <QueryLoading />
      ) : leagues.isError ? (
        <QueryError error={leagues.error} onRetry={() => leagues.refetch()} />
      ) : (
        <div className="max-w-md space-y-3">
          <p className="text-xs text-muted-foreground">
            Watch the season finale for any league, using its current standings. Nothing is released to players.
          </p>
          <Select
            value={leagueId}
            onValueChange={(v) => {
              setLeagueId(v);
              setWatching(false);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a league" />
            </SelectTrigger>
            <SelectContent>
              {leagues.data.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!leagueId || finale.isFetching} onClick={() => setWatching(true)}>
            <ClapperboardIcon className="w-4 h-4 mr-1" />
            Watch the finale
          </Button>
          {finale.isError && <QueryError error={finale.error} onRetry={() => finale.refetch()} />}
        </div>
      )}
      {watching && finale.data && <SeasonFinale data={finale.data} viewerId={user?.id ?? null} onClose={() => setWatching(false)} />}
    </PageShell>
  );
}
