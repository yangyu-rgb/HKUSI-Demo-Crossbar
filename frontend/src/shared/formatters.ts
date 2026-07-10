const HONG_KONG_TIMEZONE = "Asia/Hong_Kong";


export function formatHongKongDateTime(value: string | Date, withSeconds = false) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: HONG_KONG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(typeof value === "string" ? new Date(value) : value);
}


export function formatClock(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: HONG_KONG_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
