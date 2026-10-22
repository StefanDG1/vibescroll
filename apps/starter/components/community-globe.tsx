/* eslint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG needs its image role with a title and description; an HTML img cannot contain this drawing. */
export type RegionContribution = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  contributors: string;
};
export default function CommunityGlobe({
  regions,
}: {
  regions: RegionContribution[];
}) {
  // A static equal-area-style overview. Broad marker positions are supplied by
  // voluntary region choices, never an individual's position or activity time.
  return (
    <svg
      viewBox="0 0 720 380"
      role="img"
      aria-labelledby="globe-title globe-description"
      className="community-globe"
    >
      <title id="globe-title">Voluntary broad sharing regions</title>
      <desc id="globe-description">
        A static globe overview. The equivalent region list below gives every
        available contributor band. Marker positions are broad region centres,
        not personal locations.
      </desc>
      <ellipse
        cx="360"
        cy="190"
        rx="330"
        ry="165"
        fill="var(--panel)"
        stroke="var(--line)"
      />
      {[-120, -60, 0, 60, 120].map((longitude) => (
        <ellipse
          key={longitude}
          cx="360"
          cy="190"
          rx={Math.max(20, Math.abs(longitude) * 2)}
          ry="165"
          fill="none"
          stroke="var(--line)"
        />
      ))}
      {[-60, -30, 0, 30, 60].map((latitude) => (
        <path
          key={latitude}
          d={`M ${360 - 330 * Math.cos((latitude * Math.PI) / 180)} ${190 - latitude * 2.2} H ${360 + 330 * Math.cos((latitude * Math.PI) / 180)}`}
          stroke="var(--line)"
        />
      ))}
      {regions.map((region) => {
        const x = 360 + (region.longitude / 180) * 300;
        const y = 190 - (region.latitude / 90) * 150;
        return (
          <g key={region.id}>
            <circle cx={x} cy={y} r="7" fill="var(--teal)" />
            <text
              x={x}
              y={y - 15}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="13"
            >
              {region.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
