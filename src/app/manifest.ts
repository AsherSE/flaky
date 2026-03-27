import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "flaky — cancel plans, guilt-free",
    short_name: "flaky",
    description:
      "Secretly flag that you want to cancel. If they feel the same, you're both off the hook.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#e07a5f",
    icons: [
      {
        src: "/logo.png",
        sizes: "650x662",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "650x662",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
