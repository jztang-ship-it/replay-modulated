// api/notifications/index.ts
//
// In-app notification API. Requires Supabase auth (anonymous viewers
// have no row to read).
//
//   GET    /api/notifications          → list recent notifications.
//                                        Default: 20 newest, includes
//                                        read + unread.
//   PATCH  /api/notifications          → mark notifications read.
//                                        Body: { notification_ids?: string[] }
//                                        Omit notification_ids to mark
//                                        all of the user's unread rows
//                                        as read.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";
import { verifyAuth } from "../hand/_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) return res.status(authErr.status).json({ error: "UNAUTHORIZED" });

  if (req.method === "GET") {
    const limit = Math.min(50, Number(req.query.limit ?? 20) || 20);
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .select("notification_id, type, payload, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      // Migration 008 not applied yet? Return an empty list rather than
      // failing — the client treats this as "no notifications".
      console.error("[notifications GET] non-fatal:", error.message);
      return res.status(200).json({ notifications: [], unread_count: 0 });
    }
    const unreadCount = (data ?? []).filter(n => n.read_at == null).length;
    return res.status(200).json({
      notifications: data ?? [],
      unread_count: unreadCount,
    });
  }

  if (req.method === "PATCH") {
    const ids = Array.isArray(req.body?.notification_ids) ? req.body.notification_ids : null;
    const nowIso = new Date().toISOString();
    let q = supabaseAdmin
      .from("user_notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (ids && ids.length > 0) q = q.in("notification_id", ids);
    const { error, count } = await q;
    if (error) {
      console.error("[notifications PATCH] non-fatal:", error.message);
      return res.status(200).json({ marked_read: 0 });
    }
    return res.status(200).json({ marked_read: count ?? 0 });
  }

  return res.status(405).json({ error: "GET or PATCH only" });
}
