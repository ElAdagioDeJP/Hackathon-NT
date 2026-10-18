import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function AppSidebar({
  current,
  label,
  children,
  note,
}: {
  current: "profile" | "tenders";
  label: string;
  children?: ReactNode;
  note: ReactNode;
}) {
  return (
    <aside className="sidebar" aria-label={label}>
      <Link href="/" className="brand" aria-label="Gara Facile home">
        <Image
          className="brand-mark"
          src="/brand/gara-facile-mark.png"
          alt=""
          width={40}
          height={40}
          sizes="40px"
          preload
        />
        gara facile
      </Link>
      <p className="sidebar-intro">Tenders that fit.</p>
      <nav className="workspace-nav" aria-label="Workspace">
        <Link href="/" aria-current={current === "profile" ? "page" : undefined}>
          Business profile
        </Link>
        <Link href="/#matches">Matches</Link>
        <Link
          href="/tenders"
          aria-current={current === "tenders" ? "page" : undefined}
        >
          Tenders
        </Link>
      </nav>
      {children}
      <div className="sidebar-note">{note}</div>
    </aside>
  );
}
