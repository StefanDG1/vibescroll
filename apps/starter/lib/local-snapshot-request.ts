import "server-only";
import { headers } from "next/headers";
import {
  localSnapshotConfigured,
  localSnapshotEnabled,
} from "./local-snapshot-mode";

export async function localSnapshotRequest() {
  if (!localSnapshotConfigured()) return false;
  return localSnapshotEnabled((await headers()).get("host"));
}
