#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
HOST = "0.0.0.0"

REDIRECTS = {
    "/reviews": "/vouches",
    "/product/ai-aimbot": "/product/fortnite",
    "/product/fortnite-public": "/product/fortnite",
    "/product/fortnite-private": "/product/fortnite",
}

REWRITES = {
    "/": "/index.html",
    "/products": "/products.html",
    "/free-trial": "/free-trial.html",
    "/account": "/account.html",
    "/status": "/status.html",
    "/auth-callback": "/auth-callback.html",
    "/vouches": "/vouches.html",
    "/support": "/support.html",
    "/guides": "/guides.html",
    "/faq": "/faq.html",
    "/product/fortnite": "/product-fortnite-public.html",
    "/product/temp-spoofer": "/product-temp-spoofer.html",
    "/product/perm-spoofer": "/product-perm-spoofer.html",
    "/product/rust": "/product-rust.html",
    "/product/cod-black-ops-7": "/product-cod-black-ops-7.html",
    "/product/arc-raiders": "/product-arc-raiders.html",
    "/product/apex-legends": "/product-apex-legends.html",
    "/product/valorant": "/product-valorant.html",
    "/product/fortnite-skins": "/product-fortnite-skins.html",
    "/product/valorant-skins": "/product-valorant-skins.html",
    "/product/apex-skins": "/product-apex-skins.html",
    "/product/rainbowsiege-skins": "/product-rainbowsiege-skins.html",
    "/product/warzone-skins": "/product-warzone-skins.html",
    "/product/universal-aim": "/product-universal-aim.html",
    "/product/rainbowsiege": "/product-rainbowsiege.html",
    "/blog": "/blog.html",
    "/blog-admin": "/blog-admin.html",
    "/admin": "/admin.html",
    "/maintenance": "/maintenance.html",
    "/payment-success": "/payment-success.html",
    "/payment-failed": "/payment-failed.html",
    "/email-go": "/email-go.html",
}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        query = ("?" + parsed.query) if parsed.query else ""

        redirect = REDIRECTS.get(path)
        if redirect:
            self.send_response(301)
            self.send_header("Location", redirect + query)
            self.end_headers()
            return

        dest = REWRITES.get(path)
        if dest:
            self.path = dest + query
        elif os.path.isfile("." + path):
            self.path = path + query
        elif os.path.isfile("." + path + ".html"):
            self.path = path + ".html" + query
        elif path.startswith("/product/"):
            slug = path.rsplit("/", 1)[-1]
            candidate = f"./product-{slug}.html"
            if os.path.isfile(candidate):
                self.path = f"/product-{slug}.html{query}"

        return SimpleHTTPRequestHandler.do_GET(self)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"Serving Creed locally at http://localhost:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
