"""FastAPI gateway for GeoAI Talent Agent.

A transparent reverse proxy that sits IN FRONT of the Next.js app: every
request (any method, any path, headers, cookies, body) is forwarded to the
Next.js server unchanged, and the response is streamed back byte-for-byte —
status, redirects, Set-Cookie pairs and all. The Next.js frontend/backend is
NOT modified in any way; point the browser at this gateway instead of the
Next.js port and the flow is identical.

Gateway-own endpoints live under the reserved /gateway/* prefix so they can
never shadow an app route. Add future Python endpoints (ML, geospatial
analytics, …) under that same prefix.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
Env:  NEXT_UPSTREAM  (default http://localhost:3000)
"""

import asyncio
import os

import httpx
import websockets
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

NEXT_UPSTREAM = os.environ.get("NEXT_UPSTREAM", "http://localhost:3000").rstrip("/")

# Hop-by-hop headers (RFC 9110 §7.6.1) — meaningful only for a single
# connection, so they must not be forwarded in either direction.
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

app = FastAPI(
    title="GeoAI Talent Agent — FastAPI Gateway",
    description="Transparent reverse proxy in front of the Next.js app. "
    "All app traffic passes through unchanged.",
    version="1.0.0",
    # Keep FastAPI's own surface inside /gateway so it can never collide
    # with a Next.js route.
    docs_url="/gateway/docs",
    openapi_url="/gateway/openapi.json",
    redoc_url=None,
)

# One shared client: connection pooling, no redirect-following (redirects
# such as the 307 → /login must reach the browser untouched).
client = httpx.AsyncClient(
    base_url=NEXT_UPSTREAM,
    follow_redirects=False,
    timeout=httpx.Timeout(60.0, connect=10.0),
)


@app.on_event("shutdown")
async def shutdown() -> None:
    await client.aclose()


@app.get("/gateway/health")
async def health() -> JSONResponse:
    """Gateway liveness + upstream reachability."""
    try:
        upstream = await client.get("/", headers={"accept": "text/html"})
        upstream_ok = upstream.status_code < 500
    except httpx.HTTPError:
        upstream_ok = False
    return JSONResponse(
        {"gateway": "ok", "upstream": NEXT_UPSTREAM, "upstream_ok": upstream_ok},
        status_code=200 if upstream_ok else 503,
    )


@app.websocket("/{path:path}")
async def websocket_proxy(ws: WebSocket, path: str) -> None:
    """Bridge WebSocket connections to the upstream (Next.js dev-mode HMR
    lives on /_next/webpack-hmr and dynamic chunks won't hydrate without it;
    production builds simply never open one)."""
    upstream_url = NEXT_UPSTREAM.replace("http://", "ws://").replace("https://", "wss://")
    upstream_url += f"/{path}"
    if ws.url.query:
        upstream_url += f"?{ws.url.query}"
    fwd = [(k, v) for k, v in ws.headers.items()
           if k in ("cookie", "origin", "user-agent", "accept-language")]
    try:
        try:
            upstream = await websockets.connect(upstream_url, additional_headers=fwd)
        except TypeError:  # websockets < 14 named the parameter extra_headers
            upstream = await websockets.connect(upstream_url, extra_headers=fwd)
    except Exception:
        await ws.close(code=1011)
        return

    await ws.accept()

    async def client_to_upstream() -> None:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            if msg.get("text") is not None:
                await upstream.send(msg["text"])
            elif msg.get("bytes") is not None:
                await upstream.send(msg["bytes"])

    async def upstream_to_client() -> None:
        async for message in upstream:
            if isinstance(message, str):
                await ws.send_text(message)
            else:
                await ws.send_bytes(message)

    tasks = [
        asyncio.create_task(client_to_upstream()),
        asyncio.create_task(upstream_to_client()),
    ]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await upstream.close()
        try:
            await ws.close()
        except RuntimeError:
            pass  # already closed by the client


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def proxy(request: Request, path: str) -> StreamingResponse:
    # Forward every header except Host (upstream needs its own) and
    # hop-by-hop ones; annotate with the standard X-Forwarded-* trio.
    fwd_headers = [
        (k, v)
        for k, v in request.headers.raw
        if k.decode().lower() not in HOP_BY_HOP and k.decode().lower() != "host"
    ]
    x_fwd_for = request.client.host if request.client else ""
    prior = request.headers.get("x-forwarded-for")
    if prior:
        x_fwd_for = f"{prior}, {x_fwd_for}"
    fwd_headers += [
        (b"x-forwarded-for", x_fwd_for.encode()),
        (b"x-forwarded-proto", request.url.scheme.encode()),
        (b"x-forwarded-host", request.headers.get("host", "").encode()),
    ]

    upstream_req = client.build_request(
        request.method,
        f"/{path}",
        params=request.url.query.encode() if request.url.query else None,
        headers=fwd_headers,
        # Stream the request body through (uploads never buffer in memory).
        content=request.stream(),
    )
    upstream_resp = await client.send(upstream_req, stream=True)

    # aiter_raw() yields the body WITHOUT content decoding, so gzip'd
    # responses pass through with their Content-Encoding header intact.
    response = StreamingResponse(
        upstream_resp.aiter_raw(),
        status_code=upstream_resp.status_code,
        background=BackgroundTask(upstream_resp.aclose),
    )
    # Copy headers at the raw level to preserve DUPLICATE keys — losing the
    # second Set-Cookie of a Supabase auth response would break login.
    response.raw_headers = [
        (k, v)
        for k, v in upstream_resp.headers.raw
        if k.decode().lower() not in HOP_BY_HOP
    ]
    return response
