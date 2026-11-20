const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function workDate(value?: number | string) {
  const timestamp = typeof value === "string" ? Date.parse(value) : value;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? dateFormat.format(timestamp)
    : undefined;
}

export function notificationSourceId(key?: string) {
  return /^source:([a-z0-9]+):[0-9]+$/.exec(key ?? "")?.[1];
}
