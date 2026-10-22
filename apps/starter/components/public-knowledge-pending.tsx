import Link from "next/link";
export function PublicKnowledgePending({
  unavailable = false,
}: {
  unavailable?: boolean;
}) {
  return (
    <section className="help-intro">
      <h2>
        {unavailable
          ? "Public knowledge could not be loaded."
          : "Public knowledge is awaiting release review."}
      </h2>
      <p>
        {unavailable
          ? "Try again later. No private data is shown in its place."
          : "Public editions, collections and discovery are not enabled on this website. No contributions or community activity are implied."}
      </p>
      <Link href="/example">
        Inspect the clearly labelled synthetic example
      </Link>
    </section>
  );
}
