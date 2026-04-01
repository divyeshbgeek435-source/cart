import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {
  parseSequentialUnlockConfig,
  parseSequentialUnlockLevel,
} from './sequential_unlock.js';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return {operations: []};
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasOrderDiscountClass && !hasProductDiscountClass) {
    return {operations: []};
  }

  const maxCartLine = input.cart.lines.reduce((maxLine, line) => {
    if (line.cost.subtotalAmount.amount > maxLine.cost.subtotalAmount.amount) {
      return line;
    }
    return maxLine;
  }, input.cart.lines[0]);

  const operations = [];
  const config = parseFunctionConfig(input?.discount?.metafield?.jsonValue);
  const sequential = parseSequentialUnlockConfig(
    input?.discount?.metafield?.jsonValue,
  );
  if (
    sequential.enabled &&
    parseSequentialUnlockLevel(input.cart) < 1
  ) {
    return {operations: []};
  }

  if (hasOrderDiscountClass) {
    const orderValue =
      config.order.valueType === 'FIXED_AMOUNT'
        ? {
            fixedAmount: {
              amount: config.order.amountOff,
            },
          }
        : {
            percentage: {
              value: config.order.percentage,
            },
          };

    operations.push({
      orderDiscountsAdd: {
        candidates: [
          {
            message: config.order.message,
            targets: [
              {
                orderSubtotal: {
                  excludedCartLineIds: [],
                },
              },
            ],
            value: orderValue,
          },
        ],
        selectionStrategy: mapOrderStrategy(config.order.selectionStrategy),
      },
    });
  }

  if (hasProductDiscountClass) {
    const productValue =
      config.product.valueType === 'FIXED_AMOUNT'
        ? {
            fixedAmount: {
              amount: config.product.amountOff,
              appliesToEachItem: false,
            },
          }
        : {
            percentage: {
              value: config.product.percentage,
            },
          };

    operations.push({
      productDiscountsAdd: {
        candidates: [
          {
            message: config.product.message,
            targets: [
              {
                cartLine: {
                  id: maxCartLine.id,
                },
              },
            ],
            value: productValue,
          },
        ],
        selectionStrategy: mapProductStrategy(config.product.selectionStrategy),
      },
    });
  }

  return {
    operations,
  };
}

function parseFunctionConfig(raw) {
  const base = {
    order: {
      valueType: 'PERCENTAGE',
      amountOff: 5,
      percentage: 10,
      message: '10% OFF ORDER',
      selectionStrategy: 'FIRST',
    },
    product: {
      valueType: 'PERCENTAGE',
      amountOff: 5,
      percentage: 20,
      message: '20% OFF PRODUCT',
      selectionStrategy: 'FIRST',
    },
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    order: {
      valueType: normalizeValueType(raw?.order?.valueType, base.order.valueType),
      amountOff: normalizeAmountOff(raw?.order?.amountOff, base.order.amountOff),
      percentage: normalizePercentage(raw?.order?.percentage, base.order.percentage),
      message: String(raw?.order?.message || base.order.message),
      selectionStrategy: String(raw?.order?.selectionStrategy || base.order.selectionStrategy).toUpperCase(),
    },
    product: {
      valueType: normalizeValueType(raw?.product?.valueType, base.product.valueType),
      amountOff: normalizeAmountOff(raw?.product?.amountOff, base.product.amountOff),
      percentage: normalizePercentage(raw?.product?.percentage, base.product.percentage),
      message: String(raw?.product?.message || base.product.message),
      selectionStrategy: String(raw?.product?.selectionStrategy || base.product.selectionStrategy).toUpperCase(),
    },
  };
}

function normalizePercentage(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}

function normalizeAmountOff(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function normalizeValueType(value, fallback) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FIXED_AMOUNT') return 'FIXED_AMOUNT';
  if (normalized === 'PERCENTAGE') return 'PERCENTAGE';
  return fallback;
}

function mapOrderStrategy(strategy) {
  return strategy === 'MAXIMUM'
    ? OrderDiscountSelectionStrategy.Maximum
    : OrderDiscountSelectionStrategy.First;
}

function mapProductStrategy(strategy) {
  if (strategy === 'ALL') return ProductDiscountSelectionStrategy.All;
  if (strategy === 'MAXIMUM') return ProductDiscountSelectionStrategy.Maximum;
  return ProductDiscountSelectionStrategy.First;
}