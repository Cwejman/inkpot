// Parallel fetch for remote assets. Returns [{ url, bytes, contentType }] —
// failures are surfaced as entries with `error` set, left for callers to handle.

export async function fetchAll(urls) {
  return Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url);
      if (!res.ok) return { url, error: `HTTP ${res.status}` };
      const bytes = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? null;
      return { url, bytes, contentType };
    } catch (err) {
      return { url, error: err.message };
    }
  }));
}
