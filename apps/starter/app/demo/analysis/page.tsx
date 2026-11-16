import { PublicIntro, PublicPage } from "@/components/site";
import { AnalysisStatusDemo } from "@/components/analysis-status-demo";

export const metadata = {
  title: "Analysis status examples",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <PublicPage>
      <div className="analysis-status-demo-intro">
        <PublicIntro title="Analysis status examples">
          <p>Synthetic processing states show what each stage looks like.</p>
        </PublicIntro>
        <AnalysisStatusDemo />
      </div>
    </PublicPage>
  );
}
