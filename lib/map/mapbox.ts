// MapLibre GL JS cannot resolve the `mapbox://` protocol that Mapbox styles use
// for their sources, sprites and glyphs. This rewrites those references to the
// public HTTP endpoints and attaches the token.
import type { RequestParameters, StyleSpecification } from "maplibre-gl";

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Mapbox style id used when a token is present. Override per deployment. */
export const MAPBOX_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox/dark-v11";

const CARTO_FALLBACK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function styleUrl(): string {
  if (!MAPBOX_TOKEN) return CARTO_FALLBACK;
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}?access_token=${MAPBOX_TOKEN}`;
}

export const usingMapbox = () => Boolean(MAPBOX_TOKEN);

const withToken = (url: string) => `${url}${url.includes("?") ? "&" : "?"}access_token=${MAPBOX_TOKEN}`;

export function transformRequest(url: string, _resourceType?: string): RequestParameters {
  if (!MAPBOX_TOKEN || !url.startsWith("mapbox://")) return { url };

  const rest = url.replace("mapbox://", "");

  // mapbox://sprites/mapbox/dark-v11[@2x][.png|.json]
  // The density suffix and extension belong AFTER `/sprite`, not on the style id.
  if (rest.startsWith("sprites/")) {
    const m = /^sprites\/([^@.]+)(@[0-9]+x)?(\.[a-z]+)?$/.exec(rest);
    if (m) {
      const [, styleId, density = "", ext = ""] = m;
      return { url: withToken(`https://api.mapbox.com/styles/v1/${styleId}/sprite${density}${ext}`) };
    }
    return { url: withToken(`https://api.mapbox.com/styles/v1/${rest.replace("sprites/", "")}/sprite`) };
  }

  // mapbox://fonts/mapbox/{fontstack}/{range}.pbf
  if (rest.startsWith("fonts/")) {
    return { url: withToken(`https://api.mapbox.com/fonts/v1/${rest.replace("fonts/", "")}`) };
  }

  // mapbox://styles/{user}/{id}
  if (rest.startsWith("styles/")) {
    return { url: withToken(`https://api.mapbox.com/styles/v1/${rest.replace("styles/", "")}`) };
  }

  // mapbox://{tilesetA,tilesetB} -> TileJSON
  return { url: withToken(`https://api.mapbox.com/v4/${rest}.json?secure`) };
}

/**
 * Mapbox styles carry keys MapLibre's validator rejects (`projection: {name:"globe"}`,
 * `fog`) plus account metadata. Left in place they abort style parsing and the map
 * renders blank, so the style is fetched and cleaned before the map is constructed.
 */
const STRIP = ["projection", "fog", "terrain", "imports", "schema", "draft", "owner", "created", "modified", "id", "visibility"] as const;

export async function resolveStyle(signal?: AbortSignal): Promise<StyleSpecification | string> {
  if (!MAPBOX_TOKEN) return CARTO_FALLBACK;
  try {
    const res = await fetch(styleUrl(), { signal });
    if (!res.ok) return CARTO_FALLBACK;
    const style = (await res.json()) as Record<string, unknown>;
    for (const k of STRIP) delete style[k];
    return style as unknown as StyleSpecification;
  } catch {
    return CARTO_FALLBACK; // offline or token rejected; the atlas still opens
  }
}
