import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { PublicCollectionList } from "./public-collection-list";
import { PublicKnowledgePending } from "./public-knowledge-pending";
import type { discoverPublic } from "@/lib/public-knowledge";

export function PublicCollectionDirectory({
  path,
  topic,
  result,
}: {
  path: "/discover" | "/collections";
  topic: string;
  result: Awaited<ReturnType<typeof discoverPublic>>;
}) {
  if (result.state === "pending") return <PublicKnowledgePending />;

  return (
    <section className="public-directory" aria-label="Collection results">
      <Form className="public-search" action={path}>
        <label htmlFor="collection-topic">Topic</label>
        <div>
          <Search size={18} aria-hidden="true" />
          <input
            id="collection-topic"
            key={topic}
            type="search"
            name="topic"
            placeholder="Find a collection by topic"
            maxLength={48}
            defaultValue={topic}
          />
          <button className="primary" type="submit">
            Search
          </button>
        </div>
        {topic && (
          <Link className="public-clear-topic" href={path}>
            Clear topic
          </Link>
        )}
      </Form>
      {result.state === "unavailable" ? (
        <PublicKnowledgePending
          unavailable
          retryHref={topic ? `${path}?${new URLSearchParams({ topic })}` : path}
        />
      ) : (
        <PublicCollectionList collections={result.data.page} />
      )}
      {result.data && !result.data.isDone && (
        <Link
          className="secondary"
          href={`${path}?${new URLSearchParams({ topic, cursor: result.data.continueCursor })}`}
        >
          Next collections page
        </Link>
      )}
    </section>
  );
}
