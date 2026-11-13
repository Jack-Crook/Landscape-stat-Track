"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Settings } from "lucide-react";
import { GROUPS, TABS } from "./nav-config";
import { PendingSpinner } from "@/components/kit/link-pending";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ businessName, reviewCount, userSlot }: { businessName: string; reviewCount: number; userSlot?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <aside className="material sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-separator md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-tint text-white" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22V12" />
            <path d="M12 12C12 7 8 4 3 4c0 5 3 8 9 8Z" />
            <path d="M12 14c0-4 3-7 9-7 0 4-3 7-9 7Z" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{businessName}</div>
          <div className="caption text-label-2">Business tracker</div>
        </div>
      </div>

      <Link href="/receipts/scan" className="pressable on-tint mx-4 mb-4 flex h-10 items-center justify-center gap-2 rounded-full bg-tint text-[15px] font-semibold text-white">
        <Camera className="h-4 w-4" strokeWidth={2.25} />
        Scan receipt
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {GROUPS.map((g, gi) => (
          <div key={gi} className="mb-4">
            {g.title && <div className="caption mb-1 px-2 font-semibold uppercase tracking-wide text-label-3">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "pressable flex items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-[15px] font-medium transition-colors",
                        active ? "bg-tint-soft text-tint-ink" : "text-label hover:bg-fill"
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px]", active ? "text-tint-ink" : "text-label-2")} strokeWidth={2} />
                      <span className="flex-1">{label}</span>
                      <PendingSpinner />
                      {href === "/receipts" && reviewCount > 0 && (
                        <span className="caption rounded-full bg-tint px-1.5 font-semibold text-white on-tint" aria-label={`${reviewCount} to review`}>
                          {reviewCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-separator px-4 py-3">
        <Link
          href="/settings"
          className={cn(
            "pressable flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[15px] font-medium",
            isActive(pathname, "/settings") ? "text-tint-ink" : "text-label-2 hover:text-label"
          )}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
          Settings
        </Link>
        {userSlot}
      </div>
    </aside>
  );
}

const MORE_PATHS = ["/more", "/quotes", "/invoices", "/clients", "/receipts", "/reports", "/tax", "/insights", "/settings"];

export function TabBar({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Tabs"
      className="material-strong fixed inset-x-0 bottom-0 z-40 border-t border-separator pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/more"
              ? MORE_PATHS.some((p) => isActive(pathname, p)) && !isActive(pathname, "/receipts/scan")
              : isActive(pathname, href);
          if (href === "/receipts/scan") {
            return (
              <li key={href} className="flex flex-1 justify-center">
                <Link href={href} aria-label="Scan a receipt" className="pressable on-tint -mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-tint text-white shadow-[var(--shadow-float)]">
                  <Icon className="h-6 w-6" strokeWidth={2.25} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("pressable relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium", active ? "text-tint-ink" : "text-label-2")}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.9} />
                {label}
                <span className="absolute left-[calc(50%+10px)] top-1.5">
                  <PendingSpinner className="h-3 w-3" />
                </span>
                {href === "/more" && reviewCount > 0 && (
                  <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-bad" aria-label={`${reviewCount} receipts to review`} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

