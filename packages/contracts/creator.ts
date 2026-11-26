import { z } from "zod";
export const creatorSource = z.strictObject({
  profileId: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(100),
});
export const creatorFollowInput = creatorSource.extend({
  following: z.boolean(),
  explicitlyRequested: z.literal(true),
});
