import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve((req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  return jsonResponse({
    ok: true,
    service: "wallet-whisperer",
    timestamp: new Date().toISOString(),
  });
});
