// Public source register, safe to import from client components.
export const SOURCES_PUBLIC = [
  { id: "S-NASA", name: "NASA POWER monthly climatology 2001–2020", url: "https://power.larc.nasa.gov/", scale: "~0.5° grid cell", kind: "recorded-public-data" },
  { id: "S-PDB", name: "PeeringDB India facilities", url: "https://www.peeringdb.com/", scale: "point facility records", kind: "recorded-public-data" },
  { id: "S-GB", name: "geoBoundaries India ADM1", url: "https://www.geoboundaries.org/", scale: "state boundaries", kind: "recorded-public-data" },
  { id: "S-MB", name: "Mapbox basemap / OpenStreetMap", url: "https://www.mapbox.com/about/maps/", scale: "vector tiles", kind: "basemap" },
  { id: "S-FIX", name: "Demonstration parcels and documents", url: "", scale: "fictional", kind: "synthetic" },
];
