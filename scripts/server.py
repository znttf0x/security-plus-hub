#!/usr/bin/env python3
"""Static file server for the Security+ Hub.

Study progress is stored in the browser's localStorage; this server only serves
the static files — there is no API, it writes nothing to disk and keeps no state.
That removes the whole class of data-loss bugs the old /progress API had.

You can also serve this folder with any static server, for example:
    python3 -m http.server 8080
or publish it on GitHub Pages (the app runs entirely in the browser).
"""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs')  # serve docs/ (same as GitHub Pages)
BASE_REAL = os.path.realpath(BASE_DIR)


class Handler(SimpleHTTPRequestHandler):
    """Static handler that serves the site with caching disabled (local dev).

    Sends no-store on every response so local edits to the data files / JS are
    never masked by the browser's heuristic cache during development. The app lives in docs/ (served as the web root), so no root redirect is needed.
    """

    def translate_path(self, path):
        """Confine served files to docs/: the base handler already drops '..' from the
        URL, this also blocks symlink escapes by resolving the real path. Anything that
        resolves outside docs/ maps to a non-existent path, so it 404s."""
        mapped = super().translate_path(path)
        real = os.path.realpath(mapped)
        if real != BASE_REAL and not real.startswith(BASE_REAL + os.sep):
            return os.path.join(BASE_REAL, '.__forbidden__')
        return mapped

    def end_headers(self):
        """Cache fonts (immutable); no-store everything else so local edits aren't masked."""
        if self.path.endswith('.woff2'):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(BASE_DIR)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)  # localhost only (not exposed on the LAN)
    server.daemon_threads = True  # threads must not block Ctrl+C
    print(f'Security+ Hub -> http://localhost:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
