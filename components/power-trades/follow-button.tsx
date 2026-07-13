"use client";

import useSWR from "swr";
import { Star } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { optimisticUpdate } from "@/lib/optimistic";

const KEY = "/api/follows";
interface Follow { person_id: string; person_name: string; kind: string }

// Follow/unfollow toggle for a Power Trades person. Optimistic; shares one SWR
// key so every surface (list rows, person detail, Following tab) stays in sync.
export function FollowButton({ personId, personName, kind = "congress", size = "sm" }: {
  personId: string; personName: string; kind?: "congress" | "insider"; size?: "sm" | "md";
}) {
  const { data } = useSWR<{ follows: Follow[] }>(KEY, fetchJson, { revalidateOnFocus: false });
  const following = (data?.follows ?? []).some((f) => f.person_id === personId);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !following;
    await optimisticUpdate<{ follows: Follow[] }>({
      key: KEY,
      current: data,
      optimistic: (cur) => {
        const list = cur?.follows ?? [];
        return { follows: next ? [...list, { person_id: personId, person_name: personName, kind }] : list.filter((f) => f.person_id !== personId) };
      },
      request: async () => {
        const r = next
          ? await fetch(KEY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId, personName, kind }) })
          : await fetch(`${KEY}?personId=${encodeURIComponent(personId)}`, { method: "DELETE" });
        if (!r.ok) throw new Error(`follow ${r.status}`);   // → rollback + toast
      },
      errorMessage: next ? `Couldn't follow ${personName} — try again.` : `Couldn't unfollow ${personName} — try again.`,
    });
  }

  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <button
      onClick={toggle}
      aria-pressed={following}
      className={`inline-flex items-center gap-1 rounded-full border transition-colors ${pad} ${
        following ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-hairline text-ink-dim hover:text-ink hover:border-hairline-strong"}`}
    >
      <Star size={size === "md" ? 14 : 11} className={following ? "fill-amber-400 text-amber-400" : ""} />
      {following ? "Following" : "Follow"}
    </button>
  );
}
