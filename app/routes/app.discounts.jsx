// import { useEffect, useMemo, useState } from "react";
// import {
//   Form,
//   useActionData,
//   useLoaderData,
//   useLocation,
//   useRouteError,
// } from "react-router";
// import { boundary } from "@shopify/shopify-app-react-router/server";
// import { authenticate } from "../shopify.server";

// const LIST_DISCOUNTS = `#graphql
//   query ListDiscountNodes($first: Int!) {
//     discountNodes(first: $first, reverse: true) {
//       nodes {
//         id
//         discount {
//           __typename
//           ... on DiscountCodeBasic {
//             title
//             status
//             startsAt
//             endsAt
//             codes(first: 1) { nodes { code } }
//           }
//           ... on DiscountAutomaticApp {
//             title
//             status
//             startsAt
//             endsAt
//             appDiscountType { functionId }
//           }
//         }
//       }
//     }
//     appDiscountTypes {
//       functionId
//       title
//       appKey
//     }
//   }
// `;

// const LIST_APP_DISCOUNT_TYPES = `#graphql
//   query ListAppDiscountTypes {
//     appDiscountTypes {
//       functionId
//       title
//       appKey
//     }
//   }
// `;

// const CREATE_CODE = `#graphql
//   mutation CreateCode($basicCodeDiscount: DiscountCodeBasicInput!) {
//     discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
//       codeDiscountNode { id }
//       userErrors { field message }
//     }
//   }
// `;
// const UPDATE_CODE = `#graphql
//   mutation UpdateCode($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
//     discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
//       codeDiscountNode { id }
//       userErrors { field message }
//     }
//   }
// `;
// const CREATE_CUSTOM = `#graphql
//   mutation CreateCustom($automaticAppDiscount: DiscountAutomaticAppInput!) {
//     discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
//       automaticAppDiscount { discountId title }
//       userErrors { field message }
//     }
//   }
// `;
// const UPDATE_CUSTOM = `#graphql
//   mutation UpdateCustom($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
//     discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
//       automaticAppDiscount { discountId title }
//       userErrors { field message }
//     }
//   }
// `;
// const DELETE_CODE = `#graphql
//   mutation DeleteCode($id: ID!) {
//     discountCodeDelete(id: $id) {
//       deletedCodeDiscountId
//       userErrors { field message }
//     }
//   }
// `;
// const DELETE_AUTOMATIC = `#graphql
//   mutation DeleteAutomatic($id: ID!) {
//     discountAutomaticDelete(id: $id) {
//       deletedAutomaticDiscountId
//       userErrors { field message }
//     }
//   }
// `;

// function makeFunctionConfig({ percentage }) {
//   return JSON.stringify({
//     discounts: [
//       {
//         value: { percentage: { value: percentage / 100 } },
//         targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
//       },
//     ],
//     discountApplicationStrategy: "FIRST",
//   });
// }

// export const loader = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);
//   const url = new URL(request.url);
//   const editId = url.searchParams.get("editId");

//   const response = await admin.graphql(LIST_DISCOUNTS, { variables: { first: 50 } });
//   const json = await response.json();
//   const nodes = json?.data?.discountNodes?.nodes || [];
//   const currentAppKey = process.env.SHOPIFY_API_KEY?.trim() || null;
//   const appDiscountTypes = (json?.data?.appDiscountTypes || []).filter((t) =>
//     currentAppKey ? t?.appKey === currentAppKey : true,
//   );

//   const found = editId ? nodes.find((n) => n.id === editId) : null;
//   const discount = found?.discount;
//   const editDiscount = found
//     ? {
//         id: found.id,
//         mode: discount?.__typename === "DiscountAutomaticApp" ? "custom" : "code",
//         title: discount?.title || "",
//         code: discount?.codes?.nodes?.[0]?.code || "",
//         functionId: discount?.appDiscountType?.functionId || "",
//         startsAt: discount?.startsAt || "",
//         endsAt: discount?.endsAt || "",
//       }
//     : null;

//   return { nodes, appDiscountTypes, editDiscount, errors: json?.errors || null };
// };

// export const action = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);
//   const formData = await request.formData();
//   const intent = String(formData.get("intent") || "");
//   const id = String(formData.get("id") || "");
//   const modeRaw = String(formData.get("mode") || "code").trim().toLowerCase();
//   const mode = modeRaw === "custom" ? "custom" : "code";

//   if (intent === "delete") {
//     const isAutomatic = id.includes("DiscountAutomaticNode");
//     const response = await admin.graphql(isAutomatic ? DELETE_AUTOMATIC : DELETE_CODE, {
//       variables: { id },
//     });
//     const json = await response.json();
//     const payload = isAutomatic
//       ? json?.data?.discountAutomaticDelete
//       : json?.data?.discountCodeDelete;
//     if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
//     if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
//     return { ok: true };
//   }

