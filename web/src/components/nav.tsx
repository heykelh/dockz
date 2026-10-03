"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LIENS = [
  { href: "/", label: "Marché" },
  { href: "/prospection", label: "Prospection" },
  { href: "/qualite", label: "Qualité des données" },
  { href: "/methode", label: "Méthode" },
];

export function Nav() {
  const chemin = usePathname();

  return (
    <header className="border-b-4 border-encre bg-papier">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-x-8 gap-y-2 px-4 pt-4 sm:px-6">
        <Link href="/" className="pb-3">
          <span className="font-display text-3xl font-bold tracking-tight">DOCKZ</span>
          <span className="ml-3 text-sm text-gris">ERBC Industrial &amp; Logistics</span>
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="flex flex-wrap">
            {LIENS.map((lien) => {
              const actif = lien.href === "/" ? chemin === "/" : chemin.startsWith(lien.href);
              return (
                <li key={lien.href}>
                  <Link
                    href={lien.href}
                    aria-current={actif ? "page" : undefined}
                    className={`-mb-1 block border-b-4 px-3 pb-2 pt-1 font-medium ${
                      actif ? "border-poutre text-encre" : "border-transparent text-gris hover:text-encre"
                    }`}
                  >
                    {lien.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
