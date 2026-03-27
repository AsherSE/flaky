"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  normalizePhone,
  inferPhoneRegionFromNavigator,
  type CountryCode,
} from "@/lib/phone";

/** Calendar date in local timezone (YYYY-MM-DD). Avoids UTC vs local mismatch from toISOString(). */
function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Step = "phone" | "code" | "name" | "flake" | "result";

interface FlakeResult {
  mutual: boolean;
  message: string;
}

interface MyCancellationItem {
  date: string;
  participants?: string[];
  totalPeople: number;
  cancelledCount: number;
  mutual: boolean;
}

function formatPlanDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function maskParticipantPhone(participantE164: string): string {
  const digits = participantE164.replace(/\D/g, "");
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    return digits.length === 11 && digits.startsWith("1")
      ? `+1 …${last4}`
      : `…${last4}`;
  }
  return participantE164;
}

/** Compare to session phone (any format) vs stored E.164. Names from profiles (others who verified and set a name). */
function formatParticipantForList(
  rawSelf: string,
  participantE164: string,
  profileNames?: Record<string, string>,
  defaultCountry: CountryCode = "US"
) {
  const self = normalizePhone(rawSelf, defaultCountry);
  if (self && self === participantE164) return "With";
  const masked = maskParticipantPhone(participantE164);
  const saved = profileNames?.[participantE164]?.trim();
  if (saved) return `${saved} · ${masked}`;
  return masked;
}

function displayMaskedSelf(
  rawPhone: string,
  defaultCountry: CountryCode = "US"
): string {
  const e164 = normalizePhone(rawPhone, defaultCountry);
  if (e164) return maskParticipantPhone(e164);
  return rawPhone.trim() || "—";
}

/** Copy for plans where the viewer is always counted in cancelledCount (see GET /api/flake). */
function youAndMoreWantToCancel(cancelledCount: number): string {
  if (cancelledCount <= 1) return "You want to cancel";
  const more = cancelledCount - 1;
  return `You and ${more} more want to cancel`;
}

function CancelProgressPie({
  cancelledCount,
  totalPeople,
}: {
  cancelledCount: number;
  totalPeople: number;
}) {
  const safeTotal = Math.max(1, totalPeople);
  const pct = Math.min(100, Math.round((cancelledCount / safeTotal) * 100));
  return (
    <div
      className="h-11 w-11 shrink-0 rounded-full border border-[#e5e0d8] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      style={{
        background: `conic-gradient(#e07a5f 0% ${pct}%, #ece8e2 ${pct}% 100%)`,
      }}
      role="img"
      aria-label={youAndMoreWantToCancel(cancelledCount)}
    />
  );
}

const TOKEN_KEY = "flaky-token";
/** Remember “skip for now” so we don’t block returning users who chose not to set a name. */
const SKIP_NAME_KEY = "flaky-skip-name";

