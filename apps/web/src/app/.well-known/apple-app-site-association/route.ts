// Apple App Site Association: lets the native iOS app (apps/ios) open email sign-in links
// at /app/auth/callback as Universal Links. Apple fetches it from the apex domain, unredirected,
// as JSON with no file extension. Team ID: apps/mobile/scripts/testflight.sh.
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: ["38Z53C8X48.com.mytaillog.app"],
            components: [
              { "/": "/app/auth/callback", comment: "Email sign-in link (link and code)" },
              { "/": "/app/a/*", comment: "Aircraft links from notifications, widgets and shares (apps/ios AppLinks.swift)" },
            ],
          },
        ],
      },
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
