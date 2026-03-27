import { Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { getShopifyAppClientId } from "../lib/shopify-config.server";
import { authenticate } from "../shopify.server";

const APP_EMBED_BLOCK_HANDLE = "free-shipping-progress-embed";
const CART_PAGE_BLOCK_HANDLE = "free-shipping-progress-block";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");

  const clientId = getShopifyAppClientId();
  const apiKeyForBridge =
    process.env.SHOPIFY_API_KEY?.trim() || clientId;

  const appEmbedQuery = new URLSearchParams({
    context: "apps",
    activateAppId: `${clientId}/${APP_EMBED_BLOCK_HANDLE}`,
  });
  const cartBlockQuery = new URLSearchParams({
    template: "cart",
    addAppBlockId: `${clientId}/${CART_PAGE_BLOCK_HANDLE}`,
    target: "newAppsSection",
  });

  const editorBase = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`;

  const onboarding = {
    shop,
    storeHandle,
    clientIdConfigured: Boolean(clientId),
    appEmbedEditorUrl: `${editorBase}?${appEmbedQuery.toString()}`,
    cartBlockEditorUrl: `${editorBase}?${cartBlockQuery.toString()}`,
    legacyAppEmbedUrl: `https://${shop}/admin/themes/current/editor?${appEmbedQuery.toString()}`,
    legacyCartBlockUrl: `https://${shop}/admin/themes/current/editor?${cartBlockQuery.toString()}`,
    appEmbedHandle: APP_EMBED_BLOCK_HANDLE,
    cartBlockHandle: CART_PAGE_BLOCK_HANDLE,
  };

  return { apiKey: apiKeyForBridge, onboarding };
};

export default function App() {
  const { apiKey, onboarding } = useLoaderData();
  const location = useLocation();

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

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={withShopifyParams("/app")}>Home</s-link>
        <s-link href={withShopifyParams("/app/discounts")}>Discounts</s-link>
        <s-link href={withShopifyParams("/app/additional")}>Additional page</s-link>
      </s-app-nav>
      <Outlet context={{ onboarding }} />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
