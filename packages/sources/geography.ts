// Voluntary broad regions, never device/IP-derived coordinates.
export const sharingRegions = [
  {
    id: "north-america",
    label: "North America",
    latitude: 40,
    longitude: -105,
  },
  {
    id: "south-america",
    label: "South America",
    latitude: -15,
    longitude: -60,
  },
  { id: "europe", label: "Europe", latitude: 50, longitude: 15 },
  { id: "africa", label: "Africa", latitude: 5, longitude: 20 },
  {
    id: "west-central-asia",
    label: "West and Central Asia",
    latitude: 35,
    longitude: 65,
  },
  {
    id: "south-east-asia",
    label: "South and East Asia",
    latitude: 25,
    longitude: 110,
  },
  { id: "oceania", label: "Oceania", latitude: -25, longitude: 135 },
] as const;
export const contributorThreshold = 5;
export function contributorBand(count: number) {
  return count < 5 ? null : count < 10 ? "5–9" : count < 25 ? "10–24" : "25+";
}
