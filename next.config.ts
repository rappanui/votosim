import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // The root tsconfig.json reaches everything under the repo, so `next build`
    // was type-checking scripts/, supabase/ and modules/ — three toolchains the
    // Next compiler does not own. modules/ runs on tsx/node --test, where the
    // `.ts` import suffix is correct; supabase/ runs on Deno. Their errors are
    // artifacts of the wrong compiler, not defects. Point the build at the same
    // config `npm run typecheck` uses, which excludes all three.
    tsconfigPath: "tsconfig.app.json",
  },
};

export default nextConfig;
