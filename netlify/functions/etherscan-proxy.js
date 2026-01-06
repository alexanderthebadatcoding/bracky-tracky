exports.handler = async (event) => {
  try {
    // Server-side API key (set in Netlify env vars: ETHERSCAN_API_KEY)
    const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
    if (!ETHERSCAN_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing ETHERSCAN_API_KEY on server" }),
      };
    }

    const qs = event.queryStringParameters || {};

    // Basic validation: require module & action for Etherscan API V2
    if (!qs.module || !qs.action) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required query parameters: module and action" }),
      };
    }

    // Build params and append apikey server-side (do NOT accept apikey from client)
    const params = new URLSearchParams(qs);
    params.set("apikey", ETHERSCAN_KEY);

    // Use V2 base URL. You can override with ETHERSCAN_V2_BASE if needed.
    const base = process.env.ETHERSCAN_V2_BASE || "https://api.etherscan.io/v2/api";
    const targetUrl = `${base}?${params.toString()}`;

    // Forward request to Etherscan V2
    const resp = await fetch(targetUrl);
    const text = await resp.text();
    const statusCode = resp.ok ? 200 : resp.status;

    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (err) {
    console.error("Etherscan proxy error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Proxy error" }),
    };
  }
};