/**
 * @param {unknown} raw Metafield JSON root
 * @returns {{ enabled: boolean }}
 */
export function parseSequentialUnlockConfig(raw) {
  const su = raw && typeof raw === "object" ? raw.sequentialUnlock : null;
  return {
    enabled: !!(su && su.enabled === true),
  };
}

/**
 * Cart attribute `sce_sequential_unlock`: "0" | "1" | "2" (tier 1 = order/product discounts, tier 2 = shipping).
 * @param {{ sequentialUnlockLevel?: { value?: string | null } | null }} cart
 * @returns {0 | 1 | 2}
 */
export function parseSequentialUnlockLevel(cart) {
  const raw = cart?.sequentialUnlockLevel?.value;
  if (raw == null || raw === "") return 0;
  const n = parseInt(String(raw).trim(), 10);
  if (n === 1 || n === 2) return n;
  return 0;
}
