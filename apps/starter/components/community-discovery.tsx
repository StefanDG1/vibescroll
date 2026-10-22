"use client";
import { useState, type ComponentType } from "react";
import type { RegionContribution } from "./community-globe";
export function CommunityDiscovery({
  regions,
  available = true,
}: {
  regions: RegionContribution[];
  available?: boolean;
}) {
  const [Globe, setGlobe] = useState<ComponentType<{
      regions: RegionContribution[];
    }> | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  return (
    <section>
      <h2>Voluntary regional sharing</h2>
      <p>
        Broad regions describe where public contributors chose to share from.
        They do not describe source creators or device positions. Regions need
        at least five current contributors in this bounded snapshot. Bands give
        minimum observed participation, rather than complete regional totals. No
        precise activity times are displayed.
      </p>
      {!available ? (
        <p>
          Regional aggregates could not be loaded. The topic and collection
          lists remain available.
        </p>
      ) : !regions.length ? (
        <p>
          No regional aggregates meet the public threshold on this page. No
          illustrative activity is substituted.
        </p>
      ) : (
        <>
          {!Globe ? (
            <button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  const loaded = await import("./community-globe");
                  setGlobe(() => loaded.default);
                } catch {
                  setError(
                    "The globe could not load. The complete region list remains available.",
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              Show optional static globe
            </button>
          ) : (
            <>
              <button onClick={() => setGlobe(null)}>Hide globe</button>
              <Globe regions={regions} />
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <ul>
            {regions.map((region) => (
              <li key={region.id}>
                {region.label}: {region.contributors} contributors
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        Choose or withdraw your own broad region in the signed-in publication
        controls. Your private library does not need geographic participation.
      </p>
    </section>
  );
}
