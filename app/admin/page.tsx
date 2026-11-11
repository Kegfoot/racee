import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { OverhaulNotice } from "@/components/ui/overhaul-notice";
import { CalendarIcon, FlagIcon, UserIcon, KeyRoundIcon, ShieldIcon, FlagTriangleRightIcon, HistoryIcon, CalendarRangeIcon, HelpCircleIcon, ClapperboardIcon } from "lucide-react";
import { getSession } from "@/server/auth/server";

const CARDS = [
  {
    href: "/admin/leagues",
    icon: CalendarIcon,
    title: "Leagues",
    description: "Create and manage race leagues.",
  },
  {
    href: "/admin/seasons",
    icon: CalendarRangeIcon,
    title: "Seasons",
    description: "Set each season's start and end dates, and set up next season ahead of time.",
  },
  {
    href: "/admin/finale",
    icon: ClapperboardIcon,
    title: "Season finale",
    description: "Release the finale for all leagues once grading is done, or preview any league's.",
  },
  {
    href: "/admin/season-questions",
    icon: HelpCircleIcon,
    title: "Season questions",
    description: "Year-long prop bets for leagues to pick from, and their correct answers at season's end.",
  },
  {
    href: "/admin/races",
    icon: FlagIcon,
    title: "Races",
    description: "Add races and configure driver lineups.",
  },
  {
    href: "/admin/drivers",
    icon: UserIcon,
    title: "Drivers",
    description: "Manage the global driver roster.",
  },
  {
    href: "/admin/results",
    icon: KeyRoundIcon,
    title: "Results",
    description: "Set official race finish orders.",
  },
  {
    href: "/admin/users",
    icon: ShieldIcon,
    title: "Users",
    description: "Manage user roles and admin access.",
  },
  {
    href: "/admin/reports",
    icon: FlagTriangleRightIcon,
    title: "Reported",
    description: "Review reported profile photos and team logos.",
  },
  {
    href: "/admin/history",
    icon: HistoryIcon,
    title: "Trophies & History",
    description: "Trophy art, and adding past seasons to a league's history book.",
  },
];

export default async function AdminPage() {
  const session = await getSession();
  if (!session?.user.isAdmin) redirect("/");
  return (
    <PageShell title="Admin">
      <OverhaulNotice />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
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
