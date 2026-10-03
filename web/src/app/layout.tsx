import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
});

const condensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-condensed",
});

export const metadata: Metadata = {
  title: "DOCKZ, le marché de l’entrepôt en Île-de-France",
  description:
    "Parc des grands entrepôts, prospects et ventes de locaux d’activité en Île-de-France, sur données publiques.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${barlow.variable} ${condensed.variable}`}>
      <body className="font-sans antialiased">
        <Nav />
        <main>{children}</main>
        <footer className="mt-16 border-t border-encre/15">
          <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-gris sm:px-6">
            <p>
              Données publiques sous Licence Ouverte : INSEE, Géorisques, DGFiP. ERBC est une société
              fictive créée pour ce projet.
            </p>
            <p className="mt-1">
              <a className="underline hover:text-encre" href="https://github.com/heykelh/dockz">
                Code source sur GitHub
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
