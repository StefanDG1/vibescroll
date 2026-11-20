import { ProductPage } from "@/components/product-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    q?: string;
    state?: string;
    category?: string;
    sort?: string;
  }>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return (
    <ProductPage
      org={org}
      view="posts"
      search={query.q}
      filter={query.state}
      category={query.category}
      sort={query.sort}
    />
  );
}
