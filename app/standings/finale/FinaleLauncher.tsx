"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClapperboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc/client";
import { SeasonFinale } from "./SeasonFinale";

const seenKey = (userId: string, leagueId: string, seasonKey: string) => `racee_finale_seen:${userId}:${leagueId}:${seasonKey}`;

function readSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Once the commissioner releases the finale, it opens by itself the first time
 * each player visits the standings; afterwards a button replays it.
 */
export function FinaleLauncher({ leagueId, userId }: { leagueId: string; userId: string }) {
  const finale = useQuery(orpc.seasonProps.finale.get.queryOptions({ input: { leagueId } }));
  // `manual` is the replay button; the first-visit auto-open is derived, not stored.
  const [manual, setManual] = useState(false);
  const [closed, setClosed] = useState(false);
  const data = finale.data;
  const released = data?.state === "released";
  const open = manual || (released && !closed && !readSeen(seenKey(userId, leagueId, data.seasonKey)));

  const close = () => {
    setManual(false);
    setClosed(true);
    if (data) {
      try {
        localStorage.setItem(seenKey(userId, leagueId, data.seasonKey), "1");
      } catch {
        /* remembering is optional */
      }
    }
  };

  if (!data || !released) return null;
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setManual(true)}>
        <ClapperboardIcon className="w-4 h-4 mr-1" />
        Watch the season finale
      </Button>
      {open && <SeasonFinale data={data} viewerId={userId} onClose={close} />}
    </>
  );
}