export default function Home() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [targetPhones, setTargetPhones] = useState<string[]>([""]);
  const [date, setDate] = useState(() => localYmd());
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState("");
  const [onboardingName, setOnboardingName] = useState("");
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<FlakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [myCancellations, setMyCancellations] = useState<MyCancellationItem[]>(
    []
  );
  const [undoingFlakeKey, setUndoingFlakeKey] = useState<string | null>(null);
  const [phoneRegion, setPhoneRegion] = useState<CountryCode>("US");

  useLayoutEffect(() => {
    setPhoneRegion(inferPhoneRegionFromNavigator());
  }, []);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(TOKEN_KEY)
        : null;
    if (!stored) {
      setSessionChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!res.ok) {
          window.localStorage.removeItem(TOKEN_KEY);
          return;
        }
        const data: { phone?: string; name?: string } = await res.json();
        if (cancelled) return;
        setToken(stored);
        if (data.phone) setPhone(data.phone);
        const fn = typeof data.name === "string" ? data.name.trim() : "";
        setProfileName(fn);
        setOnboardingName(fn);
        const skippedName =
          typeof window !== "undefined" &&
          window.localStorage.getItem(SKIP_NAME_KEY) === "1";
        setStep(fn || skippedName ? "flake" : "name");
      } catch {
        window.localStorage.removeItem(TOKEN_KEY);
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token || (step !== "flake" && step !== "result")) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/flake", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: {
          items?: MyCancellationItem[];
          profileNames?: Record<string, string>;
        } = await res.json();
        if (cancelled) return;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        setMyCancellations(
          rawItems.map((item) => ({
            ...item,
            participants: Array.isArray(item.participants)
              ? item.participants
              : [],
          }))
        );
        if (data.profileNames && typeof data.profileNames === "object") {
          setProfileNames(data.profileNames);
        }
      } catch {
        if (!cancelled) setMyCancellations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, step]);

  const signOut = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPhone("");
    setCode("");
    setError("");
    setProfileNames({});
    setProfileName("");
    setOnboardingName("");
    setProfileEditOpen(false);
    setProfileDraft("");
    window.localStorage.removeItem(SKIP_NAME_KEY);
    setMyCancellations([]);
    setStep("phone");
  };

  const handleSendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, defaultCountry: phoneRegion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setStep("code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const persistProfileName = async (name: string) => {
    const authToken =
      token ??
      (typeof window !== "undefined"
        ? window.localStorage.getItem(TOKEN_KEY)
        : null);
    if (!authToken) throw new Error("Not signed in");
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save your name");
    const saved = typeof data.name === "string" ? data.name.trim() : "";
    setProfileName(saved);
    return saved;
  };

  const handleVerifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, defaultCountry: phoneRegion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      const newToken = data.token as string;
      setToken(newToken);
      localStorage.setItem(TOKEN_KEY, newToken);

      const sessionRes = await fetch("/api/session", {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!sessionRes.ok) throw new Error("Session check failed");
      const sessionData: { name?: string; phone?: string } =
        await sessionRes.json();
      if (typeof sessionData.phone === "string" && sessionData.phone) {
        setPhone(sessionData.phone);
      }
      const fn =
        typeof sessionData.name === "string" ? sessionData.name.trim() : "";
      setProfileName(fn);
      setOnboardingName(fn);
      const skippedName =
        typeof window !== "undefined" &&
        window.localStorage.getItem(SKIP_NAME_KEY) === "1";
      setStep(fn || skippedName ? "flake" : "name");
      setProfileEditOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const completeOnboardingName = async () => {
    setError("");
    const trimmed = onboardingName.trim();
    if (!trimmed) {
      setError("Add your name to continue, or tap Skip for now.");
      return;
    }
    setLoading(true);
    try {
      await persistProfileName(trimmed);
      window.localStorage.removeItem(SKIP_NAME_KEY);
      setStep("flake");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const skipOnboardingName = () => {
    setError("");
    window.localStorage.setItem(SKIP_NAME_KEY, "1");
    setStep("flake");
  };

  const saveProfileFromHeader = async () => {
    setError("");
    setLoading(true);
    try {
      await persistProfileName(profileDraft);
      if (profileDraft.trim()) {
        window.localStorage.removeItem(SKIP_NAME_KEY);
      }
      setProfileEditOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFlake = async () => {
    setError("");
    const self = normalizePhone(phone, phoneRegion);
    const targetsTrimmed = targetPhones.map((t) => t.trim()).filter(Boolean);
    if (
      self &&
      targetsTrimmed.some((t) => normalizePhone(t, phoneRegion) === self)
    ) {
      setError("That number is yours — add the other person's phone.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/flake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetPhones: targetsTrimmed,
          date,
          defaultCountry: phoneRegion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) signOut();
        throw new Error(data.error || "Something went wrong");
      }
      setResult(data);
      setStep("result");
      void (async () => {
        try {
          const listRes = await fetch("/api/flake", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (listRes.ok) {
            const listData: {
              items?: MyCancellationItem[];
              profileNames?: Record<string, string>;
            } = await listRes.json();
            const rawItems = Array.isArray(listData.items)
              ? listData.items
              : [];
            setMyCancellations(
              rawItems.map((item) => ({
                ...item,
                participants: Array.isArray(item.participants)
                  ? item.participants
                  : [],
              }))
            );
            if (
              listData.profileNames &&
              typeof listData.profileNames === "object"
            ) {
              setProfileNames(listData.profileNames);
            }
          }
        } catch {
          /* list refresh is optional */
        }
      })();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resetFlake = () => {
    setTargetPhones([""]);
    setDate(localYmd());
    setResult(null);
    setError("");
    setProfileEditOpen(false);
    setStep("flake");
  };

  function myCancellationRowKey(item: MyCancellationItem) {
    return `${item.date}:${(item.participants ?? []).join("|")}`;
  }

  const handleUndoFlake = async (item: MyCancellationItem) => {
    const participants = item.participants ?? [];
    if (!token || participants.length < 2) return;
    const rowKey = myCancellationRowKey(item);
    setUndoingFlakeKey(rowKey);
    setError("");
    try {
      const res = await fetch("/api/flake", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: item.date, participants }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) signOut();
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not update"
        );
      }
      setMyCancellations((prev) =>
        prev.filter((x) => myCancellationRowKey(x) !== rowKey)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUndoingFlakeKey(null);
    }
  };

  return (
    <main className="h-dvh max-h-dvh overflow-y-auto overscroll-none bg-gradient-to-b from-[#faf8f5] to-[#f0ece6]">
      <div className="flex min-h-full items-start justify-center px-4 pb-4 pt-14">
        <div className="w-full min-w-0 max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-0">
            <Image
              src="/logo.png"
              alt=""
              width={650}
              height={662}
              priority
              className="h-14 w-auto shrink-0"
            />
            <h1 className="text-4xl font-bold text-[#3d3d3d] tracking-tight">
              flaky
            </h1>
          </div>
          <p className="text-[#8a8a8a] mt-1 text-sm">
            cancel plans, guilt-free
          </p>
          <p className="text-[#a3a3a3] mt-1.5 text-xs">
            (nobody knows, unless they cancel too)
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#eee] p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          {!sessionChecked ? (
            <div className="py-14 text-center text-sm text-[#8a8a8a]">
              Loading…
            </div>
          ) : step === "phone" ? (
            <form
              className="space-y-4"
              autoComplete="on"
              onSubmit={(e) => {
                e.preventDefault();
                if (phone.trim()) void handleSendCode();
              }}
            >
              <label className="block" htmlFor="flaky-your-phone">
                <span className="text-sm font-medium text-[#5a5a5a]">
                  Your phone number
                </span>
                <input
                  id="flaky-your-phone"
                  name="tel"
                  type="tel"
                  autoComplete="tel"
                  enterKeyHint="send"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your mobile number"
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                />
              </label>
              <p className="text-xs text-[#a3a3a3] leading-snug">
                Country code is optional — use your local number, or include + and
                country code (e.g. +44…).
              </p>
              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="w-full py-3 bg-[#e07a5f] text-white rounded-xl font-medium hover:bg-[#d06a4f] active:bg-[#c05a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending..." : "Send code"}
              </button>
            </form>
          ) : step === "code" ? (
            <div className="space-y-4">
              <p className="text-sm text-[#8a8a8a]">
                We sent a code to{" "}
                <span className="font-medium text-[#5a5a5a]">{phone}</span>
              </p>
              <label className="block">
                <span className="text-sm font-medium text-[#5a5a5a]">
                  Verification code
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  maxLength={6}
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-2xl text-center tracking-[0.3em] text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                  onKeyDown={(e) =>
                    e.key === "Enter" && code.length >= 4 && handleVerifyCode()
                  }
                />
              </label>
              <button
                onClick={handleVerifyCode}
                disabled={loading || code.length < 4}
                className="w-full py-3 bg-[#e07a5f] text-white rounded-xl font-medium hover:bg-[#d06a4f] active:bg-[#c05a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>
              <button
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError("");
                }}
                className="w-full py-2 text-sm text-[#8a8a8a] hover:text-[#5a5a5a] transition-colors"
              >
                Use a different number
              </button>
            </div>
          ) : step === "name" ? (
            <form
              className="space-y-4"
              autoComplete="on"
              onSubmit={(e) => {
                e.preventDefault();
                void completeOnboardingName();
              }}
            >
              <p className="text-sm text-[#6a6a6a] text-center leading-relaxed">
                You&apos;re in. What should we call you?
              </p>
              <p className="w-full min-w-0 text-xs text-[#8a8a8a] text-center leading-relaxed break-words">
                Signed in as{" "}
                <span className="font-medium text-[#6a6a6a]">
                  {displayMaskedSelf(phone, phoneRegion)}
                </span>
              </p>
              <label className="block" htmlFor="flaky-onboarding-name">
                <span className="text-sm font-medium text-[#5a5a5a]">
                  Name
                </span>
                <input
                  id="flaky-onboarding-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="done"
                  value={onboardingName}
                  onChange={(e) => setOnboardingName(e.target.value)}
                  placeholder="Jane Doe"
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                />
              </label>
              <p className="text-xs text-[#a3a3a3] text-center leading-snug">
                Autofill is fine — we&apos;ll display first name + last initial
                (e.g. Jane D.).
              </p>
              <button
                type="submit"
                disabled={loading || !onboardingName.trim()}
                className="w-full py-3 bg-[#e07a5f] text-white rounded-xl font-medium hover:bg-[#d06a4f] active:bg-[#c05a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Saving..." : "Continue"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={skipOnboardingName}
                className="w-full py-2 text-sm text-[#8a8a8a] hover:text-[#5a5a5a] transition-colors"
              >
                Skip for now
              </button>
            </form>
          ) : step === "flake" ? (
            <div className="space-y-4">
              {profileEditOpen ? (
                <div className="space-y-3 rounded-xl border border-[#eee] bg-[#fafaf9] p-3">
                  <p className="text-xs font-medium text-[#5a5a5a]">
                    Your name / number
                  </p>
                  <label className="block" htmlFor="flaky-profile-name">
                    <span className="text-xs text-[#8a8a8a]">Name</span>
                    <input
                      id="flaky-profile-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={profileDraft}
                      onChange={(e) => setProfileDraft(e.target.value)}
                      className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-base text-[#3d3d3d] bg-transparent"
                    />
                  </label>
                  <p className="text-xs text-[#8a8a8a] leading-relaxed">
                    Number:{" "}
                    <span className="text-[#6a6a6a]">
                      {displayMaskedSelf(phone, phoneRegion)}
                    </span>
                    {" · "}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={signOut}
                      className="text-[#8a8a8a] underline decoration-[#ccc] underline-offset-2 hover:text-[#5a5a5a] disabled:opacity-50"
                    >
                      Use a different number
                    </button>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void saveProfileFromHeader()}
                      className="flex-1 py-2.5 bg-[#e07a5f] text-white rounded-xl text-sm font-medium hover:bg-[#d06a4f] disabled:opacity-50"
                    >
                      {loading ? "..." : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setProfileEditOpen(false);
                        setProfileDraft(profileName);
                      }}
                      className="flex-1 py-2.5 border border-[#ddd] text-[#5a5a5a] rounded-xl text-sm font-medium hover:bg-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProfileDraft(profileName);
                    setProfileEditOpen(true);
                    setError("");
                  }}
                  className="group w-full max-w-full min-w-0 rounded-lg px-1 py-1.5 text-center text-xs leading-relaxed text-[#8a8a8a] transition-colors hover:bg-[#faf8f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a5f]/40"
                >
                  <span className="text-[#8a8a8a]">Signed in as </span>
                  <span className="whitespace-normal break-words font-medium text-[#6a6a6a] underline decoration-[#ccc] underline-offset-2 transition-colors group-hover:text-[#e07a5f] group-hover:decoration-[#e07a5f]">
                    {profileName ? (
                      <>
                        {profileName}
                        <span className="font-normal text-[#a3a3a3] group-hover:text-[#e07a5f]/70"> · </span>
                      </>
                    ) : null}
                    {displayMaskedSelf(phone, phoneRegion)}
                  </span>
                </button>
              )}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#5a5a5a]">
                    Who are you meeting?
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setTargetPhones((prev) => [...prev, ""])}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#81b29a] text-[#5a7d6c] hover:bg-[#e8f2ec] active:bg-[#dceee4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Add another number"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      className="h-5 w-5"
                      aria-hidden
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>
                {targetPhones.map((targetPhone, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <label
                      className="block flex-1 min-w-0"
                      htmlFor={`flaky-their-phone-${index}`}
                    >
                      <span className="text-xs text-[#8a8a8a]">
                        {targetPhones.length > 1
                          ? `Person ${index + 1}`
                          : "Their number"}
                      </span>
                      <input
                        id={`flaky-their-phone-${index}`}
                        name={
                          index === 0
                            ? "recipient-tel"
                            : `recipient-tel-${index}`
                        }
                        type="tel"
                        autoComplete="section-other tel"
                        inputMode="tel"
                        value={targetPhone}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTargetPhones((prev) => {
                            const next = [...prev];
                            next[index] = v;
                            return next;
                          });
                        }}
                        placeholder="Their mobile number"
                        className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                      />
                    </label>
                    {targetPhones.length > 1 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          setTargetPhones((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                        className="shrink-0 py-2 px-2 text-sm text-[#8a8a8a] hover:text-[#c05a3f] disabled:opacity-50"
                        aria-label="Remove this number"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <label className="block">
                <span className="text-sm font-medium text-[#5a5a5a]">
                  What day?
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={localYmd()}
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] bg-transparent transition-colors"
                />
              </label>
              <button
                onClick={handleFlake}
                disabled={
                  loading ||
                  !targetPhones.some((t) => t.trim()) ||
                  !date
                }
                className="w-full py-3 bg-[#e07a5f] text-white rounded-xl font-medium hover:bg-[#d06a4f] active:bg-[#c05a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "..." : "I want to cancel"}
              </button>
            </div>
          ) : step === "result" && result ? (
            <div className="text-center space-y-4 py-4">
              {profileEditOpen ? (
                <div className="text-left space-y-3 rounded-xl border border-[#eee] bg-[#fafaf9] p-3 mb-2">
                  <p className="text-xs font-medium text-[#5a5a5a]">
                    Your name / number
                  </p>
                  <label className="block" htmlFor="flaky-profile-name-result">
                    <span className="text-xs text-[#8a8a8a]">Name</span>
                    <input
                      id="flaky-profile-name-result"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={profileDraft}
                      onChange={(e) => setProfileDraft(e.target.value)}
                      className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-base text-[#3d3d3d] bg-transparent"
                    />
                  </label>
                  <p className="text-xs text-[#8a8a8a] leading-relaxed">
                    Number:{" "}
                    <span className="text-[#6a6a6a]">
                      {displayMaskedSelf(phone, phoneRegion)}
                    </span>
                    {" · "}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={signOut}
                      className="text-[#8a8a8a] underline decoration-[#ccc] underline-offset-2 hover:text-[#5a5a5a] disabled:opacity-50"
                    >
                      Use a different number
                    </button>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void saveProfileFromHeader()}
                      className="flex-1 py-2.5 bg-[#e07a5f] text-white rounded-xl text-sm font-medium hover:bg-[#d06a4f] disabled:opacity-50"
                    >
                      {loading ? "..." : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setProfileEditOpen(false);
                        setProfileDraft(profileName);
                      }}
                      className="flex-1 py-2.5 border border-[#ddd] text-[#5a5a5a] rounded-xl text-sm font-medium hover:bg-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setProfileDraft(profileName);
                    setProfileEditOpen(true);
                    setError("");
                  }}
                  className="group mb-2 w-full max-w-full min-w-0 rounded-lg px-1 py-1.5 text-center text-xs leading-relaxed text-[#8a8a8a] transition-colors hover:bg-[#faf8f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a5f]/40"
                >
                  <span className="text-[#8a8a8a]">Signed in as </span>
                  <span className="whitespace-normal break-words font-medium text-[#6a6a6a] underline decoration-[#ccc] underline-offset-2 transition-colors group-hover:text-[#e07a5f] group-hover:decoration-[#e07a5f]">
                    {profileName ? (
                      <>
                        {profileName}
                        <span className="font-normal text-[#a3a3a3] group-hover:text-[#e07a5f]/70"> · </span>
                      </>
                    ) : null}
                    {displayMaskedSelf(phone, phoneRegion)}
                  </span>
                </button>
              )}
              {result.mutual ? (
                <>
                  <div className="text-5xl" aria-hidden="true">
                    🛋️
                  </div>
                  <h2 className="text-xl font-bold text-[#3d3d3d]">
                    It&apos;s mutual!
                  </h2>
                  <p className="text-[#6a6a6a] leading-relaxed">
                    {result.message}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-5xl" aria-hidden="true">
                    🤫
                  </div>
                  <h2 className="text-xl font-bold text-[#3d3d3d]">
                    Secret&apos;s safe
                  </h2>
                  <p className="text-[#6a6a6a] leading-relaxed">
                    If they feel the same way, we&apos;ll let you know.
                  </p>
                </>
              )}
              <button
                onClick={resetFlake}
                className="w-full py-3 bg-[#81b29a] text-white rounded-xl font-medium hover:bg-[#71a28a] active:bg-[#619278] transition-colors"
              >
                {result.mutual ? "Nice" : "Done"}
              </button>
            </div>
          ) : null}
        </div>

        {token &&
        (step === "flake" || step === "result") &&
        myCancellations.length > 0 ? (
          <ul className="mt-8 space-y-7">
            {myCancellations.map((item) => {
              const rowKey = myCancellationRowKey(item);
              const undoBusy = undoingFlakeKey === rowKey;
              return (
                <li
                  key={rowKey}
                  className="flex items-start gap-3"
                >
                  <CancelProgressPie
                    cancelledCount={item.cancelledCount}
                    totalPeople={item.totalPeople}
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-[#3d3d3d]">
                      {formatPlanDate(item.date)}
                    </p>
                    <p className="text-xs text-[#8a8a8a] mt-0.5 leading-relaxed">
                      {item.mutual ? (
                        <span className="text-[#5a7d6c]">
                          Everyone wanted out — you&apos;re covered
                        </span>
                      ) : (
                        <>{youAndMoreWantToCancel(item.cancelledCount)}</>
                      )}
                    </p>
                    <p className="text-xs text-[#6a6a6a] mt-1.5 leading-relaxed">
                      {[...(item.participants ?? [])]
                        .sort((a, b) => {
                        const self = normalizePhone(phone, phoneRegion);
                        const ay = self && a === self ? 0 : 1;
                        const by = self && b === self ? 0 : 1;
                        return ay - by || a.localeCompare(b);
                      })
                      .map((p) =>
                        formatParticipantForList(
                          phone,
                          p,
                          profileNames,
                          phoneRegion
                        )
                      )
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loading || undoBusy}
                    onClick={() => void handleUndoFlake(item)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#81b29a] text-[#5a7d6c] hover:bg-[#e8f2ec] active:bg-[#dceee4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-0.5"
                    aria-label="Take back — I do not want to cancel anymore"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      className="h-5 w-5"
                      aria-hidden
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => {}}
            className="text-xs text-[#bbb] hover:text-[#888] transition-colors"
          >
            Feedback
          </button>
        </div>
        </div>
      </div>
    </main>
  );
}
