// Vercel serverless function entrypoint (source). esbuild bundles this
// into api/index.js during the Vercel build (see scripts.build in
// package.json). We DON'T put this file in api/ because @vercel/node
// auto-picks api/*.ts and would compile it itself, double-handling the
// import graph and stripping away esbuild's resolution of relative
// imports + path aliases.
import type { IncomingMessage, ServerResponse } from "http";
import app, { ready } from "./index";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await ready;
  return (app as any)(req, res);
}
