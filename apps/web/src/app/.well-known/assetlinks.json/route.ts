// Android Digital Asset Links: verifies the native app (apps/android, AndroidManifest autoVerify filters)
// for https://mytaillog.com/app/... links. The fingerprint is Play's app signing key (public, not a secret).
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.mytaillog.app",
          sha256_cert_fingerprints: [
            "ED:58:47:C3:B1:25:FC:02:43:3C:3C:EC:00:5D:44:13:C4:5B:8F:62:6B:88:77:8B:8C:33:65:91:FE:73:7A:C4",
          ],
        },
      },
    ],
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
