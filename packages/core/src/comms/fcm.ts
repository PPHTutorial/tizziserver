/**
 * Firebase Admin SDK bootstrap for push notifications. Lazily initializes a
 * single app instance the first time a push is actually sent — a no-op
 * (`getFcmMessaging()` returns `null`) until `FCM_PROJECT_ID`,
 * `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` are all set, matching the same
 * sandbox-by-default pattern as `payments/mock.ts` and `storage/mock.ts`.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { env } from "@stall/config";

let messaging: Messaging | null | undefined;

export function getFcmMessaging(): Messaging | null {
  if (messaging !== undefined) return messaging;

  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    messaging = null;
    return messaging;
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: env.FCM_PROJECT_ID,
        clientEmail: env.FCM_CLIENT_EMAIL,
        // .env stores literal "\n" in the PEM — Firebase's SDK needs real newlines.
        privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  messaging = getMessaging(app);
  return messaging;
}
