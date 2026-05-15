// shared/hooks/useChallengeNotifications.ts
//
// Polls the in-app notifications API for the current authenticated
// user. Anonymous users get an empty list since the table is RLS-gated
// on user_id == auth.uid().
//
// Returns the list, an unread count, and a `markAllRead` action. The
// poll fires on mount and whenever `refreshNonce` changes (caller can
// bump it after an action that should change state, e.g. opening the
// panel).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@shared/lib/supabase";

export interface ChallengeNotification {
  notification_id: string;
  type: string;
  payload: Record<string, any>;
  created_at: string;
  read_at: string | null;
}

interface UseChallengeNotificationsArgs {
  /** Bump to force a refetch (e.g. after opening the panel or completing
   *  an attempt). Optional — caller can omit and rely on the mount fetch. */
  refreshNonce?: number;
  /** Whether the current user has a signed-in (non-anonymous) session.
   *  Skipped entirely for anonymous users — they have no rows to read. */
  enabled: boolean;
}

export function useChallengeNotifications({ refreshNonce, enabled }: UseChallengeNotificationsArgs) {
  const [notifications, setNotifications] = useState<ChallengeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchOnce = useCallback(async () => {
    if (!enabled) { setNotifications([]); setUnreadCount(0); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const resp = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      setNotifications(json.notifications ?? []);
      setUnreadCount(Number(json.unread_count ?? 0));
    } catch (e) {
      // Silent — the badge just stays at its last value.
      console.error("[notifications] fetch failed:", e);
    }
  }, [enabled]);

  useEffect(() => { void fetchOnce(); }, [fetchOnce, refreshNonce]);

  const markAllRead = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const resp = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (resp.ok) {
        // Optimistic local update — server returns marked_read but we
        // can flip everything locally too.
        setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
        setUnreadCount(0);
      }
    } catch (e) {
      console.error("[notifications] mark-read failed:", e);
    }
  }, [enabled]);

  return { notifications, unreadCount, refresh: fetchOnce, markAllRead };
}
