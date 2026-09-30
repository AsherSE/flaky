import type { Config } from "tailwindcss";
import tokens from "./design-system/tokens.json";

// Every colour token in design-system/tokens.json becomes a Tailwind colour
// (`bg-terracotta`, `text-ink-2`, `border-line-card`…). flaky ships a single
// light theme, so each token has one value.
const colors = Object.fromEntries(
  tokens.color.tokens.map((t) => [t.name, t.value])
);

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors,
    },
  },
  plugins: [],
};

export default config;
