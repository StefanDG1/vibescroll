import Link from "next/link";
import type { PublicCollection } from "@/lib/public-knowledge-display";
export function PublicCollectionList({
  collections,
}: {
  collections: PublicCollection[];
}) {
  if (!collections.length)
    return (
      <p>
        No current public collections were found on this page. There is no
        fixture activity mixed into these results.
      </p>
    );
  return (
    <div className="help-index">
      {collections.map((collection) => (
        <article key={collection.slug}>
          <p className="fine">{collection.topic}</p>
          <h2>
            <Link href={`/collections/${collection.slug}`}>
              {collection.title}
            </Link>
          </h2>
          <p>{collection.description}</p>
          <p>
            {collection.editions.length} currently available editions in this
            collection
          </p>
        </article>
      ))}
    </div>
  );
}
