"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Flags } from "@/lib/contracts";
import { Badge, cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/runs/new", label: "New run" },
  { href: "/history", label: "History" },
];

export function TopBar() {
  const path = usePathname();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      api
        .flags()
        .then((f) => alive && (setFlags(f), setDown(false)))
        .catch(() => alive && setDown(true));
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Spatial SOC</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-sunken text-ink" : "text-muted hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {down ? (
            <Badge tone="danger">core offline</Badge>
          ) : flags ? (
            <>
              <Badge tone={flags.USE_LLM ? "accent" : "muted"} title="USE_LLM">
                {flags.USE_LLM ? `live · ${flags.model}` : "replay mode"}
              </Badge>
              <Badge tone="muted" title="USE_N8N">gates: {flags.gates}</Badge>
              <Badge tone={flags.sandbox === "docker" ? "ok" : "warn"} title="USE_SANDBOX">
                sandbox: {flags.sandbox}
              </Badge>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
      <rect width="28" height="28" rx="8" fill="#0F172A" />
      <rect x="6" y="15" width="4" height="7" rx="1" fill="#A9C1FF" />
      <rect x="12" y="10" width="4" height="12" rx="1" fill="#D9DFE8" />
      <rect x="18" y="13" width="4" height="9" rx="1" fill="#A9C1FF" />
      <circle cx="14" cy="6.5" r="2.4" fill="#2F6BFF" />
    </svg>
  );
}
