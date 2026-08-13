import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone/server.js with only the traced
  // dependencies — what the Docker runtime stage ships (see Dockerfile).
  // No effect on `npm run dev`; `npm start` still works as before.
  output: "standalone",
};

export default nextConfig;
