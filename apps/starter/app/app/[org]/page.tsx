import { ProductPage } from "@/components/product-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    draft?: string;
    q?: string;
    state?: string;
    homeMode?: string;
    publicEdition?: string;
    publicVersion?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <ProductPage
      org={(await params).org}
      view="home"
      draft={query.draft}
      search={query.q}
      filter={query.state}
      compactHome={query.homeMode === "compact"}
      publicEdition={query.publicEdition}
      publicVersion={Number(query.publicVersion)}
    />
  );
}
