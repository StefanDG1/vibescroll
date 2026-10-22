export class AcquisitionPolicyError extends Error {
  code: string;
  detail: string;
  constructor(code: string, detail: string);
}
export function ensure(ok: unknown, code: string, detail: string): asserts ok;
export function safeSourceUrl(raw: string): string;
