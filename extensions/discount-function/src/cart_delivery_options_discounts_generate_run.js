import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
} from "../generated/api";

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
                  value: config.shipping.percentage,
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
    shipping: { percentage: 100, message: 'FREE DELIVERY' },
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    shipping: {
      percentage: normalizePercentage(raw?.shipping?.percentage, base.shipping.percentage),
      message: String(raw?.shipping?.message || base.shipping.message),
    },
  };
}

function normalizePercentage(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}