//   const title = String(formData.get("title") || "").trim();
//   const code = String(formData.get("code") || "").trim().toUpperCase();
//   const functionId = String(formData.get("functionId") || "").trim();
//   const functionHandle = String(formData.get("functionHandle") || "").trim();
//   const startsAtRaw = String(formData.get("startsAt") || "").trim();
//   const endsAtRaw = String(formData.get("endsAt") || "").trim();
//   const segmentId = String(formData.get("segmentId") || "").trim();
//   const combinesWithOrder = String(formData.get("combinesWithOrder") || "") === "on";
//   const combinesWithProduct = String(formData.get("combinesWithProduct") || "") === "on";
//   const combinesWithShipping = String(formData.get("combinesWithShipping") || "") === "on";
//   const appliesOnOneTimePurchase =
//     String(formData.get("appliesOnOneTimePurchase") || "") === "on";
//   const appliesOnSubscription =
//     String(formData.get("appliesOnSubscription") || "") === "on";
//   const percentage = Number(String(formData.get("percentage") || "").trim());
//   const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
//   const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
//   const errors = {};
//   if (!["code", "custom"].includes(modeRaw)) {
//     errors.mode = 'Mode must be "code" or "custom"';
//   }
//   if (!title) errors.title = "Title is required";
//   if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
//     errors.percentage = "Percentage must be between 1 and 100";
//   }
//   if (mode === "code" && !code) errors.code = "Code is required";
//   if (mode === "custom" && !functionId && !functionHandle) {
//     errors.functionId = "Function ID or Function Handle is required";
//   }
//   // Do not enforce UUID format here; Shopify can accept functionId/functionHandle
//   // shapes that vary by API/version or app setup. We only require one of them.
//   if (startsAtRaw && Number.isNaN(startsAt.getTime())) errors.startsAt = "Invalid start date";
//   if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) {
//     errors.endsAt = "Invalid end date";
//   }
//   if (!Number.isNaN(startsAt.getTime())) {
//     const y = startsAt.getUTCFullYear();
//     if (y < 1970 || y > 9999) errors.startsAt = "Start date year must be between 1970 and 9999";
//   }
//   if (endsAt && !Number.isNaN(endsAt.getTime())) {
//     const y = endsAt.getUTCFullYear();
//     if (y < 1970 || y > 9999) errors.endsAt = "End date year must be between 1970 and 9999";
//   }
//   if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
//     errors.endsAt = "End date must be after start date";
//   }
//   if (Object.keys(errors).length) return { ok: false, errors };

//   if (mode === "custom") {
//     const functionTypesResp = await admin.graphql(LIST_APP_DISCOUNT_TYPES);
//     const functionTypesJson = await functionTypesResp.json();
//     const currentAppKey = process.env.SHOPIFY_API_KEY?.trim() || null;
//     const availableFunctionTypes = (functionTypesJson?.data?.appDiscountTypes || []).filter(
//       (t) => (currentAppKey ? t?.appKey === currentAppKey : true),
//     );
//     const availableFunctionIds = new Set(
//       availableFunctionTypes.map((t) => t?.functionId).filter(Boolean),
//     );
//     if (functionId && !availableFunctionIds.has(functionId)) {
//       return {
//         ok: false,
//         errors: {
//           functionId:
//             "This Function ID is not available for the current app. Select from dropdown.",
//         },
//       };
//     }

//     const automaticAppDiscount = {
//       title,
//       ...(functionId ? { functionId } : {}),
//       ...(functionHandle ? { functionHandle } : {}),
//       startsAt: startsAt.toISOString(),
//       ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
//       context: segmentId ? { customerSegments: { add: [segmentId] } } : { all: "ALL" },
//       appliesOnOneTimePurchase,
//       appliesOnSubscription,
//       combinesWith: {
//         orderDiscounts: combinesWithOrder,
//         productDiscounts: combinesWithProduct,
//         shippingDiscounts: combinesWithShipping,
//       },
//       metafields: [
//         {
//           namespace: "default",
//           key: "function-configuration",
//           type: "json",
//           value: makeFunctionConfig({ percentage }),
//         },
//       ],
//     };
//     const mutation = intent === "update" ? UPDATE_CUSTOM : CREATE_CUSTOM;
//     const variables = intent === "update" ? { id, automaticAppDiscount } : { automaticAppDiscount };
//     let json;
//     try {
//       const response = await admin.graphql(mutation, { variables });
//       json = await response.json();
//     } catch (error) {
//       return {
//         ok: false,
//         errors: { runtime: [{ message: error?.message || "Failed to create/update custom discount" }] },
//       };
//     }
//     const payload =
//       intent === "update"
//         ? json?.data?.discountAutomaticAppUpdate
//         : json?.data?.discountAutomaticAppCreate;
//     if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
//     if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
//     return { ok: true };
//   }

//   const basicCodeDiscount = {
//     title,
//     code,
//     startsAt: startsAt.toISOString(),
//     ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
//     context: segmentId ? { customerSegments: { add: [segmentId] } } : { all: "ALL" },
//     combinesWith: {
//       orderDiscounts: combinesWithOrder,
//       productDiscounts: combinesWithProduct,
//       shippingDiscounts: combinesWithShipping,
//     },
//     customerGets: { items: { all: true }, value: { percentage: percentage / 100 } },
//   };
//   const mutation = intent === "update" ? UPDATE_CODE : CREATE_CODE;
//   const variables = intent === "update" ? { id, basicCodeDiscount } : { basicCodeDiscount };
//   let json;
//   try {
//     const response = await admin.graphql(mutation, { variables });
//     json = await response.json();
//   } catch (error) {
//     return {
//       ok: false,
//       errors: { runtime: [{ message: error?.message || "Failed to create/update code discount" }] },
//     };
//   }
//   const payload = intent === "update" ? json?.data?.discountCodeBasicUpdate : json?.data?.discountCodeBasicCreate;
//   if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
//   if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
//   return { ok: true };
// };

