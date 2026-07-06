// Security headers (P2). CSP is compatible with:
//   - Google Fonts (fonts.googleapis.com stylesheet + fonts.gstatic.com files)
//   - Plaid Link (cdn.plaid.com script + *.plaid.com connect/frame)
//   - Supabase (*.supabase.co over https/wss)
// 'unsafe-inline'/'unsafe-eval' on script-src are required by Next's runtime and
// inline theme/no-flash scripts; tightening to nonces is a later hardening step.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.plaid.com https://production.plaid.com https://sandbox.plaid.com",
  "frame-src 'self' https://cdn.plaid.com https://*.plaid.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // lowdb writes to data/db.json at server runtime — mark it as an external
  // package so Next.js doesn't try to bundle it. On Next 14 this option lives
  // under experimental.serverComponentsExternalPackages (renamed to
  // serverExternalPackages in Next 15).
  experimental: {
    serverComponentsExternalPackages: ["lowdb"],
    // Tree-shake big icon/chart libs so each page only ships the icons/parts it
    // uses — smaller bundles + faster dev compiles.
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
