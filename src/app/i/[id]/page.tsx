import type { Metadata } from "next";
import Link from "next/link";
import { getIMessagePlan } from "@/lib/imessage-plan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A flaky-protected plan",
  description: "Someone added a no-guilt exit to your plans on flaky.",
};

const TIME_LABEL = { morning: "morning", lunch: "lunch", night: "night" };

function formatPlanDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Where an iMessage-app bubble lands for anyone who can't open it natively:
 * Android and Mac recipients, or an iPhone without flaky. Flaking needs the
 * drawer app, because that's where the anonymous participant id comes from.
 */
export default async function IMessagePlanPage({
  params,
}: {
  params: { id: string };
}) {
  const plan = await getIMessagePlan(params.id);

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#faf8f5] to-[#f0ece6] text-[#3d3d3d]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <div className="text-5xl" aria-hidden="true">
          {plan ? "🫶" : "🌫️"}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {plan ? "This plan is flaky-protected" : "Plan not found"}
        </h1>
        {plan ? (
          <>
            <p className="mt-3 text-[#5a5a5a] leading-relaxed">
              Plans on{" "}
              <strong className="text-[#3d3d3d]">
                {formatPlanDate(plan.date)}
                {plan.timeOfDay ? ` (${TIME_LABEL[plan.timeOfDay]})` : ""}
              </strong>{" "}
              have a no-guilt exit. If you ever need out, flake secretly. Nobody
              finds out unless everyone does.
            </p>
            <p className="mt-3 text-sm text-[#7a7a7a] leading-relaxed">
              Flaking works from the flaky app inside iMessage on iPhone. Tap
              the bubble in your chat to open it.
            </p>
          </>
        ) : (
          <p className="mt-3 text-[#5a5a5a] leading-relaxed">
            This plan has expired or doesn&apos;t exist anymore. Plans on flaky
            stick around for a week.
          </p>
        )}
        <Link
          href="/"
          className="mt-8 w-full rounded-xl bg-[#e07a5f] py-3 font-medium text-white transition-colors hover:bg-[#d06a4f] active:bg-[#c05a3f]"
        >
          Go to flaky
        </Link>
      </div>
    </main>
  );
}
