// HTTP client for the 3x-ui panel REST API.
// Auth: Authorization: Bearer <token>  (Settings -> Security -> API Token)

const DEFAULT_TIMEOUT = Number(process.env.XUI_TIMEOUT_MS || 20000);
const MAX_CHARS = Number(process.env.XUI_MAX_RESPONSE_CHARS || 60000);

export class PanelError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "PanelError";
    this.status = status;
    this.body = body;
  }
}

export class PanelClient {
  constructor({ baseUrl, token, timeoutMs = DEFAULT_TIMEOUT } = {}) {
    if (!baseUrl) throw new Error("XUI_BASE_URL is not set");
    if (!token) throw new Error("XUI_API_TOKEN is not set");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.timeoutMs = timeoutMs;
    this._spec = null;
  }

  async request(method, path, { body, query } = {}) {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : "/" + path));
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new PanelError(`Timed out after ${this.timeoutMs}ms: ${method} ${path}`);
      throw new PanelError(`Cannot reach panel at ${this.baseUrl}: ${e.message}`);
    }
    clearTimeout(timer);

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    // The panel answers 404 to unauthenticated requests instead of 401.
    if (res.status === 404 && (data === null || data === "" || typeof data === "string")) {
      throw new PanelError(
        `HTTP 404 for ${method} ${path}. The panel returns 404 when the API token is missing, wrong or revoked - check XUI_API_TOKEN. It also returns 404 for a genuinely unknown path.`,
        { status: 404, body: data }
      );
    }
    if (!res.ok) throw new PanelError(`HTTP ${res.status} for ${method} ${path}`, { status: res.status, body: data });

    // Most answers are wrapped as {success, msg, obj}.
    if (data && typeof data === "object" && data.success === false) {
      throw new PanelError(data.msg || "Panel reported failure", { status: res.status, body: data });
    }
    return data;
  }

  get(path, query) { return this.request("GET", path, { query }); }
  post(path, body, query) { return this.request("POST", path, { body, query }); }

  /** The panel serves its own OpenAPI document; cache it for search/describe. */
  async spec() {
    if (!this._spec) this._spec = await this.get("/panel/api/openapi.json");
    return this._spec;
  }
}

/** Keep tool output within a sane size, and say so rather than cutting silently. */
export function toText(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (s.length <= MAX_CHARS) return s;
  return s.slice(0, MAX_CHARS) + `\n\n... truncated at ${MAX_CHARS} characters (full length ${s.length}). Narrow the request or use a more specific endpoint.`;
}
