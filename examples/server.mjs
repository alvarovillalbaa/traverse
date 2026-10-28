import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.TRAVERSE_DEMO_PORT ?? 4177);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_demo_port');
const html = await readFile(new URL('./app/index.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.url !== '/' || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
  response.end(request.method === 'HEAD' ? undefined : html);
});
server.listen(port, '127.0.0.1', () => console.log(`Authored app: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
