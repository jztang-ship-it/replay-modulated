import { loadLocalEnv } from './lib/local-env.mjs';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const API_ROOT = join(ROOT, 'api');
const HOST = process.env.API_HOST || '127.0.0.1';
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

loadLocalEnv(ROOT);

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}

async function collectBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks);
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try { return JSON.parse(raw.toString('utf8')); } catch { return raw.toString('utf8'); }
  }
  return raw.toString('utf8');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('__')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && extname(entry.name) === '.ts') files.push(full);
  }
  return files;
}

function routePattern(file) {
  const rel = relative(API_ROOT, file).split(sep).join('/').replace(/\.ts$/, '');
  const parts = rel.split('/');
  if (parts.at(-1) === 'index') parts.pop();
  const params = [];
  const pattern = parts.map((part) => {
    const dynamic = part.match(/^\[\.\.\.([^\]]+)\]$/) || part.match(/^\[([^\]]+)\]$/);
    if (!dynamic) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    params.push(dynamic[1]);
    return part.startsWith('[...') ? '(.+)' : '([^/]+)';
  });
  return { file, params, regex: new RegExp(`^/api/${pattern.join('/')}\\/?$`) };
}

function augmentResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (value) => {
    if (value !== undefined && typeof value === 'object' && !Buffer.isBuffer(value)) return res.json(value);
    res.end(value === undefined ? '' : value);
    return res;
  };
  res.redirect = (statusOrUrl, maybeUrl) => {
    const code = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
    const url = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
    res.statusCode = code;
    res.setHeader('Location', url);
    res.end();
    return res;
  };
  res.revalidate = async () => {};
  return res;
}

const files = await walk(API_ROOT);
const routes = files.map(routePattern).sort((a, b) => {
  const ad = (a.file.match(/\[/g) || []).length;
  const bd = (b.file.match(/\[/g) || []).length;
  return ad - bd || b.regex.source.length - a.regex.source.length;
});
const moduleCache = new Map();

function findRoute(pathname) {
  for (const route of routes) {
    const match = pathname.match(route.regex);
    if (match) return { route, match };
  }
  return null;
}

async function getHandler(file) {
  let promise = moduleCache.get(file);
  if (!promise) {
    promise = import(pathToFileURL(file).href).then((mod) => mod.default ?? mod);
    moduleCache.set(file, promise);
  }
  return promise;
}

const server = createServer(async (req, res) => {
  augmentResponse(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const found = findRoute(url.pathname);
  if (!found) return res.status(404).json({ error: 'Not found', path: url.pathname });

  try {
    const body = await collectBody(req);
    const query = {};
    for (const [key, value] of url.searchParams) {
      if (query[key] === undefined) query[key] = value;
      else query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    }
    found.route.params.forEach((name, index) => { query[name] = decodeURIComponent(found.match[index + 1]); });
    req.query = query;
    req.cookies = parseCookies(String(req.headers.cookie || ''));
    req.body = body;
    const handler = await getHandler(found.route.file);
    if (typeof handler !== 'function') throw new Error(`No default handler exported by ${found.route.file}`);
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error(`[api] ${req.method} ${url.pathname}`, error);
    if (!res.headersSent) res.statusCode = 500;
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Internal Server Error', message: error?.message || String(error) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local API server listening at http://${HOST}:${PORT}`);
  console.log(`Loaded ${routes.length} API routes from ${API_ROOT}`);
  for (const route of routes) console.log(`  ${route.regex.source.replace('\\\\/?$', '')} <= ${relative(ROOT, route.file).split(sep).join('/')}`);
});

function shutdown(signal) {
  console.log(`\\nReceived ${signal}; stopping local API server.`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

