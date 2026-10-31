import { ProductPage } from "@/components/product-page";
export default async function Page({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  return <ProductPage org={(await params).org} view="trends" />;
}
