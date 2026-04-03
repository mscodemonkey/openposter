"use client";

import { useCallback, useState } from "react";

import { getCreatorSubscriptions, subscribeCreator, unsubscribeCreator } from "@/lib/subscriptions";

type CreatorSubscriptionInput = {
  creatorId: string | null | undefined;
  creatorDisplayName?: string | null;
  nodeBase?: string | null;
};

export function useCreatorSubscriptions() {
  const [creatorSubs, setCreatorSubs] = useState<Set<string>>(
    () => new Set(getCreatorSubscriptions().map((subscription) => subscription.creatorId)),
  );

  const isCreatorSubscribed = useCallback(
    (creatorId: string | null | undefined) => !!creatorId && creatorSubs.has(creatorId),
    [creatorSubs],
  );

  const toggleCreatorSubscription = useCallback(
    ({ creatorId, creatorDisplayName, nodeBase }: CreatorSubscriptionInput) => {
      const normalizedId = creatorId?.trim();
      if (!normalizedId) return;

      if (creatorSubs.has(normalizedId)) {
        unsubscribeCreator(normalizedId);
        setCreatorSubs((prev) => {
          const next = new Set(prev);
          next.delete(normalizedId);
          return next;
        });
        return;
      }

      subscribeCreator({
        creatorId: normalizedId,
        creatorDisplayName: creatorDisplayName ?? normalizedId,
        nodeBase: nodeBase ?? "",
      });
      setCreatorSubs((prev) => new Set([...prev, normalizedId]));
    },
    [creatorSubs],
  );

  return {
    creatorSubs,
    isCreatorSubscribed,
    toggleCreatorSubscription,
  };
}
