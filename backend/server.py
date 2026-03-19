"""
Minimal proxy server - Forwards all API requests to Node.js backend.
The Python backend has been fully migrated to Node.js.
This file exists only because the supervisor config (read-only) expects uvicorn to run here.
"""
from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware
import httpx
import subprocess
import atexit
import os
import time
import signal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("proxy")

NODE_PORT = int(os.environ.get('NODE_BACKEND_PORT', '8002'))
NODE_SERVER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'desktop', 'web_server.js')

# Load .env from this directory
env_file = os.path.join(os.path.dirname(__file__), '.env')
env_vars = {**os.environ}
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")

# Start Node.js backend
logger.info(f"Starting Node.js backend on port {NODE_PORT}...")
node_proc = subprocess.Popen(
    ['node', NODE_SERVER],
    env={**env_vars, 'PORT': str(NODE_PORT)},
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)
time.sleep(2)

def cleanup():
    logger.info("Shutting down Node.js backend...")
    try:
        node_proc.terminate()
        node_proc.wait(timeout=5)
    except:
        node_proc.kill()

atexit.register(cleanup)
signal.signal(signal.SIGTERM, lambda *a: (cleanup(), exit(0)))

app = FastAPI(title="AI Trading Bot Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NODE_URL = f"http://127.0.0.1:{NODE_PORT}"

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_api(path: str, request: Request):
    """Forward all /api/* requests to Node.js backend"""
    url = f"{NODE_URL}/api/{path}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ('host', 'content-length', 'accept-encoding')}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
                params=dict(request.query_params),
            )
            excluded_headers = {'content-encoding', 'content-length', 'transfer-encoding'}
            resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
            return Response(content=resp.content, status_code=resp.status_code, headers=resp_headers)
        except httpx.ConnectError:
            return Response(
                content='{"status":"error","message":"Node.js backend not ready"}',
                status_code=503,
                media_type="application/json",
            )
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            return Response(
                content=f'{{"status":"error","message":"{str(e)}"}}',
                status_code=502,
                media_type="application/json",
            )

@app.get("/")
async def root():
    return {"status": "ok", "backend": "node.js", "proxy": "python", "message": "Python backend deleted. All logic runs in Node.js."}

logger.info(f"Proxy server ready. Forwarding /api/* -> Node.js:{NODE_PORT}")
