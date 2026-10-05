import type { Metadata } from "next";
import { env } from "@stall/config";
import { legal } from "../operator";

export const metadata: Metadata = { title: "Privacy Policy · Stall" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const graceDays = env.ACCOUNT_DELETION_GRACE_DAYS;
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-sm opacity-70">Last updated {legal.updated}</p>

      <p>
        This policy explains what {legal.entity()} (&ldquo;we&rdquo;) collects when you use the Stall apps and
        marketplaces built on it (such as GrandPrice and Tizzi Gas), why, who we share it with, and the choices you
        have. We process personal data in line with the Ghana Data Protection Act, 2012 (Act 843) and other laws that
        apply to you.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong>: phone number (used to sign in by one-time code), name, and optionally email and profile photo.</li>
        <li><strong>Addresses and location</strong>: delivery addresses you save; your device location when you choose to share it (to show nearby sellers or set a delivery pin); for couriers, live location while on a delivery; for sellers, the shop location you set.</li>
        <li><strong>Photos and video</strong>: images and videos you upload (product listings, shop logo and cover, profile photo) using your camera or gallery, only when you pick them.</li>
        <li><strong>Seller verification (KYC)</strong>: business details, registration number, identity document images and a selfie, used only to verify sellers.</li>
        <li><strong>Orders and payments</strong>: what you buy or sell, amounts, delivery details and wallet transactions. Card and mobile-money details are handled by our payment processor; we do not store full card numbers.</li>
        <li><strong>Messages</strong>: chats between buyers, sellers and couriers, and support or dispute conversations.</li>
        <li><strong>Seller phone numbers</strong>: if a seller allows it, signed-in buyers can tap &ldquo;Show number&rdquo; to see the seller&rsquo;s business phone. Each reveal is logged. Sellers can turn this off in shop settings.</li>
        <li><strong>Device and usage data</strong>: device identifiers for push notifications, sign-in history, app interactions (for example which sponsored items were shown or tapped), and crash or error reports.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account, sign you in securely and prevent fraud and abuse.</li>
        <li>To show listings, process orders and payments, arrange delivery and pay out sellers and couriers.</li>
        <li>To verify sellers and keep the marketplace safe, and to handle disputes, refunds and support.</li>
        <li>To send service messages (order, delivery and security notifications), and marketing only where you have agreed.</li>
        <li>To meet legal, tax and accounting obligations.</li>
      </ul>

      <h2>Who we share it with</h2>
      <ul>
        <li>The other side of your order: sellers see the buyer details needed to fulfil it; couriers see pickup and drop-off details.</li>
        <li>Service providers acting for us: payment processors, SMS and push-notification providers, maps and routing providers, cloud hosting, security and error monitoring. They may only use the data to provide their service.</li>
        <li>Authorities, when the law requires it or to protect people&rsquo;s safety.</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is active. If you delete your account, there is a {graceDays}-day grace
        period in which you can cancel; after that we remove or anonymise your personal data, except records we must
        keep by law (such as transaction and tax records) and security logs, which we keep for up to{" "}
        {env.AUDIT_LOG_RETENTION_DAYS} days.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Access and download your data from the app (Settings → Download my data).</li>
        <li>Delete your account from the app (Settings → Delete account).</li>
        <li>Correct your profile and shop details at any time.</li>
        <li>Turn off location, camera and photo permissions in your device settings; some features will not work without them.</li>
        <li>Opt out of marketing notifications in the app&rsquo;s notification settings.</li>
      </ul>
      <p>You may also contact us, or complain to the Data Protection Commission of Ghana.</p>

      <h2>Security</h2>
      <p>
        We use encryption in transit, hashed credentials, access controls and audit logging. No system is perfectly
        secure, so please keep your phone and sign-in codes private.
      </p>

      <h2>Children</h2>
      <p>Stall is not intended for anyone under 18, and we do not knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>We will post updates here and notify you in the app if the changes are significant.</p>

      <h2>Contact</h2>
      <p>
        {legal.entity()}, {legal.address()}. Email: {legal.email()}.
      </p>
    </article>
  );
}
