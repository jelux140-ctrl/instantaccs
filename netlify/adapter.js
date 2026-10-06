/* =========================================================================
   VERCEL -> NETLIFY COMPATIBILITY ADAPTER
   -------------------------------------------------------------------------
   Wraps a Vercel-style serverless handler  `(req, res) => ...`  so it can
   run unchanged as a Netlify Functions v2 handler  `(request) => Response`.

   It reproduces the parts of the Vercel/Node request+response API that the
   Creed handlers rely on:

     req.method, req.headers (lowercased plain object), req.query (object),
     req.url, req.cookies, req.body (auto-parsed JSON / urlencoded / text),
     req.rawBody (exact bytes as a string, for Stripe signature checks)

     res.status(code), res.setHeader/getHeader/removeHeader,
     res.json(obj), res.send(data), res.end(data), res.write(chunk),
     res.redirect([code,] url), res.statusCode

   It also centralises CORS so every /api/* endpoint gets the same headers the
   old vercel.json applied globally (unless the handler set its own), and it
   short-circuits pre-flight OPTIONS requests.
   ========================================================================= */

const DEFAULT_CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Creed-Staff-Token, Stripe-Signature',
    'access-control-max-age': '86400',
};

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}

function buildQuery(searchParams) {
    const q = {};
    for (const key of searchParams.keys()) {
        const all = searchParams.getAll(key);
        q[key] = all.length > 1 ? all : all[0];
    }
    return q;
}

/**
 * Adapt a Vercel handler into a Netlify v2 function.
 * @param {(req, res) => any} handler
 */
export function adapt(handler) {
    return async function netlifyHandler(request) {
        const url = new URL(request.url);

        // ---- Build the Vercel-style `req` ---------------------------------
        const headers = {};
        for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;

        // Read the raw body once (needed verbatim for Stripe signatures).
        let rawBody = '';
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            rawBody = await request.text();
        }

        let body;
        const ctype = (headers['content-type'] || '').toLowerCase();
        if (rawBody) {
            if (ctype.includes('application/json')) {
                try { body = JSON.parse(rawBody); } catch { body = rawBody; }
            } else if (ctype.includes('application/x-www-form-urlencoded')) {
                body = Object.fromEntries(new URLSearchParams(rawBody));
            } else {
                body = rawBody;
            }
        }

        const req = {
            method: request.method,
            url: url.pathname + url.search,
            headers,
            query: buildQuery(url.searchParams),
            cookies: parseCookies(headers['cookie']),
            body,
            rawBody,
        };

        // ---- Build the Vercel-style `res` ---------------------------------
        let statusCode = 200;
        const resHeaders = {}; // keyed lowercased -> value
        const chunks = [];
        let resolveDone;
        const done = new Promise((r) => { resolveDone = r; });
        let finished = false;

        const setHeader = (name, value) => { resHeaders[String(name).toLowerCase()] = value; };
        const getHeader = (name) => resHeaders[String(name).toLowerCase()];

        function finalize() {
            if (finished) return;
            finished = true;

            // Default CORS parity with the old global vercel.json header,
            // only when the handler did not set its own origin.
            if (!('access-control-allow-origin' in resHeaders)) {
                for (const [k, v] of Object.entries(DEFAULT_CORS)) {
                    if (!(k in resHeaders)) resHeaders[k] = v;
                }
            }

            const outHeaders = new Headers();
            for (const [k, v] of Object.entries(resHeaders)) {
                if (Array.isArray(v)) v.forEach((one) => outHeaders.append(k, one));
                else if (v !== undefined && v !== null) outHeaders.set(k, String(v));
            }

            const body = chunks.length
                ? (chunks.every((c) => typeof c === 'string')
                    ? chunks.join('')
                    : Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))))
                : null;

            resolveDone(new Response(body, { status: statusCode, headers: outHeaders }));
        }

        const res = {
            get statusCode() { return statusCode; },
            set statusCode(c) { statusCode = c; },
            status(code) { statusCode = code; return res; },
            setHeader,
            getHeader,
            removeHeader(name) { delete resHeaders[String(name).toLowerCase()]; return res; },
            write(chunk) { if (chunk != null) chunks.push(chunk); return true; },
            end(data) { if (data != null) chunks.push(data); finalize(); return res; },
            send(data) {
                if (data == null) { finalize(); return res; }
                if (typeof data === 'object' && !Buffer.isBuffer(data)) {
                    if (!getHeader('content-type')) setHeader('content-type', 'application/json; charset=utf-8');
                    chunks.push(JSON.stringify(data));
                } else {
                    chunks.push(data);
                }
                finalize();
                return res;
            },
            json(obj) {
                if (!getHeader('content-type')) setHeader('content-type', 'application/json; charset=utf-8');
                chunks.push(JSON.stringify(obj));
                finalize();
                return res;
            },
            redirect(codeOrUrl, maybeUrl) {
                const code = typeof codeOrUrl === 'number' ? codeOrUrl : 302;
                const location = typeof codeOrUrl === 'number' ? maybeUrl : codeOrUrl;
                statusCode = code;
                setHeader('location', location);
                finalize();
                return res;
            },
        };

        // ---- Pre-flight: answer OPTIONS uniformly -------------------------
        if (request.method === 'OPTIONS') {
            const h = new Headers(DEFAULT_CORS);
            return new Response(null, { status: 204, headers: h });
        }

        // ---- Run the original handler -------------------------------------
        try {
            await Promise.resolve(handler(req, res));
        } catch (err) {
            if (!finished) {
                console.error('[adapter] handler threw:', err);
                statusCode = 500;
                setHeader('content-type', 'application/json; charset=utf-8');
                chunks.length = 0;
                chunks.push(JSON.stringify({ error: 'Internal server error' }));
                finalize();
            }
        }

        // If the handler returned without ending the response, finalize now.
        if (!finished) finalize();
        return done;
    };
}
