import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getPlan, type Plan } from "@/lib/plan";
import { migrateLegacyInvite } from "@/lib/legacy-plans";
import { formatPlanDateForLocale, localeFromAcceptLanguage } from "@/lib/plan-date";

export const dynamic = "force-dynamic";

async function loadPlan(id: string): Promise<Plan | null> {
  const plan = await getPlan(id);
  if (plan) return plan;
  // An invite link from before plans had ids of their own.
  if (await migrateLegacyInvite(id)) return getPlan(id);
  return null;
}

function planLocale(): string {
  return localeFromAcceptLanguage(headers().get("accept-language"));
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const plan = await getPlan(params.id);
  if (!plan) {
    return { title: "You're invited", description: "Plans on flaky." };
  }
  const when = formatPlanDateForLocale(plan.date, planLocale());
  const title = `Plans on ${when}`;
  const description = `${plan.creator || "Someone"} penciled you in. Tap to join — and flake guilt-free if you secretly want out.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function MeetingInvitePage({
  params,
}: {
  params: { id: string };
}) {
  const plan = await loadPlan(params.id);
  const locale = planLocale();

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#faf8f5] to-[#f0ece6] text-[#3d3d3d]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        {plan && plan.mutual ? (
          <>
            <div className="text-5xl" aria-hidden="true">
              🛋️
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              This one&apos;s off
            </h1>
            <p className="mt-3 text-[#5a5a5a] leading-relaxed">
              Everyone in the plan for{" "}
              <strong className="text-[#3d3d3d]">
                {formatPlanDateForLocale(plan.date, locale)}
              </strong>{" "}
              secretly wanted out, so it&apos;s cancelled. Guilt-free.
            </p>
            <Link
              href="/"
              className="mt-8 w-full rounded-xl bg-[#e07a5f] py-3 font-medium text-white transition-colors hover:bg-[#d06a4f] active:bg-[#c05a3f]"
            >
              Go to flaky
            </Link>
          </>
        ) : plan ? (
          <>
            <div className="text-5xl" aria-hidden="true">
              📝
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              You&apos;re invited
            </h1>
            <p className="mt-3 text-[#5a5a5a] leading-relaxed">
              <strong className="text-[#3d3d3d]">
                {plan.creator || "Someone"}
              </strong>{" "}
              penciled in plans for{" "}
              <strong className="text-[#3d3d3d]">
                {formatPlanDateForLocale(plan.date, locale)}
              </strong>
              .
            </p>
            <p className="mt-3 text-sm text-[#7a7a7a] leading-relaxed">
              Join to add yourself. If you secretly want to bail later, you can
              flake — nobody finds out unless everyone feels the same.
            </p>
            <Link
              href={`/?join=${encodeURIComponent(plan.id)}`}
              className="mt-8 w-full rounded-xl bg-[#e07a5f] py-3 font-medium text-white transition-colors hover:bg-[#d06a4f] active:bg-[#c05a3f]"
            >
              Join this plan
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
              on flaky disappear a couple of days after they happen.
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
