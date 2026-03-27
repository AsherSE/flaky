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
  const [supported, setSupported] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setSupported(contactsPickerAvailable());
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      disabled={disabled || picking}
      onClick={async () => {
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

export default function Home() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [date, setDate] = useState(() => localYmd());
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<FlakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      localStorage.setItem("flaky-token", data.token);
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
        body: JSON.stringify({ targetPhone, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
      setStep("result");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resetFlake = () => {
    setTargetPhone("");
    setDate(localYmd());
    setResult(null);
    setError("");
    setStep("flake");
  };

  return (
    <main className="h-dvh max-h-dvh overflow-y-auto overscroll-none bg-gradient-to-b from-[#faf8f5] to-[#f0ece6]">
      <div className="flex min-h-full items-center justify-center p-4">
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

          {step === "phone" && (
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
          )}

          {step === "code" && (
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
          )}

          {step === "flake" && (
            <div className="space-y-4">
              <label className="block" htmlFor="flaky-their-phone">
                <span className="text-sm font-medium text-[#5a5a5a]">
                  Their phone number
                </span>
                <input
                  id="flaky-their-phone"
                  name="recipient-tel"
                  type="tel"
                  autoComplete="section-other tel"
                  inputMode="tel"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="+1 (555) 987-6543"
                  className="mt-1 block w-full px-0 py-2 border-0 border-b-2 border-[#e0e0e0] focus:border-[#e07a5f] focus:ring-0 focus:outline-none text-lg text-[#3d3d3d] placeholder-[#ccc] bg-transparent transition-colors"
                />
              </label>
              <FillFromContactsButton
                onFilled={setTargetPhone}
                disabled={loading}
              />
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
                disabled={loading || !targetPhone.trim() || !date}
                className="w-full py-3 bg-[#e07a5f] text-white rounded-xl font-medium hover:bg-[#d06a4f] active:bg-[#c05a3f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "..." : "I want to cancel"}
              </button>
            </div>
          )}

          {step === "result" && result && (
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
          )}
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
