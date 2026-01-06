exports.handler = async (event) => {
  try {
    const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
    if (!ETHERSCAN_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server missing ETHERSCAN_API_KEY" }),
      };
    }

    // Forward query string parameters from the client to Etherscan.
    // We will append our API key on the server side.
    const qs = event.queryStringParameters || {};
    // Build query string, preserving any params the client provided.
    const params = new URLSearchParams(qs);
    params.set("apikey", ETHERSCAN_KEY);

    // Etherscan base URL used in the original code. If you're using a different provider or chain,
    // change this accordingly.
    const targetUrl = `https://api.etherscan.io/v2/api?${params.toString()}`;

    const resp = await fetch(targetUrl);
    const body = await resp.text(); // forward raw text in case Etherscan returns non-JSON error
    const statusCode = resp.ok ? 200 : resp.status;

    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body,
    };
  } catch (err) {
    console.error("Etherscan proxy error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Proxy error" }),
    };
  }
};
