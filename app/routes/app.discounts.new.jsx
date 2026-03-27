import { useEffect, useMemo, useState } from "react";
import { useActionData, useFetcher, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

const DISCOUNT_CREATE_MUTATION = `#graphql
  mutation CreateSegmentDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            codes(first: 10) {
              nodes {
                code
              }
            }
            context {
              ... on DiscountCustomerSegments {
                segments {
                  id
                }
              }
            }
            customerGets {
              value {
                ... on DiscountAmount {
                  amount {
                    amount
                    currencyCode
                  }
                  appliesOnEachItem
                }
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const AUTOMATIC_DISCOUNT_CREATE_MUTATION = `#graphql
  mutation CreateAutomaticDiscount($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
      automaticDiscountNode {
        id
        automaticDiscount {
          ... on DiscountAutomaticBasic {
            title
            startsAt
            endsAt
            status
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const AUTOMATIC_APP_DISCOUNT_CREATE_MUTATION = `#graphql
  mutation CreateCustomAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
        startsAt
        endsAt
        appDiscountType {
          functionId
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const discountModeRaw = String(formData.get("discountMode") || "code")
    .trim()
    .toLowerCase();
  const discountMode =
    discountModeRaw === "automatic"
      ? "automatic"
      : discountModeRaw === "custom"
        ? "custom"
        : "code";
  const title = String(formData.get("title") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const valueTypeRaw = String(formData.get("valueType") || "percentage").trim().toLowerCase();
  const valueType = valueTypeRaw === "amount" ? "amount" : "percentage";
  const percentageRaw = String(formData.get("percentage") || "").trim();
  const amountRaw = String(formData.get("amount") || "").trim();
  const appliesOnEachItem = String(formData.get("appliesOnEachItem") || "") === "on";
  const appliesOncePerCustomer =
    String(formData.get("appliesOncePerCustomer") || "") === "on";
  const usageLimitRaw = String(formData.get("usageLimit") || "").trim();
  const segmentId = String(formData.get("segmentId") || "").trim();
  const functionId = String(formData.get("functionId") || "").trim();
  const minimumSubtotalRaw = String(formData.get("minimumSubtotal") || "").trim();
  const applicationStrategyRaw = String(
    formData.get("applicationStrategy") || "FIRST",
  )
    .trim()
    .toUpperCase();
  const functionConfigJsonRaw = String(formData.get("functionConfigJson") || "").trim();
  const startsAtRaw = String(formData.get("startsAt") || "").trim();
  const endsAtRaw = String(formData.get("endsAt") || "").trim();

  const errors = {};
  if (!title) errors.title = "Title is required";
  if (discountMode === "code" && !code) errors.code = "Code is required";
  if (discountMode === "custom" && !functionId) errors.functionId = "Function ID is required";
  if (!["code", "automatic", "custom"].includes(discountModeRaw)) {
    errors.discountMode = 'Mode must be "code", "automatic", or "custom"';
  }
  if (!["amount", "percentage"].includes(valueTypeRaw)) {
    errors.valueType = 'Type must be "percentage" or "amount"';
  }

  let customerGetsValue = null;
  if (valueType === "amount") {
    const amt = Number(amountRaw);
    if (!Number.isFinite(amt) || amt <= 0) errors.amount = "Amount must be > 0";
    customerGetsValue = {
      discountAmount: {
        amount: amountRaw,
        appliesOnEachItem,
      },
    };
  } else {
    const percentage = Number(percentageRaw);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      errors.percentage = "Percentage must be between 0 and 100";
    }
    // Shopify expects a Float between 0.0 and 1.0 (e.g. 0.1 for 10%).
    customerGetsValue = { percentage: percentage / 100 };
  }

  const usageLimit =
    usageLimitRaw === "" ? null : Number.parseInt(usageLimitRaw, 10);
  if (usageLimitRaw !== "" && (!Number.isFinite(usageLimit) || usageLimit <= 0)) {
    errors.usageLimit = "Usage limit must be a positive number";
  }

  const minimumSubtotal =
    minimumSubtotalRaw === "" ? null : Number(minimumSubtotalRaw);
  if (
    minimumSubtotalRaw !== "" &&
    (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0)
  ) {
    errors.minimumSubtotal = "Minimum subtotal must be a valid number";
  }

  if (!["FIRST", "MAXIMUM"].includes(applicationStrategyRaw)) {
    errors.applicationStrategy = 'Strategy must be "FIRST" or "MAXIMUM"';
  }

  let parsedFunctionConfig = null;
  if (functionConfigJsonRaw) {
    try {
      parsedFunctionConfig = JSON.parse(functionConfigJsonRaw);
    } catch {
      errors.functionConfigJson = "Config JSON is invalid";
    }
  }

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = "Invalid start date";

  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) {
    errors.endsAt = "Invalid end date";
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.endsAt = "End date must be after start date";
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  const baseDiscountInput = {
    title,
    startsAt: startsAt.toISOString(),
    ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
    context: segmentId ? { customerSegments: { add: [segmentId] } } : { all: "ALL" },
    customerGets: {
      items: { all: true },
      value: customerGetsValue,
    },
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    },
  };

  const variables =
    discountMode === "automatic"
      ? {
          automaticBasicDiscount: baseDiscountInput,
        }
      : discountMode === "custom"
        ? {
            automaticAppDiscount: {
              title,
              functionId,
              startsAt: startsAt.toISOString(),
              ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
              combinesWith: {
                orderDiscounts: false,
                productDiscounts: false,
                shippingDiscounts: false,
              },
              metafields: [
                {
                  namespace: "default",
                  key: "function-configuration",
                  type: "json",
                  value: JSON.stringify(
                    parsedFunctionConfig || {
                      discounts: [
                        {
                          value:
                            valueType === "amount"
                              ? {
                                  fixedAmount: {
                                    amount: Number(amountRaw || 0),
                                  },
                                }
                              : {
                                  percentage: {
                                    value: Number(percentageRaw || 0) / 100,
                                  },
                                },
                          targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
                          ...(minimumSubtotal != null
                            ? {
                                minimumRequirement: {
                                  subtotal: {
                                    greaterThanOrEqualToSubtotal: minimumSubtotal,
                                  },
                                },
                              }
                            : {}),
                        },
                      ],
                      discountApplicationStrategy: applicationStrategyRaw,
                    },
                  ),
                },
              ],
            },
          }
      : {
          basicCodeDiscount: {
            ...baseDiscountInput,
            code,
            appliesOncePerCustomer,
            ...(usageLimitRaw !== "" ? { usageLimit } : {}),
          },
        };

  let responseJson;
  try {
    const response = await admin.graphql(
      discountMode === "automatic"
        ? AUTOMATIC_DISCOUNT_CREATE_MUTATION
        : discountMode === "custom"
          ? AUTOMATIC_APP_DISCOUNT_CREATE_MUTATION
          : DISCOUNT_CREATE_MUTATION,
      { variables },
    );
    responseJson = await response.json();
  } catch (error) {
    return {
      ok: false,
      errors: {
        runtime: [{ message: error?.message || "Unexpected server error" }],
      },
    };
  }

  if (responseJson?.errors?.length) {
    return { ok: false, errors: { graphql: responseJson.errors } };
  }

  if (discountMode === "automatic") {
    const payload = responseJson?.data?.discountAutomaticBasicCreate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) return { ok: false, errors: { shopify: userErrors } };
    return {
      ok: true,
      discountMode,
      discount: payload?.automaticDiscountNode || null,
    };
  }

  if (discountMode === "custom") {
    const payload = responseJson?.data?.discountAutomaticAppCreate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) return { ok: false, errors: { shopify: userErrors } };
    return {
      ok: true,
      discountMode,
      discount: payload?.automaticAppDiscount || null,
    };
  }

  const payload = responseJson?.data?.discountCodeBasicCreate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length) {
    return { ok: false, errors: { shopify: userErrors } };
  }

  return {
    ok: true,
    discountMode,
    discount: payload?.codeDiscountNode || null,
  };
};

export default function DiscountsNew() {
  const actionData = useActionData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const location = useLocation();

  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const result = fetcher.data || actionData;

  const defaultCode = useMemo(() => {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `WELCOME-${suffix}`;
  }, []);

  const [title, setTitle] = useState("Welcome discount");
  const [discountMode, setDiscountMode] = useState("code");
  const [code, setCode] = useState(defaultCode);
  const [valueType, setValueType] = useState("percentage");
  const [percentage, setPercentage] = useState("10");
  const [amount, setAmount] = useState("20.00");
  const [appliesOnEachItem, setAppliesOnEachItem] = useState(false);
  const [appliesOncePerCustomer, setAppliesOncePerCustomer] = useState(false);
  const [usageLimit, setUsageLimit] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [minimumSubtotal, setMinimumSubtotal] = useState("");
  const [applicationStrategy, setApplicationStrategy] = useState("FIRST");
  const [functionConfigJson, setFunctionConfigJson] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const backHref = useMemo(() => {
    const current = new URLSearchParams(location.search);
    const keep = new URLSearchParams();
    for (const key of ["host", "shop"]) {
      const val = current.get(key);
      if (val) keep.set(key, val);
    }
    const qs = keep.toString();
    return qs ? `/app/discounts?${qs}` : "/app/discounts";
  }, [location.search]);

  useEffect(() => {
    if (result?.ok && result?.discount?.id) {
      shopify.toast.show("Discount created");
    }
    if (result && result.ok === false && result.errors?.graphql?.length) {
      shopify.toast.show(result.errors.graphql[0]?.message || "GraphQL request failed");
    }
    if (result && result.ok === false && result.errors?.runtime?.length) {
      shopify.toast.show(result.errors.runtime[0]?.message || "Request failed");
    }
    if (result && result.ok === false && result.errors?.shopify?.length) {
      shopify.toast.show(result.errors.shopify[0]?.message || "Failed to create discount");
    }
  }, [result, shopify]);

  const fieldError = (key) => (result?.ok === false ? result?.errors?.[key] : undefined);

  return (
    <s-page heading="Create discount">
      <fetcher.Form method="post">
        <s-section heading="Details">
          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>Create type</div>
            <select
              name="discountMode"
              value={discountMode}
              onChange={(e) => setDiscountMode(e.currentTarget.value.toLowerCase())}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #c9cccf",
                background: "#fff",
              }}
            >
              <option value="code">Code discount</option>
              <option value="automatic">Automatic discount (no code)</option>
              <option value="custom">Custom function discount (no code)</option>
            </select>
            {fieldError("discountMode") ? (
              <p style={{ color: "#8a1f17", marginTop: 6 }}>{fieldError("discountMode")}</p>
            ) : null}
          </label>

          <s-text-field
            name="title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            error={fieldError("title")}
            autocomplete="off"
          ></s-text-field>

          {discountMode === "code" ? (
            <s-text-field
              name="code"
              label="Code"
              details="Customers enter this code at checkout"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              error={fieldError("code")}
              autocomplete="off"
            ></s-text-field>
          ) : null}

          <label style={{ display: "block", marginBottom: 10 }}>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>Value type</div>
            <select
              name="valueType"
              value={valueType}
              onChange={(e) => setValueType(e.currentTarget.value.toLowerCase())}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #c9cccf",
                background: "#fff",
              }}
            >
              <option value="percentage">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
            {fieldError("valueType") ? (
              <p style={{ color: "#8a1f17", marginTop: 6 }}>{fieldError("valueType")}</p>
            ) : null}
          </label>

          {valueType === "amount" ? (
            <>
              <s-text-field
                name="amount"
                label="Amount off"
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                error={fieldError("amount")}
                autocomplete="off"
              ></s-text-field>
              <label style={{ display: "block", marginTop: 8 }}>
                <input
                  type="checkbox"
                  name="appliesOnEachItem"
                  checked={appliesOnEachItem}
                  onChange={(e) => setAppliesOnEachItem(e.currentTarget.checked)}
                />{" "}
                Applies on each item
              </label>
            </>
          ) : (
            <s-text-field
              name="percentage"
              label="Percentage off"
              details="Example: 10 = 10% off"
              value={percentage}
              onChange={(e) => setPercentage(e.currentTarget.value)}
              error={fieldError("percentage")}
              autocomplete="off"
            ></s-text-field>
          )}
        </s-section>

        <s-section heading="Eligibility (optional)">
          <s-text-field
            name="segmentId"
            label="Customer segment ID (optional)"
            details='If empty = all customers. Example: gid://shopify/Segment/123'
            value={segmentId}
            onChange={(e) => setSegmentId(e.currentTarget.value)}
            autocomplete="off"
          ></s-text-field>
        </s-section>

        {discountMode === "code" ? (
          <s-section heading="Limits (optional)">
            <label style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                name="appliesOncePerCustomer"
                checked={appliesOncePerCustomer}
                onChange={(e) => setAppliesOncePerCustomer(e.currentTarget.checked)}
              />{" "}
              Applies once per customer
            </label>
            <s-text-field
              name="usageLimit"
              label="Usage limit"
              details="Leave empty for unlimited"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.currentTarget.value)}
              error={fieldError("usageLimit")}
              autocomplete="off"
            ></s-text-field>
          </s-section>
        ) : null}

        {discountMode === "custom" ? (
          <s-section heading="Custom function settings">
            <s-text-field
              name="functionId"
              label="Function ID"
              details="Required: your deployed Shopify Discount Function ID"
              value={functionId}
              onChange={(e) => setFunctionId(e.currentTarget.value)}
              error={fieldError("functionId")}
              autocomplete="off"
            ></s-text-field>

            <s-text-field
              name="minimumSubtotal"
              label="Minimum subtotal (optional)"
              value={minimumSubtotal}
              onChange={(e) => setMinimumSubtotal(e.currentTarget.value)}
              error={fieldError("minimumSubtotal")}
              autocomplete="off"
            ></s-text-field>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>Application strategy</div>
              <select
                name="applicationStrategy"
                value={applicationStrategy}
                onChange={(e) =>
                  setApplicationStrategy(e.currentTarget.value.toUpperCase())
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #c9cccf",
                  background: "#fff",
                }}
              >
                <option value="FIRST">FIRST</option>
                <option value="MAXIMUM">MAXIMUM</option>
              </select>
              {fieldError("applicationStrategy") ? (
                <p style={{ color: "#8a1f17", marginTop: 6 }}>
                  {fieldError("applicationStrategy")}
                </p>
              ) : null}
            </label>

            <label style={{ display: "block", marginTop: 8, marginBottom: 4 }}>
              Function config JSON (optional override)
            </label>
            <textarea
              name="functionConfigJson"
              value={functionConfigJson}
              onChange={(e) => setFunctionConfigJson(e.currentTarget.value)}
              placeholder='{"discounts":[...],"discountApplicationStrategy":"FIRST"}'
              style={{
                width: "100%",
                minHeight: 140,
                fontFamily: "monospace",
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #c9cccf",
              }}
            />
            {fieldError("functionConfigJson") ? (
              <p style={{ color: "#8a1f17", marginTop: 6 }}>{fieldError("functionConfigJson")}</p>
            ) : null}
          </s-section>
        ) : null}

        <s-section heading="Schedule (optional)">
          <s-text-field
            name="startsAt"
            label="Starts at (ISO or leave empty for now)"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
            error={fieldError("startsAt")}
            autocomplete="off"
          ></s-text-field>
          <s-text-field
            name="endsAt"
            label="Ends at (ISO)"
            value={endsAt}
            onChange={(e) => setEndsAt(e.currentTarget.value)}
            error={fieldError("endsAt")}
            autocomplete="off"
          ></s-text-field>
        </s-section>

        {result?.ok === false &&
        (result?.errors?.shopify?.length ||
          result?.errors?.graphql?.length ||
          result?.errors?.runtime?.length) ? (
          <s-section heading="Errors">
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="critical-subdued"
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                <code>{JSON.stringify(result.errors, null, 2)}</code>
              </pre>
            </s-box>
          </s-section>
        ) : null}

        {result?.ok && result?.discount ? (
          <s-section heading="Created">
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <pre style={{ margin: 0 }}>
                <code>{JSON.stringify(result.discount, null, 2)}</code>
              </pre>
            </s-box>
          </s-section>
        ) : null}

        <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
          Create discount
        </s-button>
        <s-link href={backHref} style={{ marginLeft: 12 }}>
          Back to discounts
        </s-link>
      </fetcher.Form>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

