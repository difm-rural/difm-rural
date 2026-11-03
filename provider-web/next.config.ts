import type { NextConfig } from "next";
import path from "path";

// Bundler mechanism (a), locked: widen turbopack.root to the repo root so this app
// can import the shared, UI-free pricing/kind model from /shared via the @shared/*
// tsconfig alias. See the note atop /shared/listingPricing.ts for why (b) (a
// workspace package) was rejected. Trade-off: `next dev` watches the repo root.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {source:'/saved-searches',destination:'/account/interests',permanent:false},
      {source:'/saved-jobs',destination:'/jobs/saved',permanent:false},
    ]
  },
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
