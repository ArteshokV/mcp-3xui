import { toText } from "./client.js";

const NUM_ARRAY = { type: "array", items: { type: "integer" }, description: "Numeric inbound IDs (see list_inbounds)" };
const STR_ARRAY = { type: "array", items: { type: "string" } };

/**
 * Typed tools for the operations that come up constantly, plus three generic
 * tools that reach every remaining endpoint through the panel's OpenAPI document.
 */
export function buildTools(panel) {
  const ok = async (v) => ({ content: [{ type: "text", text: toText(v) }] });

  return [
    {
      name: "list_inbounds",
      description: "List every inbound on the panel: id, remark, protocol, port, node, enabled state and traffic. Start here to learn the inbound IDs other tools need.",
      inputSchema: { type: "object", properties: { slim: { type: "boolean", description: "Omit per-inbound client lists and settings (default true)" } } },
      run: async ({ slim = true }) => ok(await panel.get(slim ? "/panel/api/inbounds/list/slim" : "/panel/api/inbounds/list")),
    },
    {
      name: "get_inbound",
      description: "Full details of one inbound: protocol settings, stream settings, its clients and traffic counters.",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } },
      run: async ({ id }) => ok(await panel.get(`/panel/api/inbounds/get/${id}`)),
    },
    {
      name: "list_clients",
      description: "List every client across all inbounds, with subId, uuid, group, inboundIds, limits and traffic. Optionally filter by a substring of email, group or subId.",
      inputSchema: { type: "object", properties: { filter: { type: "string", description: "Case-insensitive substring matched against email, group and subId" } } },
      run: async ({ filter }) => {
        const res = await panel.get("/panel/api/clients/list");
        if (!filter) return ok(res);
        const q = filter.toLowerCase();
        const arr = (res?.obj || res || []).filter((c) =>
          [c.email, c.group, c.subId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        );
        return ok({ ...res, obj: arr });
      },
    },
    {
      name: "get_client",
      description: "Full details of one client by exact email, including which inbounds it is attached to and its per-inbound tunnel IPs.",
      inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
      run: async ({ email }) => ok(await panel.get(`/panel/api/clients/get/${encodeURIComponent(email)}`)),
    },
    {
      name: "create_client",
      description: "Create a client and attach it to one or more inbounds in a single call. The panel generates the credentials each inbound's protocol needs (UUID, password, WireGuard keypair and tunnel IP).",
      inputSchema: {
        type: "object",
        required: ["email", "inboundIds"],
        properties: {
          email: { type: "string", description: "Unique identifier for the client; must not already exist" },
          inboundIds: NUM_ARRAY,
          group: { type: "string" },
          comment: { type: "string" },
          totalGB: { type: "integer", description: "Traffic limit in BYTES (0 = unlimited)" },
          expiryTime: { type: "integer", description: "Unix ms timestamp (0 = never)" },
          limitIp: { type: "integer" },
          limitHwid: { type: "integer" },
          tgId: { type: "integer" },
          enable: { type: "boolean" },
        },
      },
      run: async ({ email, inboundIds, group, comment, totalGB = 0, expiryTime = 0, limitIp = 0, limitHwid = 0, tgId = 0, enable = true }) => {
        const client = { email, totalGB, expiryTime, limitIp, limitHwid, tgId, enable };
        if (group !== undefined) client.group = group;
        if (comment !== undefined) client.comment = comment;
        return ok(await panel.post("/panel/api/clients/add", { client, inboundIds }));
      },
    },
    {
      name: "attach_clients",
      description: "Attach existing clients to inbounds. Each client keeps its identity and traffic row; clients already on a target are reported as skipped. This is how an existing client gains access to another server.",
      inputSchema: { type: "object", required: ["emails", "inboundIds"], properties: { emails: STR_ARRAY, inboundIds: NUM_ARRAY } },
      run: async ({ emails, inboundIds }) => ok(await panel.post("/panel/api/clients/bulkAttach", { emails, inboundIds })),
    },
    {
      name: "detach_clients",
      description: "Detach clients from inbounds without deleting the clients. Use this to remove a server from someone's subscription.",
      inputSchema: { type: "object", required: ["emails", "inboundIds"], properties: { emails: STR_ARRAY, inboundIds: NUM_ARRAY } },
      run: async ({ emails, inboundIds }) => ok(await panel.post("/panel/api/clients/bulkDetach", { emails, inboundIds })),
    },
    {
      name: "update_client",
      description: "Change a client's limits, expiry or enabled state. Only the fields passed are modified. To change which inbounds it uses, call attach_clients or detach_clients.",
      inputSchema: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string" },
          totalGB: { type: "integer", description: "Traffic limit in BYTES (0 = unlimited)" },
          expiryTime: { type: "integer", description: "Unix ms timestamp (0 = never)" },
          limitIp: { type: "integer" },
          limitHwid: { type: "integer" },
          tgId: { type: "integer" },
          enable: { type: "boolean" },
          comment: { type: "string" },
        },
      },
      run: async ({ email, ...fields }) => ok(await panel.post(`/panel/api/clients/update/${encodeURIComponent(email)}`, { email, ...fields })),
    },
    {
      name: "delete_client",
      description: "Permanently delete a client by exact email. This cannot be undone; prefer update_client with enable=false to suspend someone.",
      inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
      run: async ({ email }) => ok(await panel.post(`/panel/api/clients/del/${encodeURIComponent(email)}`)),
    },
    {
      name: "reset_client_traffic",
      description: "Zero a client's accumulated up and down counters.",
      inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
      run: async ({ email }) => ok(await panel.post(`/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`)),
    },
    {
      name: "list_online_clients",
      description: "Which clients currently hold a connection.",
      inputSchema: { type: "object", properties: {} },
      run: async () => ok(await panel.post("/panel/api/clients/onlines")),
    },
    {
      name: "list_client_groups",
      description: "List client groups with their aggregate traffic.",
      inputSchema: { type: "object", properties: {} },
      run: async () => ok(await panel.get("/panel/api/clients/groups")),
    },
    {
      name: "get_subscription_url",
      description: "Build a client's subscription URL from the panel's subscription settings and the client's subId, and report which inbounds that subscription serves.",
      inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
      run: async ({ email }) => {
        const [settings, client] = await Promise.all([
          panel.get("/panel/api/setting/all"),
          panel.get(`/panel/api/clients/get/${encodeURIComponent(email)}`),
        ]);
        const s = settings?.obj || settings || {};
        const c = client?.obj?.client || client?.obj || client || {};
        const inboundIds = client?.obj?.inboundIds || c.inboundIds || [];
        const base = (s.subURI || "").replace(/\/+$/, "");
        return ok({
          email: c.email,
          subId: c.subId,
          inboundIds,
          subscriptionUrl: base && c.subId ? `${base}/${c.subId}` : null,
          note: base ? undefined : "subURI is not configured in the panel's subscription settings; build the URL from subPort and subPath instead.",
        });
      },
    },
    {
      name: "server_status",
      description: "Panel host status: CPU, memory, uptime, Xray state and version.",
      inputSchema: { type: "object", properties: {} },
      run: async () => ok(await panel.post("/panel/api/server/status")),
    },

    // generic access to everything else
    {
      name: "search_api",
      description: "Search the panel's OpenAPI document for endpoints. Use this whenever no typed tool covers the task - the panel exposes far more operations (nodes, routing, subscriptions, backups, Xray control) than are wrapped here.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Substring matched against path, summary and tag, e.g. \"node\", \"backup\", \"traffic\"" },
          limit: { type: "integer", description: "Max results (default 25)" },
        },
      },
      run: async ({ query, limit = 25 }) => {
        const spec = await panel.spec();
        const q = query.toLowerCase();
        const hits = [];
        for (const [path, item] of Object.entries(spec.paths || {})) {
          for (const [method, op] of Object.entries(item)) {
            if (!["get", "post", "put", "delete", "patch"].includes(method)) continue;
            const hay = `${path} ${op.summary || ""} ${(op.tags || []).join(" ")}`.toLowerCase();
            if (hay.includes(q)) hits.push({ method: method.toUpperCase(), path, summary: op.summary });
            if (hits.length >= limit) break;
          }
          if (hits.length >= limit) break;
        }
        return ok({ count: hits.length, results: hits });
      },
    },
    {
      name: "describe_api",
      description: "Show one endpoint's description, parameters and an example request body from the panel's OpenAPI document. Call this before call_api on anything unfamiliar.",
      inputSchema: {
        type: "object",
        required: ["method", "path"],
        properties: { method: { type: "string" }, path: { type: "string", description: "Exact path from search_api, e.g. /panel/api/clients/bulkAttach" } },
      },
      run: async ({ method, path }) => {
        const spec = await panel.spec();
        const op = spec.paths?.[path]?.[method.toLowerCase()];
        if (!op) return ok({ error: `No such operation: ${method.toUpperCase()} ${path}. Use search_api to find the exact path.` });
        const json = op.requestBody?.content?.["application/json"] || {};
        return ok({
          method: method.toUpperCase(),
          path,
          summary: op.summary,
          tags: op.tags,
          parameters: (op.parameters || []).map((p) => ({ name: p.name, in: p.in, required: p.required, schema: p.schema })),
          requestBodyRequired: op.requestBody?.required ?? false,
          requestBodyExample: json.example,
          responseExample: op.responses?.["200"]?.content?.["application/json"]?.example,
        });
      },
    },
    {
      name: "call_api",
      description: "Call any panel endpoint directly. Use search_api and describe_api first to get the exact path and body shape. With an admin-scoped token this reaches operations that change or delete inbounds, nodes and panel settings.",
      inputSchema: {
        type: "object",
        required: ["method", "path"],
        properties: {
          method: { type: "string", description: "GET, POST, PUT, DELETE or PATCH" },
          path: { type: "string", description: "Path starting with /panel/api/, with path parameters already substituted" },
          body: { type: "object", description: "JSON request body, when the endpoint takes one" },
          query: { type: "object", description: "Query string parameters" },
        },
      },
      run: async ({ method, path, body, query }) => ok(await panel.request(method, path, { body, query })),
    },
  ];
}
