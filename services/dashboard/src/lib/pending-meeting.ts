const STORAGE_KEY = "vexa-pending-meeting-url";

export function savePendingMeetingUrl(url: string) {
  if (typeof window !== "undefined" && url.trim()) {
    sessionStorage.setItem(STORAGE_KEY, url.trim());
  }
}

export function getPendingMeetingUrl(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearPendingMeetingUrl() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function consumePendingMeetingUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = sessionStorage.getItem(STORAGE_KEY);
  if (url) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return url;
}