// export default function DiscountsIndex() {
//   const { nodes, appDiscountTypes, errors, editDiscount } = useLoaderData();
//   const actionData = useActionData();
//   const location = useLocation();
//   const [filter, setFilter] = useState("");
//   const [mode, setMode] = useState(editDiscount?.mode || "custom");
//   const [title, setTitle] = useState(editDiscount?.title || "Custom discount");
//   const [code, setCode] = useState(editDiscount?.code || "WELCOME10");
//   const [functionId, setFunctionId] = useState(editDiscount?.functionId || "");
//   const [functionHandle, setFunctionHandle] = useState("");
//   const [startsAt, setStartsAt] = useState("");
//   const [endsAt, setEndsAt] = useState("");
//   const [segmentId, setSegmentId] = useState("");
//   const [combinesWithOrder, setCombinesWithOrder] = useState(false);
//   const [combinesWithProduct, setCombinesWithProduct] = useState(false);
//   const [combinesWithShipping, setCombinesWithShipping] = useState(false);
//   const [appliesOnOneTimePurchase, setAppliesOnOneTimePurchase] = useState(true);
//   const [appliesOnSubscription, setAppliesOnSubscription] = useState(false);
//   const [percentage, setPercentage] = useState("10");

//   useEffect(() => {
//     setMode(editDiscount?.mode || "custom");
//     setTitle(editDiscount?.title || "Custom discount");
//     setCode(editDiscount?.code || "WELCOME10");
//     setFunctionId(editDiscount?.functionId || "");
//     setStartsAt(editDiscount?.startsAt || "");
//     setEndsAt(editDiscount?.endsAt || "");
//   }, [editDiscount]);

//   const withShopifyParams = (path) => {
//     const [pathname, existingQuery = ""] = path.split("?");
//     const current = new URLSearchParams(location.search);
//     const keep = new URLSearchParams(existingQuery);
//     for (const key of ["host", "shop"]) {
//       const val = current.get(key);
//       if (val && !keep.has(key)) keep.set(key, val);
//     }
//     const qs = keep.toString();
//     return qs ? `${pathname}?${qs}` : pathname;
//   };

//   const filtered = useMemo(() => {
//     const q = filter.trim().toLowerCase();
//     if (!q) return nodes;
//     return nodes.filter((n) => {
//       const d = n.discount || {};
//       const codeVal = d?.codes?.nodes?.[0]?.code || "";
//       const text = `${d.title || ""} ${codeVal} ${d.__typename || ""}`;
//       return text.toLowerCase().includes(q);
//     });
//   }, [filter, nodes]);

//   const functionOptions = useMemo(() => {
//     const byId = new Map();
//     for (const t of appDiscountTypes || []) {
//       const id = t?.functionId;
//       if (!id) continue;
//       byId.set(id, t?.title ? `${t.title} — ${id}` : id);
//     }
//     for (const n of nodes || []) {
//       const d = n?.discount;
//       if (d?.__typename !== "DiscountAutomaticApp") continue;
//       const id = d?.appDiscountType?.functionId;
//       if (!id || byId.has(id)) continue;
//       byId.set(id, `${d?.title || "Existing discount"} — ${id}`);
//     }
//     return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
//   }, [appDiscountTypes, nodes]);

//   useEffect(() => {
//     if (mode === "custom" && !editDiscount && !functionId && functionOptions.length) {
//       setFunctionId(functionOptions[0].id || "");
//     }
//   }, [editDiscount, functionId, functionOptions, mode]);

