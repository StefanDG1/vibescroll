// Read from the official Work Cloud model selector on 2026-10-28. This is a
// reviewed setup shortlist, not a promise about another user's subscription.
// Refresh it after supported host discovery; never scrape private model APIs.
export const workCloudModelChoices = [
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
  { id: "gpt-6-astra", name: "GPT-6 Astra" },
  { id: "gpt-6-sol", name: "GPT-6 Sol" },
  { id: "gpt-6-luna", name: "GPT-6 Luna" },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
] as const;
