import type { NextConfig } from "next";
import path from "path";

// Bundler mechanism (a), locked: widen turbopack.root to the repo root so this app
// can import the shared, UI-free pricing/kind model from /shared via the @shared/*
// tsconfig alias. See the note atop /shared/listingPricing.ts for why (b) (a
// workspace package) was rejected. Trade-off: `next dev` watches the repo root.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
