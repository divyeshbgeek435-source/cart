import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


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

  if (hasOrderDiscountClass) {
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
            value: {
              percentage: {
                value: config.order.percentage,
              },
            },
          },
        ],
        selectionStrategy: mapOrderStrategy(config.order.selectionStrategy),
      },
    });
  }

  if (hasProductDiscountClass) {
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
            value: {
              percentage: {
                value: config.product.percentage,
              },
            },
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
    order: { percentage: 10, message: '10% OFF ORDER', selectionStrategy: 'FIRST' },
    product: { percentage: 20, message: '20% OFF PRODUCT', selectionStrategy: 'FIRST' },
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    order: {
      percentage: normalizePercentage(raw?.order?.percentage, base.order.percentage),
      message: String(raw?.order?.message || base.order.message),
      selectionStrategy: String(raw?.order?.selectionStrategy || base.order.selectionStrategy).toUpperCase(),
    },
    product: {
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