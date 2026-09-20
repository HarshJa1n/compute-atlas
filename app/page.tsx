import Atlas from "@/components/atlas/Atlas";
import { demoSites, indiaBounds, regionBookmarks } from "@/lib/data";
import type { Polygon } from "geojson";

export default function Page() {
  const raw = demoSites();
  const sites = raw.sites.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    kind: String(s.kind),
    notice: String(s.notice ?? ""),
    geometry: s.geometry as Polygon,
    availableMW: (s.availableMW ?? null) as number | null,
    waterCapLDay: (s.waterCapLDay ?? null) as number | null,
  }));
  return <Atlas sites={sites} bookmarks={regionBookmarks()} indiaBounds={indiaBounds()} />;
}
