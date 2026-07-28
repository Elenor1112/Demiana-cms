"use client";
import * as React from "react";
import type { SessionUser } from "@/lib/rbac";
import {
  can as canFn,
  canSeeSalesModule as canSeeSalesModuleFn,
  type PermissionKey,
} from "@/lib/rbac";

const SessionContext = React.createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const user = React.useContext(SessionContext);
  if (!user) throw new Error("useSession must be used within SessionProvider");
  return user;
}

export function useCan() {
  const user = useSession();
  return React.useCallback(
    (permission: PermissionKey) => canFn(user, permission),
    [user]
  );
}

/**
 * Whether the Sales workspace is visible to the signed-in user.
 *
 * Resolved through the same rbac helper the server uses, so the sidebar, the
 * command palette and the route guards cannot disagree about who the module
 * exists for.
 */
export function useCanSeeSalesModule() {
  const user = useSession();
  return canSeeSalesModuleFn(user);
}
