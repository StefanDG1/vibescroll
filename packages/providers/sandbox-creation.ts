// SDK retries and automatic resume cannot allocate another approved resource.
// VM and optional clean-tool snapshot creation each get one dispatch.
export function singleSandboxCreationFetch(
  transport: typeof fetch = globalThis.fetch,
  options: { allowSnapshot?: boolean } = {},
): typeof fetch {
  let creationDispatched = false;
  let snapshotDispatched = false;
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api\//, "/");
    const creation = method === "POST" && /^\/v[23]\/sandboxes$/.test(path);
    if (!creationDispatched && !creation)
      throw new DOMException(
        "POLICY_BLOCKED: Review the changed sandbox creation endpoint before dispatch.",
        "AbortError",
      );
    if (creation) {
      if (creationDispatched)
        throw new DOMException(
          "SANDBOX_CREATE_UNCERTAIN: Reconcile the first creation request before retrying.",
          "AbortError",
        );
      // Set before awaiting: a lost response cannot authorize another dispatch.
      creationDispatched = true;
    } else if (
      method === "POST" &&
      /^\/v2\/sandboxes\/sessions\/[^/]+\/snapshot$/.test(path)
    ) {
      if (snapshotDispatched)
        throw new DOMException(
          "SANDBOX_SNAPSHOT_UNCERTAIN: Reconcile the first snapshot request and retained storage before retrying.",
          "AbortError",
        );
      const expiration =
        typeof init?.body === "string"
          ? JSON.parse(init.body)?.expiration
          : undefined;
      if (
        options.allowSnapshot !== true ||
        !Number.isSafeInteger(expiration) ||
        expiration <= 0 ||
        expiration > 7 * 86400000
      )
        throw new DOMException(
          "POLICY_BLOCKED: Snapshot creation requires its bounded clean-tool approval.",
          "AbortError",
        );
      snapshotDispatched = true;
    } else {
      const read =
        ["GET", "HEAD"].includes(method) &&
        url.searchParams.get("resume") !== "true" &&
        (/^\/v2\/sandboxes\/(?:sessions|snapshots)\//.test(path) ||
          (/^\/v2\/sandboxes\/[^/]+$/.test(path) &&
            url.searchParams.get("resume") === "false"));
      const control =
        method === "POST" &&
        /^\/v2\/sandboxes\/sessions\/[^/]+\/(?:cmd(?:\/[^/]+\/kill)?|fs\/(?:mkdir|read|write)|stop|network-policy)$/.test(
          path,
        );
      const remove =
        method === "DELETE" &&
        /^\/v2\/sandboxes\/(?:snapshots\/)?[^/]+$/.test(path);
      const networkUpdate =
        method === "PATCH" &&
        /^\/v2\/sandboxes\/[^/]+$/.test(path) &&
        typeof init?.body === "string" &&
        Object.keys(JSON.parse(init.body)).every(
          (key) => key === "networkPolicy",
        );
      if (!read && !control && !remove && !networkUpdate)
        throw new DOMException(
          "POLICY_BLOCKED: Review the unapproved sandbox resource operation before dispatch.",
          "AbortError",
        );
    }
    return transport(input, init);
  };
}
