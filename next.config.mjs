/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The capture PWA and service worker are registered client-side (see
  // public/manifest.webmanifest and src/app/capture). Headers below let the
  // manifest and service worker be served with the right scope.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
