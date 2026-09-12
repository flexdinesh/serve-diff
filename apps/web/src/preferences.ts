export function saved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeSaved(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

export function savedReviews(key: string): Map<string, string> {
  try {
    const data: unknown = JSON.parse(saved(key) ?? "[]");
    const entries = new Map<string, string>();
    if (Array.isArray(data))
      for (const entry of data) {
        if (
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "string"
        )
          entries.set(entry[0], entry[1]);
      }
    return entries;
  } catch {
    return new Map();
  }
}
