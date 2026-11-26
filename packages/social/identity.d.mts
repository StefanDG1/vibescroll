export function socialPostUrl(raw: string): {
  platform: "instagram" | "tiktok";
  postKey: string;
  canonical: string;
};
export function socialCreatorUrl(raw: string): {
  platform: "instagram" | "tiktok";
  handle: string;
  canonical: string;
};
export function socialPostAliases(raw: string): string[];
export function isInstagramSharePath(path: string): boolean;
export function instagramPostShortcode(path: string): string | null;
