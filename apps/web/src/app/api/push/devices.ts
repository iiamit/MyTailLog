import { sendPush, type PushMessage, type PushOutcome } from "./apns";
import { sendFcm } from "./fcm";

export type Device = { token: string; platform: string };

export function tokensByPlatform(devices: Device[]): { ios: string[]; android: string[] } {
  return {
    ios: devices.filter((d) => d.platform === "ios").map((d) => d.token),
    android: devices.filter((d) => d.platform === "android").map((d) => d.token),
  };
}

export async function sendToDevices(devices: Device[], msg: PushMessage): Promise<PushOutcome> {
  const { ios, android } = tokensByPlatform(devices);
  const [apple, google] = await Promise.all([sendPush(ios, msg), sendFcm(android, msg)]);
  return {
    sent: apple.sent + google.sent,
    dead: [...apple.dead, ...google.dead],
    error: [apple.error, google.error].filter(Boolean).join("; ") || undefined,
  };
}
