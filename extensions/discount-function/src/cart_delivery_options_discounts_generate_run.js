import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
} from "../generated/api";
import {
  parseSequentialUnlockConfig,
  parseSequentialUnlockLevel,
} from "./sequential_unlock.js";

/**
  * @typedef {import("../generated/api").DeliveryInput} RunInput
  * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
  */

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    return {operations: []};
  }

  const hasShippingDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Shipping,
  );

  if (!hasShippingDiscountClass) {
    return {operations: []};
  }
  const config = parseFunctionConfig(input?.discount?.metafield?.jsonValue);
  const sequential = parseSequentialUnlockConfig(
    input?.discount?.metafield?.jsonValue,
  );
  const unlockLevel = parseSequentialUnlockLevel(input.cart);

  if (sequential.enabled) {
    if (unlockLevel < 2) {
      return {operations: []};
    }
    return {
      operations: [
        {
          deliveryDiscountsAdd: {
            candidates: [
              {
                message: config.shipping.message,
                targets: [
                  {
                    deliveryGroup: {
                      id: firstDeliveryGroup.id,
                    },
                  },
                ],
                value: {
                  percentage: {
                    value: 100,
                  },
                },
              },
            ],
            selectionStrategy: DeliveryDiscountSelectionStrategy.All,
          },
        },
      ],
    };
  }

  const subtotal = normalizeAmount(input?.cart?.cost?.subtotalAmount?.amount);
  const tierDecision = resolveShippingTier(subtotal, config.shipping);

  if (tierDecision.shippingCharge > 0) {
    // Shopify Functions can discount shipping, but cannot add a surcharge.
    return {operations: []};
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: tierDecision.message,
              targets: [
                {
                  deliveryGroup: {
                    id: firstDeliveryGroup.id,
                  },
                },
              ],
              value: {
                percentage: {
                  value: 100,
                },
              },
            },
          ],
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

function parseFunctionConfig(raw) {
  const base = {
    shipping: {
      message: "You have free shipping!",
      defaultCharge: 50,
      tiers: [
        { min: 500, max: 999.99, shipping: 0, message: "You have free shipping!" },
        { min: 1000, max: null, shipping: 50, message: "Shipping charge Rs 50 applied" },
      ],
    },
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    shipping: {
      message: String(raw?.shipping?.message || base.shipping.message),
      defaultCharge: normalizeAmount(raw?.shipping?.defaultCharge, base.shipping.defaultCharge),
      tiers: normalizeTiers(raw?.shipping?.tiers, base.shipping.tiers),
    },
  };
}

function normalizeAmount(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeTiers(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const tiers = value
    .map((tier) => ({
      min: normalizeAmount(tier?.min, 0),
      max: tier?.max == null ? null : normalizeAmount(tier?.max, null),
      shipping: normalizeAmount(tier?.shipping, 0),
      message: tier?.message ? String(tier.message) : "",
    }))
    .filter((tier) => tier.max == null || tier.max >= tier.min)
    .sort((a, b) => a.min - b.min);
  return tiers.length ? tiers : fallback;
}

function resolveShippingTier(subtotal, shippingConfig) {
  const matchedTier = shippingConfig.tiers.find((tier) => {
    if (subtotal < tier.min) return false;
    if (tier.max == null) return true;
    return subtotal <= tier.max;
  });
  if (!matchedTier) {
    return {
      shippingCharge: shippingConfig.defaultCharge,
      message: shippingConfig.message,
    };
  }
  return {
    shippingCharge: matchedTier.shipping,
    message: matchedTier.message || shippingConfig.message,
  };
}