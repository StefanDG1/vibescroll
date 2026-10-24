// Sanitized display data. Runtime authority stays in the server resolver.
export type SharedOrderedAnalysis = {
  title: string;
  summary: string;
  sourceUrl: string;
  coverage: "ordered_media";
  language: string;
  pipelineVersion: string;
  schemaVersion: "3.0.0";
  warnings: string[];
  acquisitionCoverage: "complete_manifest" | "partial" | "unknown";
  expectedAssetCount: number | null;
  inspectedAssetCount: number;
  insights: {
    id: string;
    kind: "idea" | "lesson" | "summary";
    title: string;
    claim: string;
    interpretation: string;
    uncertainty: string[];
    confidence: "supported" | "uncertain" | "unsupported";
    citations: {
      id: string;
      kind: "image_observation" | "video_observation";
      url: string;
      label: string;
      startMs: number | null;
      endMs: number | null;
      assetId: string;
      assetIndex: number;
      postRevisionHash: string;
      textHash: string;
      basis: "visible" | "ocr" | "transcript";
      uncertainty: string;
      crop?: { x: number; y: number; width: number; height: number };
    }[];
  }[];
};
