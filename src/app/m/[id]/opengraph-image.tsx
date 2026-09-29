import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPlan } from "@/lib/plan";
import { formatPlanDateForLocale } from "@/lib/plan-date";

export const runtime = "nodejs";
export const alt = "Plans on flaky";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link preview for an invite. Messages and WhatsApp render this as a card
 * when the link is dropped into a chat, so it names the day and who set it up.
 * Link previews have no locale to go on, so the date is written unambiguously.
 */
export default async function Image({ params }: { params: { id: string } }) {
  const plan = await getPlan(params.id);
  const logoBuffer = await readFile(join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const headline = plan
    ? plan.mutual
      ? "This one's off"
      : `Plans on ${formatPlanDateForLocale(plan.date, "en-US")}`
    : "Plans on flaky";
  const sub = plan
    ? plan.mutual
      ? "Everyone wanted out. Guilt-free."
      : `${plan.creator || "Someone"} penciled you in · tap to join`
    : "cancel plans, guilt-free";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(to bottom, #faf8f5, #f0ece6)",
          color: "#3d3d3d",
        }}
      >
        <img src={logoSrc} alt="" width={157} height={160} />
        <div style={{ marginTop: 36, fontSize: 72, fontWeight: 700 }}>
          {headline}
        </div>
        <div style={{ marginTop: 18, fontSize: 38, color: "#7a7a7a" }}>
          {sub}
        </div>
      </div>
    ),
    { ...size }
  );
}
