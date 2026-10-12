export class CodexConnectionStore {
  directory: string;
  file: string;
  lock<T>(operation: () => Promise<T>): Promise<T>;
  read(): Promise<any>;
  write(state: any): Promise<void>;
  disconnect(): Promise<void>;
}
export function checkCodexCache(raw: string): string;
export class SavedCodexConnection {
  constructor(options: {
    store: { read(): Promise<any>; write(state: any): Promise<void> };
    restore(cache: string): Promise<void>;
    capture(): Promise<string>;
  });
  profileBinding?: string;
  restoreSaved(): Promise<boolean>;
  connect(
    server: { request(method: string, args: any): Promise<any> },
    login: () => Promise<void>,
  ): Promise<{ profileBinding: string; reused: boolean }>;
  checkpoint(): Promise<void>;
}
