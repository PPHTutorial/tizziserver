import Link from "next/link";

/** The API host's root — a plain pointer page (the product is the mobile app). */
export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-2xl font-bold">Stall</h1>
      <p className="mt-2 opacity-70">Marketplace and delivery platform API.</p>
      <nav className="mt-6 flex gap-4 text-sm underline">
        <Link href="/legal/privacy">Privacy Policy</Link>
        <Link href="/legal/terms">Terms of Service</Link>
      </nav>
    </main>
  );
}
