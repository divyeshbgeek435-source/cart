import { useEffect, useMemo, useState } from "react";
import { useActionData, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

const GET_CODE_DISCOUNT = `#graphql
  query GetCodeDiscountNode($id: ID!) {
    codeDiscountNode(id: $id) {
      id
      codeDiscount {
        __typename
        ... on DiscountCodeBasic {
          title
          status
          startsAt
          endsAt
          appliesOncePerCustomer
          usageLimit
          codes(first: 1) {
            nodes {
              code
            }
          }
          customerGets {
            items {
              __typename
            }
            value {
              __typename
              ... on DiscountAmount {
                amount {
                  amount
                  currencyCode
                }
                appliesOnEachItem
              }
              ... on DiscountPercentage {
                percentage
              }
            }
          }
        }
      }
    }
  }
`;

const UPDATE_BASIC = `#graphql
  mutation UpdateBasic($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_CODE_DISCOUNT = `#graphql
  mutation DeleteCodeDiscount($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

function toInputDefaults(codeDiscountNode) {
  const basic = codeDiscountNode?.codeDiscount;
  const code = basic?.codes?.nodes?.[0]?.code || "";
  const title = basic?.title || "";

  const value = basic?.customerGets?.value;
  const isPercentage = value?.__typename === "DiscountPercentage";
  const isAmount = value?.__typename === "DiscountAmount";

  const percentage =
    isPercentage && typeof value?.percentage === "number"
      ? String(value.percentage * 100)
      : "10";

  const amount =
    isAmount && value?.amount?.amount != null ? String(value.amount.amount) : "20.00";
  const appliesOnEachItem = Boolean(isAmount ? value?.appliesOnEachItem : false);

  return {
    title,
    code,
    valueType: isAmount ? "amount" : "percentage",
    percentage,
    amount,
    appliesOnEachItem,
    appliesOncePerCustomer: Boolean(basic?.appliesOncePerCustomer),
    usageLimit: basic?.usageLimit == null ? "" : String(basic.usageLimit),
    startsAt: basic?.startsAt ? new Date(basic.startsAt).toISOString() : "",
    endsAt: basic?.endsAt ? new Date(basic.endsAt).toISOString() : "",
  };
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return { ok: false, error: "Missing id" };
  }

  const response = await admin.graphql(GET_CODE_DISCOUNT, { variables: { id } });
  const json = await response.json();

  return {
    ok: true,
    id,
    type: json?.data?.codeDiscountNode?.codeDiscount?.__typename || null,
    node: json?.data?.codeDiscountNode || null,
    errors: json?.errors || null,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = String(formData.get("intent") || "update");
  const id = String(formData.get("id") || "");
  const discountType = String(formData.get("discountType") || "");

  if (!id) return { ok: false, errors: { id: "Missing discount id" } };

  if (intent === "delete") {
    const resp = await admin.graphql(DELETE_CODE_DISCOUNT, { variables: { id } });
    const json = await resp.json();

    const payload = json?.data?.discountCodeDelete;
    const userErrors = payload?.userErrors || [];
    if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
    if (userErrors.length) return { ok: false, errors: { shopify: userErrors } };

    return { ok: true, deletedId: payload?.deletedCodeDiscountId || id };
  }

  if (discountType && discountType !== "DiscountCodeBasic") {
    return {
      ok: false,
      errors: {
        form: `Update is only supported for DiscountCodeBasic. Current type: ${discountType}`,
      },
    };
  }

  const title = String(formData.get("title") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const valueType = String(formData.get("valueType") || "percentage");
  const percentageRaw = String(formData.get("percentage") || "").trim();
  const amountRaw = String(formData.get("amount") || "").trim();
  const appliesOnEachItem = String(formData.get("appliesOnEachItem") || "") === "on";
  const appliesOncePerCustomer =
    String(formData.get("appliesOncePerCustomer") || "") === "on";
  const usageLimitRaw = String(formData.get("usageLimit") || "").trim();
  const startsAtRaw = String(formData.get("startsAt") || "").trim();
  const endsAtRaw = String(formData.get("endsAt") || "").trim();

  const errors = {};
  if (!title) errors.title = "Title is required";
  if (!code) errors.code = "Code is required";

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
    const pct = Number(percentageRaw);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      errors.percentage = "Percentage must be between 0 and 100";
    }
    customerGetsValue = { percentage: pct / 100 };
  }

  const usageLimit =
    usageLimitRaw === "" ? null : Number.parseInt(usageLimitRaw, 10);
  if (usageLimitRaw !== "" && (!Number.isFinite(usageLimit) || usageLimit <= 0)) {
    errors.usageLimit = "Usage limit must be a positive number";
  }

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  if (startsAtRaw && Number.isNaN(startsAt.getTime())) {
    errors.startsAt = "Invalid start date";
  }

  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (endsAtRaw && Number.isNaN(endsAt.getTime())) {
    errors.endsAt = "Invalid end date";
  }
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.endsAt = "End date must be after start date";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const basicCodeDiscount = {
    title,
    code,
    ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
    ...(endsAtRaw ? { endsAt: endsAt ? endsAt.toISOString() : null } : {}),
    customerGets: {
      items: { all: true },
      value: customerGetsValue,
    },
    appliesOncePerCustomer,
    ...(usageLimitRaw !== "" ? { usageLimit } : {}),
  };

  const resp = await admin.graphql(UPDATE_BASIC, {
    variables: { id, basicCodeDiscount },
  });
  const json = await resp.json();
  const payload = json?.data?.discountCodeBasicUpdate;
  const userErrors = payload?.userErrors || [];

  if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
  if (userErrors.length) return { ok: false, errors: { shopify: userErrors } };

  return { ok: true, id };
};

export default function DiscountEdit() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();

  const result = actionData;

  const defaults = useMemo(() => {
    if (!loaderData?.ok || !loaderData?.node) return null;
    return toInputDefaults(loaderData.node);
  }, [loaderData]);

  const [title, setTitle] = useState(defaults?.title || "");
  const [code, setCode] = useState(defaults?.code || "");
  const [valueType, setValueType] = useState(defaults?.valueType || "percentage");
  const [percentage, setPercentage] = useState(defaults?.percentage || "10");
  const [amount, setAmount] = useState(defaults?.amount || "20.00");
  const [appliesOnEachItem, setAppliesOnEachItem] = useState(
    Boolean(defaults?.appliesOnEachItem),
  );
  const [appliesOncePerCustomer, setAppliesOncePerCustomer] = useState(
    Boolean(defaults?.appliesOncePerCustomer),
  );
  const [usageLimit, setUsageLimit] = useState(defaults?.usageLimit || "");
  const [startsAt, setStartsAt] = useState(defaults?.startsAt || "");
  const [endsAt, setEndsAt] = useState(defaults?.endsAt || "");

  useEffect(() => {
    if (result?.ok && result?.deletedId) {
      shopify.toast.show("Discount deleted");
      const current = new URLSearchParams(location.search);
      const keep = new URLSearchParams();
      for (const key of ["host", "shop"]) {
        const val = current.get(key);
        if (val) keep.set(key, val);
      }
      const qs = keep.toString();
      window.location.assign(qs ? `/app/discounts?${qs}` : "/app/discounts");
    } else if (result?.ok) {
      shopify.toast.show("Discount updated");
    } else if (result?.ok === false && result?.errors?.shopify?.length) {
      shopify.toast.show(result.errors.shopify[0]?.message || "Update failed");
    }
  }, [location.search, result, shopify]);

  if (!loaderData?.ok) {
    return (
      <s-page heading="Edit discount">
        <s-section>
          <s-paragraph>{loaderData?.error || "Unable to load discount"}</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const id = loaderData.id;
  const type = loaderData.type;
  const isBasic = type === "DiscountCodeBasic";

  const fieldError = (key) => (result?.ok === false ? result?.errors?.[key] : undefined);

  return (
    <s-page heading="Edit discount">
      <form method="post">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="discountType" value={type || ""} />

        <s-section heading="Details">
          {!isBasic ? (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-paragraph>
                This discount type is <code>{type || "unknown"}</code>. Editing fields is
                only supported for <code>DiscountCodeBasic</code> right now.
              </s-paragraph>
            </s-box>
          ) : null}
          <s-text-field
            name="title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            error={fieldError("title")}
            autocomplete="off"
            disabled={!isBasic}
          ></s-text-field>

          <s-text-field
            name="code"
            label="Code"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            error={fieldError("code")}
            autocomplete="off"
            disabled={!isBasic}
          ></s-text-field>

          <s-text-field
            name="valueType"
            label="Type (percentage or amount)"
            details='Enter "percentage" or "amount"'
            value={valueType}
            onChange={(e) => setValueType(e.currentTarget.value)}
            autocomplete="off"
            disabled={!isBasic}
          ></s-text-field>

          {valueType === "amount" ? (
            <>
              <s-text-field
                name="amount"
                label="Amount off"
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                error={fieldError("amount")}
                autocomplete="off"
                disabled={!isBasic}
              ></s-text-field>
              <label style={{ display: "block", marginTop: 8 }}>
                <input
                  type="checkbox"
                  name="appliesOnEachItem"
                  checked={appliesOnEachItem}
                  onChange={(e) => setAppliesOnEachItem(e.currentTarget.checked)}
                  disabled={!isBasic}
                />{" "}
                Applies on each item
              </label>
            </>
          ) : (
            <s-text-field
              name="percentage"
              label="Percentage off"
              details="Example: 10 = 10%"
              value={percentage}
              onChange={(e) => setPercentage(e.currentTarget.value)}
              error={fieldError("percentage")}
              autocomplete="off"
              disabled={!isBasic}
            ></s-text-field>
          )}
        </s-section>

        <s-section heading="Limits (optional)">
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              name="appliesOncePerCustomer"
              checked={appliesOncePerCustomer}
              onChange={(e) => setAppliesOncePerCustomer(e.currentTarget.checked)}
              disabled={!isBasic}
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
            disabled={!isBasic}
          ></s-text-field>
        </s-section>

        <s-section heading="Schedule (optional)">
          <s-text-field
            name="startsAt"
            label="Starts at (ISO)"
            value={startsAt}
            onChange={(e) => setStartsAt(e.currentTarget.value)}
            error={fieldError("startsAt")}
            autocomplete="off"
            disabled={!isBasic}
          ></s-text-field>
          <s-text-field
            name="endsAt"
            label="Ends at (ISO, empty = keep as-is)"
            value={endsAt}
            onChange={(e) => setEndsAt(e.currentTarget.value)}
            error={fieldError("endsAt")}
            autocomplete="off"
            disabled={!isBasic}
          ></s-text-field>
        </s-section>

        {result?.ok === false && (result?.errors?.shopify || result?.errors?.graphql) ? (
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

        <s-stack direction="inline" gap="base">
          <s-button type="submit" name="intent" value="update" disabled={!isBasic}>
            Save
          </s-button>
          <s-button type="submit" name="intent" value="delete" variant="tertiary">
            Delete
          </s-button>
          <s-link
            href={
              (() => {
                const current = new URLSearchParams(location.search);
                const keep = new URLSearchParams();
                for (const key of ["host", "shop"]) {
                  const val = current.get(key);
                  if (val) keep.set(key, val);
                }
                const qs = keep.toString();
                return qs ? `/app/discounts?${qs}` : "/app/discounts";
              })()
            }
          >
            Back
          </s-link>
        </s-stack>
      </form>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

