"use client";

import { mutate as globalMutate } from "swr";
import { toastError } from "@/lib/toast";

// SMOOTH S4 — one helper for "render the result immediately, reconcile with the
// server, roll back + toast on failure". Wraps SWR's mutate with optimisticData +
// rollbackOnError so every write feels instant and self-heals.
//
// key           the SWR cache key to mutate (string or tuple)
// optimistic    updater applied to the cached value right away (SWR shows it)
// request       the actual server call; its resolved value is ignored (we
//               revalidate), but a THROW triggers rollback + the error toast
// errorMessage  what the user sees if the write fails (already rolled back)
//
// SWR's rollbackOnError restores the pre-mutation cache automatically when the
// promise rejects; we add the toast + revalidate-on-success.
export async function optimisticUpdate<T>(opts: {
  key: string | readonly unknown[];
  current: T | undefined;
  optimistic: (cur: T | undefined) => T;
  request: () => Promise<unknown>;
  errorMessage: string;
}): Promise<void> {
  const { key, optimistic, request, errorMessage } = opts;
  try {
    await globalMutate(
      key,
      async () => {
        await request();          // throws → SWR rolls back to the prior cache
        return undefined;         // then revalidate to reconcile with the server
      },
      {
        optimisticData: (cur: T | undefined) => optimistic(cur),
        rollbackOnError: true,
        revalidate: true,
        populateCache: false,     // don't trust request()'s return; revalidate instead
      },
    );
  } catch {
    // mutate rejects after rolling back — surface the failure to the user.
    toastError(errorMessage);
  }
}
