import { AwsClient } from "aws4fetch";

export type Env = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  LAMBDA_URL: string;
  KV?: KVNamespace;
};

function t0(request: Request): Record<string, unknown> {
  const cf = (request.cf ?? {}) as Record<string, unknown>;
  const h = request.headers;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    "sig.edge.asn": num(cf.asn),
    "sig.edge.as_org": str(cf.asOrganization),
    "sig.edge.geo.country": str(cf.country),
    "sig.edge.geo.city": str(cf.city),
    "sig.edge.geo.postal": str(cf.postalCode),
    "sig.edge.colo": str(cf.colo),
    "sig.edge.conn_type": null,
    "sig.edge.tcp_rtt_ms": num(cf.clientTcpRtt),
    "sig.edge.tls_version": str(cf.tlsVersion),
    "sig.edge.tls_cipher": str(cf.tlsCipher),
    "sig.edge.http_version": str(cf.httpProtocol),
    "sig.hdr.ua": h.get("user-agent"),
    "sig.hdr.accept_language": h.get("accept-language"),
    "sig.hdr.ua_ch_platform": h.get("sec-ch-ua-platform"),
    "sig.hdr.ua_ch_mobile": h.get("sec-ch-ua-mobile"),
    "sig.hdr.referer": h.get("referer"),
  };
}

function aws(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "lambda",
  });
}

async function proxy(env: Env, path: string, init: RequestInit): Promise<Response> {
  const url = `${env.LAMBDA_URL.replace(/\/$/, "")}${path}`;
  const next: RequestInit = { ...init };
  if (next.body != null && typeof next.body !== "string") {
    next.body = await new Response(next.body as BodyInit).text();
  }
  return aws(env).fetch(url, next);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const kill = env.KV ? await env.KV.get("kill") : null;
    if (kill === "on" && url.pathname.startsWith("/api/")) {
      return Response.json({ message: "killed" }, { status: 503 });
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const sid = crypto.randomUUID();
      const signals = t0(request);
      const put = await proxy(env, "/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sid, signals }),
      });
      if (!put.ok && put.status !== 204) {
        return Response.json({ message: "session write failed", status: put.status }, { status: 502 });
      }
      return Response.json({ sid, signals });
    }

    if (request.method === "POST" && url.pathname === "/api/infer") {
      return proxy(env, "/api/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: request.body,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/session/delete") {
      return proxy(env, "/api/session/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: request.body,
      });
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
