import { Onboarding } from "@/components/onboarding";
export const metadata = { title: "Find your next useful idea" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ example?: string; step?: string }>;
}) {
  const query = await searchParams;
  return <Onboarding exampleFirst={query.example === "1" && !query.step} />;
}
