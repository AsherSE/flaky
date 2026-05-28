import type { Metadata } from "next";
import Link from "next/link";
import { getMeetingRecord } from "@/lib/meeting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're invited",
  description: "Someone penciled you in for plans on flaky.",
};

function formatPlanDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function MeetingInvitePage({
  params,
}: {
  params: { id: string };
}) {
  const meeting = await getMeetingRecord(params.id);

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#faf8f5] to-[#f0ece6] text-[#3d3d3d]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        {meeting ? (
          <>
            <div className="text-5xl" aria-hidden="true">
              📝
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              You&apos;re penciled in
            </h1>
            <p className="mt-3 text-[#5a5a5a] leading-relaxed">
              <strong className="text-[#3d3d3d]">{meeting.creator}</strong>{" "}
              penciled you in for plans on{" "}
              <strong className="text-[#3d3d3d]">
                {formatPlanDate(meeting.date)}
              </strong>
              .
            </p>
            <p className="mt-3 text-sm text-[#7a7a7a] leading-relaxed">
              Open flaky to see the plan. If you secretly want to bail, you can
              flake — nobody finds out unless everyone feels the same.
            </p>
            <Link
              href="/"
              className="mt-8 w-full rounded-xl bg-[#e07a5f] py-3 font-medium text-white transition-colors hover:bg-[#d06a4f] active:bg-[#c05a3f]"
            >
              Open flaky
            </Link>
          </>
        ) : (
          <>
            <div className="text-5xl" aria-hidden="true">
              🌫️
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              Invite not found
            </h1>
            <p className="mt-3 text-[#5a5a5a] leading-relaxed">
              This invite link has expired or doesn&apos;t exist anymore. Plans
              on flaky stick around for a week.
            </p>
            <Link
              href="/"
              className="mt-8 w-full rounded-xl bg-[#e07a5f] py-3 font-medium text-white transition-colors hover:bg-[#d06a4f] active:bg-[#c05a3f]"
            >
              Go to flaky
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
