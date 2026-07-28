"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Sparkles, ChevronsLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, visibleNav } from "@/lib/nav";
import { useCan, useCanSeeSalesModule } from "@/components/session-context";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const can = useCan();
  const canSeeSalesModule = useCanSeeSalesModule();

  const visible = visibleNav({ can, canSeeSalesModule });

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-info text-white shadow-md shadow-primary/30">
          <Sparkles className="size-5" />
        </div>
        {!collapsed && (
          <div className="flex-1 overflow-hidden">
            <div className="truncate font-bold leading-tight">Elenor OS</div>
            <div className="truncate text-[11px] text-muted-foreground">Marketing Agency</div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      {/* nav */}
      <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {NAV_SECTIONS.map((section) => {
          const items = visible.filter((i) => i.section === section);
          if (!items.length) return null;
          return (
            <div key={section}>
              {!collapsed && (
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  // A section index (/sales) is a prefix of all of its children,
                  // so prefix-matching alone would light it up on every
                  // sub-page. It stays active only on an exact match when a
                  // more specific sibling exists.
                  const hasDeeperSibling = visible.some(
                    (other) => other !== item && other.href.startsWith(item.href + "/")
                  );
                  const active = hasDeeperSibling
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground",
                        collapsed && "justify-center"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute left-0 h-5 w-1 rounded-r-full bg-primary"
                        />
                      )}
                      <Icon name={item.icon} className="size-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mb-3 rotate-180 rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <ChevronsLeft className="size-4" />
        </button>
      )}
    </aside>
  );
}
