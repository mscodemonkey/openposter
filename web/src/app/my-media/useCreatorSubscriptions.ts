"use client";

import { useCallback, useEffect, useState } from "react";
import { getFavouriteCreators, addFavouriteCreator, removeFavouriteCreator } from "@/lib/subscriptions";
import { loadIssuerToken } from "@/lib/issuer_storage";

export function useCreatorSubscriptions() {
  const [token, setToken] = useState<string | null>(null);
  const [creatorSubs, setCreatorSubs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tok = loadIssuerToken();
    setToken(tok);
    if (!tok) return;
    getFavouriteCreators(tok)
      .then((favs) => setCreatorSubs(new Set(favs.map((f) => f.creatorId))))
      .catch(() => {});
  }, []);

  const isCreatorSubscribed = useCallback(
    (creatorId: string | null | undefined) => !!creatorId && creatorSubs.has(creatorId),
    [creatorSubs],
  );

  const toggleCreatorSubscription = useCallback(
    async ({
      creatorId,
      creatorDisplayName,
      nodeBase,
    }: {
      creatorId?: string | null;
      creatorDisplayName?: string | null;
      nodeBase?: string | null;
    }) => {
      const normalizedId = creatorId?.trim();
      if (!normalizedId || !token) return;
      if (creatorSubs.has(normalizedId)) {
        await removeFavouriteCreator(token, normalizedId).catch(() => {});
        setCreatorSubs((prev) => {
          const next = new Set(prev);
          next.delete(normalizedId);
          return next;
        });
      } else {
        await addFavouriteCreator(token, {
          creatorId: normalizedId,
          creatorDisplayName: creatorDisplayName ?? normalizedId,
          nodeBase: nodeBase ?? "",
        }).catch(() => {});
        setCreatorSubs((prev) => new Set([...prev, normalizedId]));
      }
    },
    [creatorSubs, token],
  );

  return { creatorSubs, isCreatorSubscribed, toggleCreatorSubscription };
}
