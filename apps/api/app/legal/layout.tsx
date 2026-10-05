import Link from "next/link";

/**
 * Public legal pages (privacy policy, terms) linked from the app and the
 * Play/App Store listings. Served by the API host, e.g.
 * https://api.<domain>/legal/privacy — outside /api, so no auth/platform
 * middleware applies.
 *
 * Operator details come from env so the same build serves every deployment:
 * LEGAL_ENTITY_NAME, LEGAL_ENTITY_ADDRESS, SUPPORT_EMAIL. Unset values render
 * as bracketed placeholders — fill them in before submitting to the stores.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 leading-relaxed [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-3 [&_ul]:my-3">
      <nav className="mb-8 flex gap-4 text-sm opacity-70">
        <Link href="/legal/privacy">Privacy Policy</Link>
        <Link href="/legal/terms">Terms of Service</Link>
      </nav>
      {children}
    </main>
  );
}
