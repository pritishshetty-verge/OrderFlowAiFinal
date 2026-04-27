// Vercel serverless function entrypoint.
// All API / webhook traffic is rewritten to this file by vercel.json.
// We import the fully-configured Express app from server/index.ts and
// await the async bootstrap (`ready`) before handing the request off.
import type { IncomingMessage, ServerResponse } from "http";
import app, { ready } from "../server/index";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await ready;
  return (app as any)(req, res);
}
