"use client";

import { useEffect, useState } from "react";

function contactsPickerAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & {
    contacts?: { select?: unknown };
  };
  return typeof n.contacts?.select === "function";
}

function sanitizePickedTel(raw: string): string {
  let s = raw.trim();
  if (s.toLowerCase().startsWith("tel:")) {
    s = s.slice(4).trim();
  }
  return s;
}

async function pickFirstPhoneFromContacts(): Promise<string | null> {
  const n = navigator as Navigator & {
    contacts?: {
      select: (
        properties: string[],
        options: { multiple: boolean }
      ) => Promise<{ tel?: string[] }[]>;
    };
  };
  const contacts = n.contacts;
  if (!contacts?.select) return null;
  const selected = await contacts.select(["tel"], { multiple: false });
  const raw = selected[0]?.tel?.find((t) => t?.trim());
  if (!raw) return null;
  return sanitizePickedTel(raw);
}

function FillFromContactsButton({
  onFilled,
  disabled,
}: {
  onFilled: (value: string) => void;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const supported =
    typeof navigator !== "undefined" && contactsPickerAvailable();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || picking}
        onClick={async () => {
          setHint(null);
          if (!supported) {
            setHint(
              "Opening your address book only works in Chrome on Android over HTTPS. On this device, tap the number field — your keyboard or password manager can suggest a saved number."
            );
            return;
          }
          setPicking(true);
          try {
            const picked = await pickFirstPhoneFromContacts();
            if (picked) onFilled(picked);
          } catch {
            /* cancelled or denied */
          } finally {
            setPicking(false);
          }
        }}
        className="w-full py-3 rounded-xl font-medium border-2 border-[#81b29a] text-[#5a7d6c] bg-[#f4f9f6] hover:bg-[#e8f2ec] active:bg-[#dceee4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {picking ? "Opening contacts…" : "Fill from contacts"}
      </button>
      {hint && (
        <p className="text-xs text-[#8a8a8a] leading-relaxed" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Calendar date in local timezone (YYYY-MM-DD). Avoids UTC vs local mismatch from toISOString(). */
function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Step = "phone" | "code" | "flake" | "result";

interface FlakeResult {
  mutual: boolean;
  message: string;
}

const TOKEN_KEY = "flaky-token";

export default function Home() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [targetPhones, setTargetPhones] = useState<string[]>([""]);
  const [date, setDate] = useState(() => localYmd());
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<FlakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);

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
        const data: { phone?: string } = await res.json();
        if (cancelled) return;
        setToken(stored);
        if (data.phone) setPhone(data.phone);
        setStep("flake");
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

  const signOut = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPhone("");
    setCode("");
    setError("");
    setStep("phone");
  };

  const handleSendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
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

  const handleVerifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      setToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      setStep("flake");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFlake = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/flake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetPhones: targetPhones.map((t) => t.trim()).filter(Boolean),
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) signOut();
        throw new Error(data.error || "Something went wrong");
      }
      setResult(data);
      setStep("result");
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
    setStep("flake");
  };

  return (
    <main className="h-dvh max-h-dvh overflow-y-auto overscroll-none bg-gradient-to-b from-[#faf8f5] to-[#f0ece6]">
      <div className="flex min-h-full items-start justify-center px-4 pb-4 pt-14">
        <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#3d3d3d] tracking-tight">
            flaky
          </h1>
          <p className="text-[#8a8a8a] mt-1 text-sm">
            cancel plans, guilt-free
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
                  placeholder="+1 (555) 123-4567"
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                />
              </label>
              <FillFromContactsButton
                onFilled={setPhone}
                disabled={loading}
              />
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
          ) : step === "flake" ? (
            <div className="space-y-4">
              <p className="text-xs text-[#8a8a8a] text-center">
                Signed in with{" "}
                <span className="font-medium text-[#6a6a6a]">{phone}</span>
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#5a5a5a]">
                    Their phone numbers
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      setTargetPhones((prev) => [...prev, ""])
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#81b29a] text-[#5a7d6c] text-xl font-medium leading-none hover:bg-[#e8f2ec] active:bg-[#dceee4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Add another number"
                  >
                    +
                  </button>
                </div>
                {targetPhones.map((targetPhone, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex gap-2 items-end">
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
                          placeholder="+1 (555) 987-6543"
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
                  </div>
                ))}
                <FillFromContactsButton
                  onFilled={(value) =>
                    setTargetPhones((prev) => {
                      const empty = prev.findIndex((t) => !t.trim());
                      if (empty >= 0) {
                        const next = [...prev];
                        next[empty] = value;
                        return next;
                      }
                      const next = [...prev];
                      next[next.length - 1] = value;
                      return next;
                    })
                  }
                  disabled={loading}
                />
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
              <button
                type="button"
                onClick={signOut}
                className="w-full py-2 text-sm text-[#8a8a8a] hover:text-[#5a5a5a] transition-colors"
              >
                Use a different number
              </button>
            </div>
          ) : step === "result" && result ? (
            <div className="text-center space-y-4 py-4">
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
