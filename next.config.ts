import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // shadcn/ui components import from the "radix-ui" package, which re-exports
  // every Radix primitive. This makes the bundler include only the ones used.
  experimental: { optimizePackageImports: ["radix-ui"] },
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ]);
  },
};
export default config;
