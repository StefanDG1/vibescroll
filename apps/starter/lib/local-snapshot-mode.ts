export function localSnapshotConfigured() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.VIBESCROLL_LOCAL_SNAPSHOT === "1"
  );
}

export function localSnapshotEnabled(host: string | null) {
  // Same-app server action redirects use the dev server's loopback bind host.
  return (
    localSnapshotConfigured() &&
    (host === "localhost:3192" || host === "127.0.0.1:3192")
  );
}
