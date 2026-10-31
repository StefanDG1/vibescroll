import { ProductPage } from "@/components/product-page";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  return <ProductPage org={org} view="proposal" proposalId={id} />;
}
