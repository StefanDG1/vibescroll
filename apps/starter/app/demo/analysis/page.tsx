import { PublicPage } from "@/components/site";
import { AnalysisStatusDemo } from "@/components/analysis-status-demo";

export const metadata = {
  title: "Analysis status examples",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PublicPage>
      <div className="analysis-status-demo-intro">
        <h1>Analysis status examples</h1>
        <p>Synthetic states only. Switching examples starts no work.</p>
        <AnalysisStatusDemo />
      </div>
    </PublicPage>
  );
}