//   return (
//     <s-page heading="Discounts">
//       <s-section heading={editDiscount ? "Edit discount" : "Create discount"}>
//         <Form method="post">
//           {editDiscount ? <input type="hidden" name="id" value={editDiscount.id} /> : null}
//           <label style={{ display: "block", marginBottom: 8 }}>
//             <div style={{ marginBottom: 4 }}>Mode</div>
//             <select name="mode" value={mode} onChange={(e) => setMode(e.currentTarget.value)}>
//               <option value="custom">Custom automatic (app function)</option>
//               <option value="code">Code discount</option>
//             </select>
//             {actionData?.errors?.mode ? (
//               <p style={{ color: "#8a1f17", marginTop: 6 }}>{actionData.errors.mode}</p>
//             ) : null}
//           </label>
//           <s-text-field name="title" label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} error={actionData?.errors?.title} autocomplete="off"></s-text-field>
//           {mode === "code" ? (
//             <s-text-field name="code" label="Code" value={code} onChange={(e) => setCode(e.currentTarget.value)} error={actionData?.errors?.code} autocomplete="off"></s-text-field>
//           ) : (
//             <>
//               <label style={{ display: "block", marginBottom: 8 }}>
//                 <div style={{ marginBottom: 4 }}>Available function IDs</div>
//                 <select
//                   value={functionId}
//                   onChange={(e) => setFunctionId(e.currentTarget.value)}
//                   required={mode === "custom" && !functionHandle}
//                   style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #c9cccf" }}
//                 >
//                   <option value="">Select function ID</option>
//                   {functionOptions.map((t) => (
//                     <option key={t.id} value={t.id}>
//                       {t.label}
//                     </option>
//                   ))}
//                 </select>
//                 {!functionOptions.length ? (
//                   <p style={{ marginTop: 6, color: "#6d7175" }}>
//                     No function IDs found. Deploy/release your discount function, then refresh.
//                   </p>
//                 ) : null}
//               </label>
//               <s-text-field name="functionId" label="Function ID" value={functionId} onChange={(e) => setFunctionId(e.currentTarget.value)} error={actionData?.errors?.functionId} autocomplete="off"></s-text-field>
//               <s-text-field name="functionHandle" label="Function Handle (optional)" value={functionHandle} onChange={(e) => setFunctionHandle(e.currentTarget.value)} autocomplete="off"></s-text-field>
//             </>
//           )}
//           <s-text-field name="percentage" label="Percentage off" value={percentage} onChange={(e) => setPercentage(e.currentTarget.value)} error={actionData?.errors?.percentage} autocomplete="off"></s-text-field>
//           <s-text-field name="startsAt" label="Starts at (ISO, optional)" value={startsAt} onChange={(e) => setStartsAt(e.currentTarget.value)} error={actionData?.errors?.startsAt} autocomplete="off"></s-text-field>
//           <s-text-field name="endsAt" label="Ends at (ISO, optional)" value={endsAt} onChange={(e) => setEndsAt(e.currentTarget.value)} error={actionData?.errors?.endsAt} autocomplete="off"></s-text-field>
//           <s-text-field name="segmentId" label="Customer segment ID (optional)" value={segmentId} onChange={(e) => setSegmentId(e.currentTarget.value)} autocomplete="off"></s-text-field>
//           <label style={{ display: "block", marginBottom: 6 }}>
//             <input type="checkbox" name="combinesWithOrder" checked={combinesWithOrder} onChange={(e) => setCombinesWithOrder(e.currentTarget.checked)} />{" "}
//             Combine with order discounts
//           </label>
//           <label style={{ display: "block", marginBottom: 6 }}>
//             <input type="checkbox" name="combinesWithProduct" checked={combinesWithProduct} onChange={(e) => setCombinesWithProduct(e.currentTarget.checked)} />{" "}
//             Combine with product discounts
//           </label>
//           <label style={{ display: "block", marginBottom: 6 }}>
//             <input type="checkbox" name="combinesWithShipping" checked={combinesWithShipping} onChange={(e) => setCombinesWithShipping(e.currentTarget.checked)} />{" "}
//             Combine with shipping discounts
//           </label>
//           {mode === "custom" ? (
//             <>
//               <label style={{ display: "block", marginBottom: 6 }}>
//                 <input type="checkbox" name="appliesOnOneTimePurchase" checked={appliesOnOneTimePurchase} onChange={(e) => setAppliesOnOneTimePurchase(e.currentTarget.checked)} />{" "}
//                 Applies on one-time purchases
//               </label>
//               <label style={{ display: "block", marginBottom: 6 }}>
//                 <input type="checkbox" name="appliesOnSubscription" checked={appliesOnSubscription} onChange={(e) => setAppliesOnSubscription(e.currentTarget.checked)} />{" "}
//                 Applies on subscription
//               </label>
//             </>
//           ) : null}
//           <s-stack direction="inline" gap="base">
//             <s-button type="submit" name="intent" value={editDiscount ? "update" : "create"}>
//               {editDiscount ? "Update" : "Create"}
//             </s-button>
//             {editDiscount ? <a href={withShopifyParams("/app/discounts")}>Cancel edit</a> : null}
//           </s-stack>
//         </Form>
//       </s-section>

//       {(errors?.length || actionData?.errors) ? (
//         <s-section heading="Errors">
//           <s-box padding="base" borderWidth="base" borderRadius="base" background="critical-subdued">
//             <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}><code>{JSON.stringify(errors || actionData?.errors, null, 2)}</code></pre>
//           </s-box>
//         </s-section>
//       ) : null}

//       <s-section heading="All discounts">
//         <s-text-field label="Search" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} autocomplete="off"></s-text-field>
//         <s-box padding="base" borderWidth="base" borderRadius="base">
//           <div style={{ overflowX: "auto" }}>
//             <table style={{ width: "100%", borderCollapse: "collapse" }}>
//               <thead>
//                 <tr>
//                   <th style={{ textAlign: "left", padding: "8px" }}>Title</th>
//                   <th style={{ textAlign: "left", padding: "8px" }}>Method</th>
//                   <th style={{ textAlign: "left", padding: "8px" }}>Code/Function</th>
//                   <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
//                   <th style={{ textAlign: "left", padding: "8px" }}>Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filtered.map((n) => {
//                   const d = n.discount || {};
//                   const method = d.__typename === "DiscountAutomaticApp" ? "Automatic" : "Code";
//                   const ref = d.__typename === "DiscountAutomaticApp"
//                     ? d?.appDiscountType?.functionId || "—"
//                     : d?.codes?.nodes?.[0]?.code || "—";
//                   return (
//                     <tr key={n.id} style={{ borderTop: "1px solid #e1e3e5" }}>
//                       <td style={{ padding: "8px" }}>{d.title || "—"}</td>
//                       <td style={{ padding: "8px" }}>{method}</td>
//                       <td style={{ padding: "8px" }}>{ref}</td>
//                       <td style={{ padding: "8px" }}>{d.status || "—"}</td>
//                       <td style={{ padding: "8px" }}>
//                         <s-stack direction="inline" gap="base">
//                           <a href={withShopifyParams(`/app/discounts?editId=${encodeURIComponent(n.id)}`)}>Edit</a>
//                           <Form method="post">
//                             <input type="hidden" name="id" value={n.id} />
//                             <button type="submit" name="intent" value="delete" style={{ border: "none", background: "transparent", color: "#8a1f17", cursor: "pointer" }}>
//                               Delete
//                             </button>
//                           </Form>
//                         </s-stack>
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>
//         </s-box>
//       </s-section>
//     </s-page>
//   );
// }

// export function ErrorBoundary() {
//   return boundary.error(useRouteError());
// }

// export const headers = (headersArgs) => boundary.headers(headersArgs);



