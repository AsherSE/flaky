import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How flaky collects, uses, and protects your information — including phone numbers and SMS.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#faf8f5] to-[#f0ece6] text-[#3d3d3d]">
      <div className="mx-auto max-w-2xl px-4 py-12 pb-20">
        <p className="mb-8">
          <Link
            href="/"
            className="text-sm font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
          >
            ← Back to flaky
          </Link>
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-[#8a8a8a]">
          Last updated: March 30, 2026. flaky is operated as a personal /
          small project (“we”, “us”).
        </p>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            What we collect
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[#3d3d3d]">Phone number</strong> — when
              you sign in, we use it to verify your identity (one-time SMS
              codes) and to coordinate meetings you create or join.
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Optional display name</strong> —
              if you choose to add a name, we store it with your account so
              others can see how you appear in the app.
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Meeting data</strong> — dates and
              participant phone numbers you enter for plans you pencil in or are
              added to, and signals about who has opted to cancel (stored as
              needed for the feature to work).
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Technical data</strong> — our
              hosting provider and tools may log standard request metadata (e.g.
              IP region for phone parsing, errors, and abuse prevention).
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            How we use information
          </h2>
          <p>
            We use your data only to run flaky: authentication, showing your
            meetings, sending{" "}
            <strong className="text-[#3d3d3d]">transactional SMS</strong> (e.g.
            verification codes, when someone pencils you in, when everyone
            agrees to cancel), and keeping the service reliable. We do not sell
            your phone number or use SMS to send unrelated third-party marketing.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">SMS</h2>
          <p>
            Message frequency is low and tied to your use of the app (e.g.
            signup verification, invites, cancellations). Message and data
            rates may apply — check with your carrier.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            Who we share with
          </h2>
          <p>
            We use vendors that are necessary to operate the service (for
            example, cloud hosting, a database, and a telecommunications
            provider to send and verify SMS). They process data on our behalf
            under their terms and privacy policies; we do not sell personal
            information.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">Retention</h2>
          <p>
            Meeting-related data is kept only as long as needed for the feature
            (currently on the order of days, then expires automatically). Session
            and account data may be removed when you stop using the service or
            when you ask us to delete it, subject to technical limits.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            Contact & requests
          </h2>
          <p>
            Questions, corrections, or deletion requests:{" "}
            <a
              href="mailto:feedback@flaky.me?subject=Privacy%20request"
              className="font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
            >
              feedback@flaky.me
            </a>
            .
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">Changes</h2>
          <p>
            We may update this policy; the date at the top will change when we
            do. Continued use after updates means you accept the revised policy.
          </p>
        </section>
      </div>
    </main>
  );
}
