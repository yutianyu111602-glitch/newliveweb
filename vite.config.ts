import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [
    glsl(),
    {
      name: 'newliveweb-local-audio-dev',
      apply: 'serve',
      configureServer(server) {
        const allowedRoot = path.resolve('D:/test MP3');

        server.middlewares.use('/__local_audio', (req, res, next) => {
          try {
            if (!req.url) return next();

            const url = new URL(req.url, 'http://localhost');
            const rawPath = url.searchParams.get('path');
            if (!rawPath) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Missing "path" query parameter');
              return;
            }

            // Accept both slash styles from the client; normalize to an absolute real path.
            const requestedPath = path.resolve(rawPath.replace(/\\/g, '/'));
            if (!requestedPath.startsWith(allowedRoot + path.sep) && requestedPath !== allowedRoot) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Forbidden');
              return;
            }

            let stat;
            try {
              stat = fs.statSync(requestedPath);
            } catch {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Not found');
              return;
            }
            if (!stat.isFile()) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Not found');
              return;
            }

            const totalSize = stat.size;
            const rangeHeader = req.headers.range;

            res.setHeader('Accept-Ranges', 'bytes');
            // Minimal: we only need MP3 for the test track.
            res.setHeader('Content-Type', 'audio/mpeg');

            if (typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
              const [startRaw, endRaw] = rangeHeader.slice('bytes='.length).split('-');
              const start = startRaw ? Number(startRaw) : 0;
              const end = endRaw ? Number(endRaw) : totalSize - 1;
              if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= totalSize) {
                res.statusCode = 416;
                res.setHeader('Content-Range', `bytes */${totalSize}`);
                res.end();
                return;
              }

              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
              res.setHeader('Content-Length', String(end - start + 1));

              if (req.method === 'HEAD') {
                res.end();
                return;
              }

              fs.createReadStream(requestedPath, { start, end }).pipe(res);
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Length', String(totalSize));

            if (req.method === 'HEAD') {
              res.end();
              return;
            }

            fs.createReadStream(requestedPath).pipe(res);
          } catch (err) {
            server.config.logger.error(`[local-audio] ${String(err)}`);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Internal server error');
          }
        });
      }
    }
  ],
  build: {
    target: 'esnext'
  },
  server: {
    port: 5174,
    host: '0.0.0.0', // Listen on all IPv4 addresses
    strictPort: true,
    // Allow loading a local test audio file via Vite's /@fs/ mechanism.
    fs: {
      // Dev-only: relax file serving restrictions so /@fs can serve local media.
      strict: false,
      // Must explicitly allow project root + local test audio directory
      // Vite normalizes Windows absolute paths inconsistently across code paths
      // (sometimes with a leading '/'), so include both forms.
      allow: ['.', 'D:/test MP3', '/D:/test MP3']
    }
  }
});