import { useEffect, useMemo, useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const LIST_DISCOUNTS = `#graphql
  query ListDiscountNodes($first: Int!) {
    discountNodes(first: $first, reverse: true) {
      nodes {
        id
        discount {
          __typename
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 1) { nodes { code } }
          }
          ... on DiscountAutomaticApp {
            title
            status
            startsAt
            endsAt
            appliesOnOneTimePurchase
            appliesOnSubscription
            discountClasses
            combinesWith {
              orderDiscounts
              productDiscounts
              shippingDiscounts
            }
            appDiscountType { functionId }
          }
        }
      }
    }
    appDiscountTypes {
      functionId
      title
    }
  }
`;

const LIST_APP_DISCOUNT_TYPES = `#graphql
  query ListAppDiscountTypes {
    appDiscountTypes {
      functionId
    }
  }
`;

const CREATE_CODE = `#graphql
  mutation CreateCode($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;
const UPDATE_CODE = `#graphql
  mutation UpdateCode($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;
const CREATE_CUSTOM = `#graphql
  mutation CreateCustom($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount { discountId title }
      userErrors { field message }
    }
  }
`;
const UPDATE_CUSTOM = `#graphql
  mutation UpdateCustom($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount { discountId title }
      userErrors { field message }
    }
  }
`;
const DELETE_CODE = `#graphql
  mutation DeleteCode($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field message }
    }
  }
`;
const DELETE_AUTOMATIC = `#graphql
  mutation DeleteAutomatic($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;

function makeFunctionConfig({ percentage }) {
  return JSON.stringify({
    discounts: [
      {
        value: { percentage: { value: percentage / 100 } },
        targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
      },
    ],
    discountApplicationStrategy: "FIRST",
  });
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const editId = url.searchParams.get("editId");

  const response = await admin.graphql(LIST_DISCOUNTS, { variables: { first: 50 } });
  const json = await response.json();
  const nodes = json?.data?.discountNodes?.nodes || [];
  const appDiscountTypes = json?.data?.appDiscountTypes || [];

  const found = editId ? nodes.find((n) => n.id === editId) : null;
  const discount = found?.discount;
  const editDiscount = found
    ? {
        id: found.id,
        mode: discount?.__typename === "DiscountAutomaticApp" ? "custom" : "code",
        title: discount?.title || "",
        code: discount?.codes?.nodes?.[0]?.code || "",
        functionId: discount?.appDiscountType?.functionId || "",
        discountClasses: discount?.discountClasses || [],
        combinesWithOrder: Boolean(discount?.combinesWith?.orderDiscounts),
        combinesWithProduct: Boolean(discount?.combinesWith?.productDiscounts),
        combinesWithShipping: Boolean(discount?.combinesWith?.shippingDiscounts),
        appliesOnOneTimePurchase: discount?.appliesOnOneTimePurchase ?? true,
        appliesOnSubscription: discount?.appliesOnSubscription ?? false,
        percentage: "10",
        startsAt: discount?.startsAt || "",
        endsAt: discount?.endsAt || "",
      }
    : null;

  return { nodes, appDiscountTypes, editDiscount, errors: json?.errors || null };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const id = String(formData.get("id") || "");
  const modeRaw = String(formData.get("mode") || "code").trim().toLowerCase();
  const mode = modeRaw === "custom" ? "custom" : "code";

  if (intent === "delete") {
    const isAutomatic = id.includes("DiscountAutomaticNode");
    const response = await admin.graphql(isAutomatic ? DELETE_AUTOMATIC : DELETE_CODE, {
      variables: { id },
    });
    const json = await response.json();
    const payload = isAutomatic
      ? json?.data?.discountAutomaticDelete
      : json?.data?.discountCodeDelete;
    if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
    if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
    return { ok: true };
  }

  const title = String(formData.get("title") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const functionId = String(formData.get("functionId") || "").trim();
  const functionHandle = String(formData.get("functionHandle") || "").trim();
  const startsAtRaw = String(formData.get("startsAt") || "").trim();
  const endsAtRaw = String(formData.get("endsAt") || "").trim();
  const segmentId = String(formData.get("segmentId") || "").trim();
  const combinesWithOrder = String(formData.get("combinesWithOrder") || "") === "on";
  const combinesWithProduct = String(formData.get("combinesWithProduct") || "") === "on";
  const combinesWithShipping = String(formData.get("combinesWithShipping") || "") === "on";
  const appliesOnOneTimePurchase =
    String(formData.get("appliesOnOneTimePurchase") || "") === "on";
  const appliesOnSubscription =
    String(formData.get("appliesOnSubscription") || "") === "on";
  const discountClassProduct = String(formData.get("discountClassProduct") || "") === "on";
  const discountClassOrder = String(formData.get("discountClassOrder") || "") === "on";
  const discountClassShipping = String(formData.get("discountClassShipping") || "") === "on";
  const discountClasses = [
    ...(discountClassProduct ? ["PRODUCT"] : []),
    ...(discountClassOrder ? ["ORDER"] : []),
    ...(discountClassShipping ? ["SHIPPING"] : []),
  ];
  const percentage = Number(String(formData.get("percentage") || "").trim());
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : new Date();
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

  const errors = {};
  if (!["code", "custom"].includes(modeRaw)) {
    errors.mode = 'Mode must be "code" or "custom"';
  }
  if (!title) errors.title = "Title is required";
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    errors.percentage = "Percentage must be between 1 and 100";
  }
  if (mode === "code" && !code) errors.code = "Code is required";
  if (mode === "custom" && !functionId && !functionHandle) {
    errors.functionId = "Function ID or Function Handle is required";
  }
  if (mode === "custom" && !discountClasses.length) {
    errors.discountClasses = "Select at least one discount class (Product, Order, or Shipping)";
  }
  if (startsAtRaw && Number.isNaN(startsAt.getTime())) errors.startsAt = "Invalid start date";
  if (endsAtRaw && (!endsAt || Number.isNaN(endsAt.getTime()))) {
    errors.endsAt = "Invalid end date";
  }
  if (!Number.isNaN(startsAt.getTime())) {
    const y = startsAt.getUTCFullYear();
    if (y < 1970 || y > 9999) errors.startsAt = "Start date year must be between 1970 and 9999";
  }
  if (endsAt && !Number.isNaN(endsAt.getTime())) {
    const y = endsAt.getUTCFullYear();
    if (y < 1970 || y > 9999) errors.endsAt = "End date year must be between 1970 and 9999";
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.endsAt = "End date must be after start date";
  }
  if (mode === "custom" && !functionHandle && functionId) {
    try {
      const typesResponse = await admin.graphql(LIST_APP_DISCOUNT_TYPES);
      const typesJson = await typesResponse.json();
      const availableFunctionIds = new Set(
        (typesJson?.data?.appDiscountTypes || []).map((t) => t?.functionId).filter(Boolean),
      );
      if (!availableFunctionIds.has(functionId)) {
        errors.functionId =
          "Selected Function ID is no longer available in this app. Pick a current one or use Function Handle.";
      }
    } catch {
      errors.functionId =
        "Unable to validate Function ID right now. Try using Function Handle or refresh and submit again.";
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  if (mode === "custom") {
    // Prefer functionHandle (stable string from shopify.extension.toml, always scoped
    // to the installed app) over functionId (UUID that can become stale across deploys).
    // Never send both — Shopify rejects the mutation if both fields are present.
    const functionRef = functionHandle
      ? { functionHandle }
      : functionId
      ? { functionId }
      : {};

    const automaticAppDiscount = {
      title,
      ...functionRef,
      startsAt: startsAt.toISOString(),
      ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
      // NOTE: DiscountAutomaticAppInput does NOT have a `context` or `customerGets` field.
      // Customer segment targeting is handled inside the function metafield config below.
      discountClasses,
      appliesOnOneTimePurchase,
      appliesOnSubscription,
      combinesWith: {
        orderDiscounts: combinesWithOrder,
        productDiscounts: combinesWithProduct,
        shippingDiscounts: combinesWithShipping,
      },
      metafields: [
        {
          namespace: "default",
          key: "function-configuration",
          type: "json",
          value: makeFunctionConfig({ percentage }),
        },
      ],
    };

    const mutation = intent === "update" ? UPDATE_CUSTOM : CREATE_CUSTOM;
    const variables = intent === "update" ? { id, automaticAppDiscount } : { automaticAppDiscount };
    let json;
    try {
      const response = await admin.graphql(mutation, { variables });
      json = await response.json();
    } catch (error) {
      return {
        ok: false,
        errors: { runtime: [{ message: error?.message || "Failed to create/update custom discount" }] },
      };
    }
    const payload =
      intent === "update"
        ? json?.data?.discountAutomaticAppUpdate
        : json?.data?.discountAutomaticAppCreate;
    if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
    if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
    return { ok: true };
  }

  // Code discount — uses `customerSelection` (not `context`) for targeting
  const basicCodeDiscount = {
    title,
    code,
    startsAt: startsAt.toISOString(),
    ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
    customerSelection: segmentId
      ? { customerSegments: { add: [segmentId] } }
      : { all: true },
    combinesWith: {
      orderDiscounts: combinesWithOrder,
      productDiscounts: combinesWithProduct,
      shippingDiscounts: combinesWithShipping,
    },
    customerGets: { items: { all: true }, value: { percentage: percentage / 100 } },
  };

  const mutation = intent === "update" ? UPDATE_CODE : CREATE_CODE;
  const variables = intent === "update" ? { id, basicCodeDiscount } : { basicCodeDiscount };
  let json;
  try {
    const response = await admin.graphql(mutation, { variables });
    json = await response.json();
  } catch (error) {
    return {
      ok: false,
      errors: { runtime: [{ message: error?.message || "Failed to create/update code discount" }] },
    };
  }
  const payload = intent === "update" ? json?.data?.discountCodeBasicUpdate : json?.data?.discountCodeBasicCreate;
  if (json?.errors?.length) return { ok: false, errors: { graphql: json.errors } };
  if (payload?.userErrors?.length) return { ok: false, errors: { shopify: payload.userErrors } };
  return { ok: true };
};

export default function DiscountsIndex() {
  const { nodes, appDiscountTypes, errors, editDiscount } = useLoaderData();
  const actionData = useActionData();
  const location = useLocation();
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState(editDiscount?.mode || "custom");
  const [title, setTitle] = useState(editDiscount?.title || "Custom discount");
  const [code, setCode] = useState(editDiscount?.code || "WELCOME10");
  const [functionId, setFunctionId] = useState(editDiscount?.functionId || "");
  const [functionHandle, setFunctionHandle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [combinesWithOrder, setCombinesWithOrder] = useState(editDiscount?.combinesWithOrder ?? false);
  const [combinesWithProduct, setCombinesWithProduct] = useState(
    editDiscount?.combinesWithProduct ?? false,
  );
  const [combinesWithShipping, setCombinesWithShipping] = useState(
    editDiscount?.combinesWithShipping ?? false,
  );
  const [appliesOnOneTimePurchase, setAppliesOnOneTimePurchase] = useState(
    editDiscount?.appliesOnOneTimePurchase ?? true,
  );
  const [appliesOnSubscription, setAppliesOnSubscription] = useState(
    editDiscount?.appliesOnSubscription ?? false,
  );
  const [discountClassProduct, setDiscountClassProduct] = useState(
    editDiscount?.discountClasses?.includes("PRODUCT") ?? true,
  );
  const [discountClassOrder, setDiscountClassOrder] = useState(
    editDiscount?.discountClasses?.includes("ORDER") ?? false,
  );
  const [discountClassShipping, setDiscountClassShipping] = useState(
    editDiscount?.discountClasses?.includes("SHIPPING") ?? true,
  );
  const [percentage, setPercentage] = useState(editDiscount?.percentage || "10");

  useEffect(() => {
    setMode(editDiscount?.mode || "custom");
    setTitle(editDiscount?.title || "Custom discount");
    setCode(editDiscount?.code || "WELCOME10");
    setFunctionId(editDiscount?.functionId || "");
    setDiscountClassProduct(editDiscount?.discountClasses?.includes("PRODUCT") ?? true);
    setDiscountClassOrder(editDiscount?.discountClasses?.includes("ORDER") ?? false);
    setDiscountClassShipping(editDiscount?.discountClasses?.includes("SHIPPING") ?? true);
    setCombinesWithOrder(editDiscount?.combinesWithOrder ?? false);
    setCombinesWithProduct(editDiscount?.combinesWithProduct ?? false);
    setCombinesWithShipping(editDiscount?.combinesWithShipping ?? false);
    setAppliesOnOneTimePurchase(editDiscount?.appliesOnOneTimePurchase ?? true);
    setAppliesOnSubscription(editDiscount?.appliesOnSubscription ?? false);
    setPercentage(editDiscount?.percentage || "10");
    setStartsAt(editDiscount?.startsAt || "");
    setEndsAt(editDiscount?.endsAt || "");
  }, [editDiscount]);

  const withShopifyParams = (path) => {
    const [pathname, existingQuery = ""] = path.split("?");
    const current = new URLSearchParams(location.search);
    const keep = new URLSearchParams(existingQuery);
    for (const key of ["host", "shop"]) {
      const val = current.get(key);
      if (val && !keep.has(key)) keep.set(key, val);
    }
    const qs = keep.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => {
      const d = n.discount || {};
      const codeVal = d?.codes?.nodes?.[0]?.code || "";
      const text = `${d.title || ""} ${codeVal} ${d.__typename || ""}`;
      return text.toLowerCase().includes(q);
    });
  }, [filter, nodes]);

  const functionOptions = useMemo(() => {
    const byId = new Map();
    for (const t of appDiscountTypes || []) {
      const id = t?.functionId;
      if (!id) continue;
      byId.set(id, t?.title ? `${t.title} — ${id}` : id);
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [appDiscountTypes]);

  useEffect(() => {
    if (mode === "custom" && !editDiscount && !functionId && functionOptions.length) {
      setFunctionId(functionOptions[0].id || "");
    }
  }, [editDiscount, functionId, functionOptions, mode]);

  useEffect(() => {
    if (mode !== "custom" || functionHandle) return;
    if (!functionOptions.length) return;
    const validIds = new Set(functionOptions.map((o) => o.id));
    if (!functionId || !validIds.has(functionId)) {
      setFunctionId(functionOptions[0].id || "");
    }
  }, [functionHandle, functionId, functionOptions, mode]);

  return (
    <s-page heading="Discounts">
      <s-section heading={editDiscount ? "Edit discount" : "Create discount"}>
        <Form method="post">
          {editDiscount ? <input type="hidden" name="id" value={editDiscount.id} /> : null}
          <input type="hidden" name="intent" value={editDiscount ? "update" : "create"} />
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ marginBottom: 4 }}>Mode</div>
            <select name="mode" value={mode} onChange={(e) => setMode(e.currentTarget.value)}>
              <option value="custom">Custom automatic (app function)</option>
              <option value="code">Code discount</option>
            </select>
            {actionData?.errors?.mode ? (
              <p style={{ color: "#8a1f17", marginTop: 6 }}>{actionData.errors.mode}</p>
            ) : null}
          </label>
          <s-text-field name="title" label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} error={actionData?.errors?.title} autocomplete="off"></s-text-field>
          {mode === "code" ? (
            <s-text-field name="code" label="Code" value={code} onChange={(e) => setCode(e.currentTarget.value)} error={actionData?.errors?.code} autocomplete="off"></s-text-field>
          ) : (
            <>
              <input type="hidden" name="functionId" value={functionId} />
              <label style={{ display: "block", marginBottom: 8 }}>
                <div style={{ marginBottom: 4 }}>Available function IDs</div>
                <select
                  value={functionId}
                  onChange={(e) => setFunctionId(e.currentTarget.value)}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #c9cccf" }}
                >
                  <option value="">Select function ID</option>
                  {functionOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {!functionOptions.length ? (
                  <p style={{ marginTop: 6, color: "#6d7175" }}>
                    No function IDs found. Deploy/release your discount function, then refresh.
                  </p>
                ) : null}
              </label>
              <s-text-field label="Function ID (UUID)" value={functionId} onChange={(e) => setFunctionId(e.currentTarget.value)} error={actionData?.errors?.functionId} autocomplete="off"></s-text-field>
              <s-text-field
                name="functionHandle"
                label="Function Handle (preferred — from shopify.extension.toml)"
                value={functionHandle}
                onChange={(e) => setFunctionHandle(e.currentTarget.value)}
                autocomplete="off"
              ></s-text-field>
              <p style={{ marginTop: 4, marginBottom: 8, color: "#6d7175", fontSize: 13 }}>
                Tip: Function Handle (e.g. <code>order-discount</code>) is more reliable than the UUID and won't break across deploys. If both are provided, Handle is used.
              </p>
            </>
          )}
          <s-text-field name="percentage" label="Percentage off" value={percentage} onChange={(e) => setPercentage(e.currentTarget.value)} error={actionData?.errors?.percentage} autocomplete="off"></s-text-field>
          <s-text-field name="startsAt" label="Starts at (ISO, optional)" value={startsAt} onChange={(e) => setStartsAt(e.currentTarget.value)} error={actionData?.errors?.startsAt} autocomplete="off"></s-text-field>
          <s-text-field name="endsAt" label="Ends at (ISO, optional)" value={endsAt} onChange={(e) => setEndsAt(e.currentTarget.value)} error={actionData?.errors?.endsAt} autocomplete="off"></s-text-field>
          <s-text-field name="segmentId" label="Customer segment ID (optional)" value={segmentId} onChange={(e) => setSegmentId(e.currentTarget.value)} autocomplete="off"></s-text-field>
          <label style={{ display: "block", marginBottom: 6 }}>
            <input type="checkbox" name="combinesWithOrder" checked={combinesWithOrder} onChange={(e) => setCombinesWithOrder(e.currentTarget.checked)} />{" "}
            Combine with order discounts
          </label>
          <label style={{ display: "block", marginBottom: 6 }}>
            <input type="checkbox" name="combinesWithProduct" checked={combinesWithProduct} onChange={(e) => setCombinesWithProduct(e.currentTarget.checked)} />{" "}
            Combine with product discounts
          </label>
          <label style={{ display: "block", marginBottom: 6 }}>
            <input type="checkbox" name="combinesWithShipping" checked={combinesWithShipping} onChange={(e) => setCombinesWithShipping(e.currentTarget.checked)} />{" "}
            Combine with shipping discounts
          </label>
          {mode === "custom" ? (
            <>
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="checkbox" name="discountClassProduct" checked={discountClassProduct} onChange={(e) => setDiscountClassProduct(e.currentTarget.checked)} />{" "}
                Discount class: Product
              </label>
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="checkbox" name="discountClassOrder" checked={discountClassOrder} onChange={(e) => setDiscountClassOrder(e.currentTarget.checked)} />{" "}
                Discount class: Order
              </label>
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="checkbox" name="discountClassShipping" checked={discountClassShipping} onChange={(e) => setDiscountClassShipping(e.currentTarget.checked)} />{" "}
                Discount class: Shipping
              </label>
              {actionData?.errors?.discountClasses ? (
                <p style={{ color: "#8a1f17", marginTop: 4, marginBottom: 8 }}>
                  {actionData.errors.discountClasses}
                </p>
              ) : null}
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="checkbox" name="appliesOnOneTimePurchase" checked={appliesOnOneTimePurchase} onChange={(e) => setAppliesOnOneTimePurchase(e.currentTarget.checked)} />{" "}
                Applies on one-time purchases
              </label>
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="checkbox" name="appliesOnSubscription" checked={appliesOnSubscription} onChange={(e) => setAppliesOnSubscription(e.currentTarget.checked)} />{" "}
                Applies on subscription
              </label>
            </>
          ) : null}
          <s-stack direction="inline" gap="base">
            <s-button type="submit">
              {editDiscount ? "Update" : "Create"}
            </s-button>
            {editDiscount ? <a href={withShopifyParams("")}>Cancel edit</a> : null}
          </s-stack>
        </Form>
      </s-section>

      {(errors?.length || actionData?.errors) ? (
        <s-section heading="Errors">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="critical-subdued">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}><code>{JSON.stringify(errors || actionData?.errors, null, 2)}</code></pre>
          </s-box>
        </s-section>
      ) : null}

      <s-section heading="All discounts">
        <s-text-field label="Search" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} autocomplete="off"></s-text-field>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Method</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Code/Function</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const d = n.discount || {};
                  const method = d.__typename === "DiscountAutomaticApp" ? "Automatic" : "Code";
                  const ref = d.__typename === "DiscountAutomaticApp"
                    ? d?.appDiscountType?.functionId || "—"
                    : d?.codes?.nodes?.[0]?.code || "—";
                  return (
                    <tr key={n.id} style={{ borderTop: "1px solid #e1e3e5" }}>
                      <td style={{ padding: "8px" }}>{d.title || "—"}</td>
                      <td style={{ padding: "8px" }}>{method}</td>
                      <td style={{ padding: "8px" }}>{ref}</td>
                      <td style={{ padding: "8px" }}>{d.status || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        <s-stack direction="inline" gap="base">
                          <Form method="get" action={withShopifyParams("")}>
                            <input type="hidden" name="editId" value={n.id} />
                            <button
                              type="submit"
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#005bd3",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Edit
                            </button>
                          </Form>
                          <Form method="post">
                            <input type="hidden" name="id" value={n.id} />
                            <button type="submit" name="intent" value="delete" style={{ border: "none", background: "transparent", color: "#8a1f17", cursor: "pointer" }}>
                              Delete
                            </button>
                          </Form>
                        </s-stack>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </s-box>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);