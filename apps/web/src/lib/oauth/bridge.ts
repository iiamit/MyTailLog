import { toReqRes, toFetchResponse } from "fetch-to-node";

// Web Request ↔ Node req/res bridge for oidc-provider (a Koa/Node-http
// framework) inside App Router route handlers. fetch-to-node leaves req.socket
// null, but Koa's request.protocol/ip read socket.encrypted/remoteAddress — TLS
// terminates upstream (provider.proxy=true), so a non-encrypted stub is correct;
// the real scheme comes from x-forwarded-proto. defineProperty, not assignment
// (fetch-to-node's socket setter throws).
export function toNode(request: Request) {
  const { req, res } = toReqRes(request);
  Object.defineProperty(req, "socket", {
    configurable: true,
    value: {
      encrypted: false,
      remoteAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    },
  });
  return { req, res };
}

export { toFetchResponse };
