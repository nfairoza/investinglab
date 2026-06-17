/** @type {import('next').NextConfig} */
const nextConfig = {
  // lowdb writes to data/db.json at server runtime — mark it as an external
  // package so Next.js doesn't try to bundle it. On Next 14 this option lives
  // under experimental.serverComponentsExternalPackages (renamed to
  // serverExternalPackages in Next 15).
  experimental: {
    serverComponentsExternalPackages: ["lowdb"],
  },
};
export default nextConfig;
