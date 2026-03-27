/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid corrupted webpack filesystem cache in dev (missing chunk *.js, 500s, "missing required error components").
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
