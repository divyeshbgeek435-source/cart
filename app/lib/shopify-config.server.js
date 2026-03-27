import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Same value as shopify.app.toml client_id. Used when SHOPIFY_API_KEY is missing in env.
 */
export function readClientIdFromToml() {
  try {
    const tomlPath = join(__dirname, "..", "..", "shopify.app.toml");
    const toml = readFileSync(tomlPath, "utf8");
    const match = toml.match(/^\s*client_id\s*=\s*"([^"]+)"/m);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

export function getShopifyAppClientId() {
  const fromEnv =
    process.env.SHOPIFY_API_KEY?.trim() ||
    process.env.SHOPIFY_APP_API_KEY?.trim() ||
    "";
  return fromEnv || readClientIdFromToml();
}
