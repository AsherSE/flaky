import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms of use and SMS program details for flaky — cancel plans, guilt-free.",
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">
          Terms &amp; conditions
        </h1>
        <p className="mt-2 text-sm text-[#8a8a8a]">
          Last updated: April 5, 2026.
        </p>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">The service</h2>
          <p>
            <strong className="text-[#3d3d3d]">flaky</strong> (“the program”) is
            a simple web app for coordinating plans with people you know: you
            can pencil in a meeting, privately signal if you want to cancel,
            and get notified when everyone agrees. The service is provided “as
            is” without warranties. We may change or discontinue it at any
            time.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            Eligibility &amp; acceptable use
          </h2>
          <p>
            You must be able to enter a binding agreement where you live. You
            may only add phone numbers for people you legitimately intend to
            meet with. Do not use flaky to harass, spam, or impersonate
            anyone. You are responsible for messages you trigger by using the
            product.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">
            SMS program details
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[#3d3d3d]">Program name:</strong> flaky
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Description:</strong>{" "}
              Transactional texts related to your account and meetings — e.g.
              one-time verification codes when you sign in, notices when
              another verified user pencils you into a plan, and confirmations
              when everyone in a plan agrees to cancel.
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Frequency:</strong> Low;
              messages are sent when you take actions in the app or when a
              meeting reaches a state that triggers a notice — not on a fixed
              marketing schedule.
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Cost:</strong> Message &
              data rates may apply. Carriers are not liable for delayed or
              undelivered messages.
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Help:</strong> Reply{" "}
              <strong>HELP</strong> to an SMS from us for help where your
              carrier and our SMS provider support keyword replies, or email{" "}
              <a
                href="mailto:feedback@flaky.me?subject=HELP%20-%20flaky"
                className="font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
              >
                feedback@flaky.me
              </a>
              .
            </li>
            <li>
              <strong className="text-[#3d3d3d]">Opt-out:</strong> To stop
              receiving SMS from flaky on your phone, reply{" "}
              <strong>STOP</strong> to a message we sent you. After you opt out,
              we will not send further SMS to that number unless you start the
              flow again (e.g. new verification). You can also email{" "}
              <a
                href="mailto:feedback@flaky.me?subject=STOP%20-%20flaky%20SMS"
                className="font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
              >
                feedback@flaky.me
              </a>{" "}
              to request removal of your number or account data.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">Privacy</h2>
          <p>
            See our{" "}
            <Link
              href="/privacy"
              className="font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
            >
              Privacy policy
            </Link>{" "}
            for how we handle personal data.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">Limitation</h2>
          <p>
            To the maximum extent allowed by law, we are not liable for
            indirect or consequential damages arising from your use of flaky.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[#5a5a5a] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#3d3d3d]">Contact</h2>
          <p>
            <a
              href="mailto:feedback@flaky.me?subject=flaky%20terms"
              className="font-medium text-[#e07a5f] hover:text-[#d06a4f] underline underline-offset-2"
            >
              feedback@flaky.me
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
