"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Moon, Sun, LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme-provider";
import { useSession } from "@/components/session-context";
import { NotificationBell } from "./notifications";
import { ROLE_META } from "@/lib/rbac";

export function Topbar() {
  const { theme, toggle } = useTheme();
  const user = useSession();
  const router = useRouter();
  const [menu, setMenu] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // z-30: backdrop-blur creates a stacking context that would otherwise trap
  // this header's dropdowns below <main>. Raising the header lets them paint
  // over page content.
  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      {/* command palette trigger */}
      <button
        onClick={() => (window as any).__openCommandPalette?.()}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] sm:flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <button
        onClick={toggle}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Toggle theme"
      >
        {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>

      <NotificationBell />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-accent"
        >
          <Avatar firstName={user.firstName} lastName={user.lastName} src={user.avatarUrl} size={30} />
          <div className="hidden text-left md:block">
            <div className="text-sm font-medium leading-tight">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              {ROLE_META[user.roleKey].name}
            </div>
          </div>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            >
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-medium">{user.firstName} {user.lastName}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </div>
              <div className="p-1.5">
                <Link
                  href={`/employees/${user.id}`}
                  onClick={() => setMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                >
                  <UserIcon className="size-4" /> My Profile
                </Link>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
