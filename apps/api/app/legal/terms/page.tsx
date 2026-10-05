import type { Metadata } from "next";
import { legal } from "../operator";

export const metadata: Metadata = { title: "Terms of Service · Stall" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="text-sm opacity-70">Last updated {legal.updated}</p>

      <p>
        These terms are an agreement between you and {legal.entity()} (&ldquo;we&rdquo;) for using the Stall apps and
        the marketplaces built on it. By creating an account or using the apps you accept them.
      </p>

      <h2>1. Accounts</h2>
      <ul>
        <li>You must be 18 or older and give accurate information. One person, one account.</li>
        <li>You sign in with your phone number. Keep your phone and one-time codes private; you are responsible for activity on your account.</li>
        <li>We may suspend or close accounts that break these terms, the law, or put other users at risk.</li>
      </ul>

      <h2>2. Our role</h2>
      <p>
        Stall is a marketplace. Sellers list and sell their own goods; we provide the platform, payments handling,
        delivery coordination and dispute resolution. Unless a listing says otherwise, the contract of sale is between
        the buyer and the seller.
      </p>

      <h2>3. Selling</h2>
      <ul>
        <li>Sellers must complete verification (KYC) and keep business details accurate.</li>
        <li>Listings must be truthful: real photos, accurate condition, price and stock. No prohibited, counterfeit, stolen, unsafe or illegal items.</li>
        <li>Sellers must fulfil accepted orders on time and hand items to couriers properly packaged.</li>
        <li>Platform fees and commissions are shown in the seller app before you list and may change with notice.</li>
        <li>If you allow it, signed-in buyers can reveal your business phone number. You can turn this off in shop settings.</li>
      </ul>

      <h2>4. Buying and payment</h2>
      <ul>
        <li>Prices are shown before checkout, including delivery fees. Payment is taken when you place the order and held until delivery is confirmed.</li>
        <li>Card and mobile-money payments are processed by our payment partners. Wallet balances can only be used on the platform and withdrawn as the app allows.</li>
      </ul>

      <h2>5. Delivery</h2>
      <p>
        Couriers on the platform collect from the seller and deliver to the address and pin you set. Delivery times are
        estimates. Please be available to receive your order; failed deliveries may incur a fee.
      </p>

      <h2>6. Cancellations, returns and refunds</h2>
      <ul>
        <li>You can cancel before the seller dispatches the order for a full refund.</li>
        <li>If an item doesn&rsquo;t arrive, arrives damaged, or is materially different from its listing, open a dispute or return request in the app promptly after delivery. We review evidence from both sides and may refund to your original payment method or wallet.</li>
        <li>Sellers may offer additional return policies on their listings.</li>
      </ul>

      <h2>7. Inverse Draw</h2>
      <p>
        Where available, Inverse Draw has its own rules shown in the app before you take part. Those rules form part of
        these terms. The feature is not offered where it is not permitted.
      </p>

      <h2>8. Acceptable use</h2>
      <p>
        Don&rsquo;t misuse the platform: no fraud, harassment, spam, scraping, attempts to bypass payments or move
        transactions off-platform to avoid fees, or interfering with the service&rsquo;s security.
      </p>

      <h2>9. Content</h2>
      <p>
        You keep ownership of what you upload, and give us a licence to host and display it to run and promote the
        marketplace. You confirm you have the right to upload it.
      </p>

      <h2>10. Liability</h2>
      <p>
        We provide the platform as is. To the extent the law allows, we are not liable for indirect losses, or for
        sellers&rsquo; goods beyond the dispute and refund process above. Nothing in these terms limits rights you have
        under consumer protection law.
      </p>

      <h2>11. Changes and law</h2>
      <p>
        We may update these terms; significant changes will be notified in the app. These terms are governed by the
        laws of Ghana.
      </p>

      <h2>12. Contact</h2>
      <p>
        {legal.entity()}, {legal.address()}. Email: {legal.email()}.
      </p>
    </article>
  );
}
