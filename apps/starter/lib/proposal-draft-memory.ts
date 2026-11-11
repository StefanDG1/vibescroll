export type PendingProposalRequest = {
  operation: string;
  args: Record<string, unknown>;
};
export type ProposalDraftStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
type Draft = { text: string; pending: PendingProposalRequest | null };

/** Private to this iframe. This cannot survive a full reload without browser storage. */
export class ProposalDraftMemory {
  private records = new Map<string, Draft>();
  constructor(private maximum = 20) {}
  read(key: string): Draft | undefined {
    const value = this.records.get(key);
    if (!value) return;
    this.records.delete(key);
    this.records.set(key, value);
    return structuredClone(value);
  }
  private update(key: string, change: (value: Draft) => Draft) {
    if (key.length > 300) return false;
    if (!this.records.has(key) && this.records.size >= this.maximum) {
      // Keep exact unknown operation keys ahead of ordinary unsent text.
      const disposable = [...this.records].find(([, value]) => !value.pending);
      if (!disposable) return false;
      this.records.delete(disposable[0]);
    }
    const value = change(this.records.get(key) ?? { text: "", pending: null });
    this.records.delete(key);
    if (value.text || value.pending) this.records.set(key, value);
    return true;
  }
  draft(key: string, text: string) {
    return this.update(key, (old) => ({ ...old, text: text.slice(0, 4000) }));
  }
  request(key: string, pending: PendingProposalRequest | null) {
    if (pending && JSON.stringify(pending).length > 16384) return false;
    return this.update(key, (old) => ({
      ...old,
      pending: pending ? structuredClone(pending) : null,
    }));
  }
  clear(key: string) {
    this.records.delete(key);
  }
}
export const proposalDraftMemory = new ProposalDraftMemory();
