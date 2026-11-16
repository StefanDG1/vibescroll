import Link from "next/link";
import type { PublicCollection } from "@/lib/public-knowledge-display";
export function PublicCollectionList({
  collections,
}: {
  collections: PublicCollection[];
}) {
  if (!collections.length)
    return (
      <section className="public-state-card">
        <h2>No collections found</h2>
        <p>Try a different topic or see how an edition’s evidence works.</p>
        <Link className="secondary" href="/example">
          Explore the example
        </Link>
      </section>
    );
  return (
    <div className="public-card-grid">
      {collections.map((collection) => (
        <Link
          className="public-list-card"
          href={`/collections/${collection.slug}`}
          key={collection.slug}
        >
          <p className="fine">{collection.topic}</p>
          <h2>{collection.title}</h2>
          <p>{collection.description}</p>
          <p>
            {collection.editions.length}{" "}
            {collection.editions.length === 1 ? "edition" : "editions"}
          </p>
        </Link>
      ))}
    </div>
  );
}
