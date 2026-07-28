"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import * as Icons from "lucide-react";
import { Search, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { visibleNav } from "@/lib/nav";
import { useCan, useCanSeeSalesModule } from "@/components/session-context";
import type { PermissionKey } from "@/lib/rbac";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

type SearchHit = {
  type: "lead" | "client" | "contact" | "proposal" | "meeting" | "idea" | "task" | "project" | "employee";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

/** Icon and heading per result type — one map so groups and rows stay in step. */
const HIT_META: Record<SearchHit["type"], { icon: string; group: string }> = {
  lead: { icon: "UserSearch", group: "Leads" },
  contact: { icon: "User", group: "Contacts" },
  client: { icon: "Building2", group: "Clients" },
  proposal: { icon: "FileBadge", group: "Proposals" },
  meeting: { icon: "CalendarClock", group: "Meetings" },
  idea: { icon: "Lightbulb", group: "Ideas" },
  task: { icon: "CheckSquare", group: "Tasks" },
  project: { icon: "FolderKanban", group: "Projects" },
  employee: { icon: "Users", group: "People" },
};

const HIT_ORDER: SearchHit["type"][] = [
  "lead", "contact", "client", "proposal", "meeting", "idea", "task", "project", "employee",
];

/**
 * Quick actions. Each carries the permission that makes it reachable, so the
 * palette never offers something the API would refuse.
 *
 * `href` values map to routes that read these query params and open the matching
 * dialog on mount — the palette does not need to know how each form works.
 */
const ACTIONS: {
  label: string;
  icon: string;
  href: string;
  permission?: PermissionKey;
  /** Also requires Sales workspace access — see visibleNav / canSeeSalesModule. */
  requiresSalesModule?: boolean;
}[] = [
  { label: "Create Lead", icon: "Plus", href: "/sales/leads?new=1", permission: "Sales.LeadCreate", requiresSalesModule: true },
  { label: "Create Meeting", icon: "CalendarPlus", href: "/sales/meetings?new=1", permission: "Sales.MeetingManage", requiresSalesModule: true },
  { label: "Create Discovery Brief", icon: "ClipboardList", href: "/sales/discovery?new=1", permission: "Sales.DiscoverySubmit", requiresSalesModule: true },
  { label: "Create Sales Feedback", icon: "MessageSquareText", href: "/sales/feedback?new=1", permission: "Sales.FeedbackSubmit", requiresSalesModule: true },
  { label: "Create Proposal", icon: "FileBadge", href: "/sales/proposals?new=1", permission: "Sales.ProposalManage", requiresSalesModule: true },
  { label: "Create Idea", icon: "Lightbulb", href: "/sales/ideas?new=1", permission: "Sales.IdeaManage", requiresSalesModule: true },
  { label: "Open Pipeline", icon: "Columns3", href: "/sales/pipeline", permission: "Sales.View", requiresSalesModule: true },
  { label: "Open Sales Dashboard", icon: "Gauge", href: "/sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Search Leads", icon: "UserSearch", href: "/sales/leads", permission: "Sales.View", requiresSalesModule: true },
  { label: "Search Clients", icon: "Building2", href: "/sales/clients", permission: "Sales.View", requiresSalesModule: true },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const can = useCan();
  const canSeeSalesModule = useCanSeeSalesModule();

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // expose an opener for the topbar button
  React.useEffect(() => {
    (window as any).__openCommandPalette = () => setOpen(true);
  }, []);

  // Debounced so typing does not fire a query per keystroke; 200ms is below the
  // threshold where the list feels laggy but well above a burst of keypresses.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => apiGet<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    // The API ignores anything shorter than 2 characters, so do not ask.
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const navItems = visibleNav({ can, canSeeSalesModule });
  const actions = ACTIONS.filter((a) => {
    if (a.requiresSalesModule && !canSeeSalesModule) return false;
    return !a.permission || can(a.permission);
  });
  const hits = data?.hits ?? [];

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  // Reset the query when closing so the next open starts clean.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[15vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* shouldFilter=false: results come pre-filtered from the server, and
                cmdk's own fuzzy match would hide server hits whose relevance it
                cannot see (a lead matched on its contact's email, say). */}
            <Command className="w-full" loop shouldFilter={false}>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search leads, clients, tasks, people…"
                  className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {isFetching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
                  ESC
                </kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  {debounced.length >= 2 && !isFetching ? "No results found." : "Type to search…"}
                </Command.Empty>

                {/* Server results first: when someone types, they are looking for
                    a record, not a page. */}
                {HIT_ORDER.map((type) => {
                  const group = hits.filter((h) => h.type === type);
                  if (!group.length) return null;
                  return (
                    <Command.Group
                      key={type}
                      heading={HIT_META[type].group}
                      className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                    >
                      {group.map((hit) => (
                        <Command.Item
                          key={`${hit.type}-${hit.id}`}
                          value={`${hit.type}-${hit.id}`}
                          onSelect={() => go(hit.href)}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                        >
                          <Icon name={HIT_META[hit.type].icon} className="size-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{hit.title}</span>
                          {hit.subtitle && (
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}

                {/* Actions and navigation are filtered client-side against the
                    raw query, since they are a small static list. */}
                {actions.filter((a) => matches(a.label, query)).length > 0 && (
                  <Command.Group
                    heading="Actions"
                    className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                  >
                    {actions.filter((a) => matches(a.label, query)).map((action) => (
                      <Command.Item
                        key={action.href}
                        value={action.label}
                        onSelect={() => go(action.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <Icon name={action.icon} className="size-4 shrink-0 text-muted-foreground" />
                        {action.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {navItems.filter((i) => matches(i.label, query)).length > 0 && (
                  <Command.Group
                    heading="Navigation"
                    className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                  >
                    {navItems.filter((i) => matches(i.label, query)).map((item) => (
                      <Command.Item
                        key={item.href}
                        value={`nav-${item.href}`}
                        onSelect={() => go(item.href)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <Icon name={item.icon} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{item.label}</span>
                        {item.section && (
                          <span className="shrink-0 text-xs text-muted-foreground">{item.section}</span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Case-insensitive substring match; an empty query matches everything. */
function matches(label: string, query: string) {
  const q = query.trim().toLowerCase();
  return !q || label.toLowerCase().includes(q);
}
