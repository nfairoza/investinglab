/** @type {import('next').NextConfig} */
const nextConfig = {
  // lowdb writes to data/db.json at server runtime — mark it as an external
  // package so Next.js doesn't try to bundle it for the Edge runtime.
  serverExternalPackages: ["lowdb"],
};
export default nextConfig;
