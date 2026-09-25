/**
 * Continuum server settings: one registry, one precedence rule.
 *
 * Every setting an operator may need is reachable three ways, and exactly
 * one function decides which wins (operator rule 2026-09-25: settings and
 * --flags, not environment variables):
 *
 *   launch flag  >  settings file  >  environment (legacy)  >  default
 *
 * - Launch flags: `abstractcontinuum --hub-seat <seat>` (one run).
 * - Settings file: `~/.abstractcontinuum/settings.json`, written by
 *   `abstractcontinuum config set <key> <value>` and by the Settings page
 *   (hub seat). Owner-only permissions: it may hold the hub token.
 * - Environment: read only as a legacy fallback and reported as such; no
 *   help text or UI instructs it.
 *
 * Consumers: bin/cli.js (the server and `config`), vite.config.ts (dev
 * server), bin/hub_proxy.js (through getters the server hands it) and the
 * /api/continuum/settings route below (the Settings page).
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);

/** The registry. `key` is the settings-file key, `flag` the launch flag,
 *  `env` the legacy fallback names (first non-empty wins). */
export const SETTINGS = [
  {
    key: 'port',
    flag: '--port',
    type: 'port',
    default: 3002,
    env: ['PORT'],
    metavar: '<n>',
    help: 'HTTP port',
  },
  {
    key: 'host',
    flag: '--host',
    type: 'string',
    default: '127.0.0.1',
    env: ['HOST'],
    metavar: '<address>',
    help: 'bind address (wider only behind access control)',
  },
  {
    key: 'gateway_url',
    flag: '--gateway-url',
    type: 'url',
    default: 'http://127.0.0.1:8080',
    env: ['ABSTRACTCONTINUUM_GATEWAY_URL', 'ABSTRACTGATEWAY_URL'],
    metavar: '<url>',
    help: 'gateway this deployment talks to',
  },
  {
    key: 'hub_url',
    flag: '--hub-url',
    type: 'url',
    default: 'http://127.0.0.1:8765',
    env: ['ABSTRACTCONTINUUM_HUB_URL', 'AGORA_HUB_URL'],
    metavar: '<url>',
    help: 'agora hub for the Team page',
  },
  {
    key: 'hub_seat',
    flag: '--hub-seat',
    type: 'seat',
    default: 'operator',
    env: ['ABSTRACTCONTINUUM_HUB_SEAT'],
    metavar: '<seat>',
    help: 'your hub seat: the Team page reads and posts as it',
  },
  {
    key: 'hub_token',
    flag: '--hub-token',
    type: 'string',
    default: '',
    env: ['ABSTRACTCONTINUUM_HUB_KEY'],
    secret: true,
    metavar: '<token>',
    help: 'hub API key for the seat; overrides the key store',
  },
  {
    key: 'hub_keys',
    flag: '--hub-keys',
    type: 'string',
    default: '~/.agora/keys.json',
    env: ['ABSTRACTCONTINUUM_HUB_KEYS'],
    metavar: '<path>',
    help: 'hub key store (entry "<hub_url>::<seat>")',
  },
  {
    key: 'hub_allow_remote',
    flag: '--hub-allow-remote',
    type: 'bool',
    default: false,
    env: ['ABSTRACTCONTINUUM_HUB_ALLOW_REMOTE'],
    help: 'let other machines use the hub proxy',
  },
  {
    key: 'allow_remote_gateway_config',
    flag: '--allow-remote-gateway-config',
    type: 'bool',
    default: false,
    env: ['ABSTRACTCONTINUUM_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG', 'ABSTRACTGATEWAY_ALLOW_REMOTE_BROWSER_GATEWAY_CONFIG'],
    help: 'let other machines change the gateway URL at sign-in',
    gate: true,
  },
  {
    key: 'allow_gateway_url_cookie',
    flag: '--allow-gateway-url-cookie',
    type: 'bool',
    default: false,
    env: ['ABSTRACTCONTINUUM_ALLOW_BROWSER_GATEWAY_URL_COOKIE'],
    help: 'honor a browser gateway-URL cookie off loopback',
    gate: true,
  },
  {
    key: 'trust_proxy_headers',
    flag: '--trust-proxy-headers',
    type: 'bool',
    default: false,
    env: ['ABSTRACTCONTINUUM_TRUST_PROXY_HEADERS', 'ABSTRACTGATEWAY_TRUST_PROXY_HEADERS'],
    help: 'trust x-forwarded-host (behind your own proxy only)',
    gate: true,
  },
];

/** Settings the Continuum Settings page may change through the server. */
export const UI_WRITABLE_KEYS = ['hub_seat'];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
const BY_FLAG = new Map(SETTINGS.map((s) => [s.flag, s]));

export function setting_spec(key) {
  return BY_KEY.get(key) || null;
}

export function default_settings_path() {
  return join(homedir(), '.abstractcontinuum', 'settings.json');
}

/** `~/…` → absolute (the key store default and user-typed paths). */
export function expand_home(p) {
  const s = String(p || '');
  if (s === '~') return homedir();
  if (s.startsWith('~/')) return join(homedir(), s.slice(2));
  return s;
}

/**
 * Parse one raw value for a setting. Returns the typed value; throws an
 * Error naming the setting on invalid input (the CLI and the route both
 * report it verbatim).
 */
export function coerce(spec, raw) {
  const name = spec.key;
  if (spec.type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw ?? '').trim().toLowerCase();
    if (TRUE_VALUES.has(s)) return true;
    if (FALSE_VALUES.has(s)) return false;
    throw new Error(`${name}: expected on/off (got "${raw}")`);
  }
  if (spec.type === 'port') {
    const s = String(raw ?? '').trim();
    const n = Number(s);
    if (!/^\d+$/.test(s) || !Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name}: expected a port number 1-65535 (got "${raw}")`);
    return n;
  }
  const s = String(raw ?? '').trim();
  if (spec.type === 'url') {
    const v = s.replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
    let u;
    try {
      u = new URL(v);
    } catch {
      throw new Error(`${name}: expected an http(s) URL (got "${raw}")`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`${name}: expected an http(s) URL (got "${raw}")`);
    return v;
  }
  if (spec.type === 'seat') {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(s)) throw new Error(`${name}: expected a seat name (letters, digits, "_", "-", "."; got "${raw}")`);
    return s;
  }
  if (!s && !spec.secret) throw new Error(`${name}: expected a value`);
  return s;
}

/**
 * THE precedence function: flag > settings file > environment (legacy) >
 * default, per key. Returns `{ [key]: { value, source } }` with source one
 * of "flag" | "setting" | "env" | "default". An invalid file or env value
 * is skipped (reported in `problems`) so one bad entry cannot stop the
 * server; an invalid FLAG never reaches here (parse_args refuses it).
 */
export function resolve_settings({ flags = {}, file = {}, env = {} } = {}) {
  const out = {};
  const problems = [];
  for (const spec of SETTINGS) {
    const k = spec.key;
    let picked = null;
    if (Object.prototype.hasOwnProperty.call(flags, k) && flags[k] !== undefined) {
      picked = { value: flags[k], source: 'flag' };
    }
    if (!picked && file && Object.prototype.hasOwnProperty.call(file, k) && file[k] !== null && file[k] !== undefined) {
      try {
        picked = { value: coerce(spec, file[k]), source: 'setting' };
      } catch (e) {
        problems.push(`settings file: ${e.message}`);
      }
    }
    if (!picked) {
      for (const name of spec.env) {
        const raw = env[name];
        if (typeof raw !== 'string' || !raw.trim()) continue;
        try {
          picked = { value: coerce(spec, raw), source: 'env' };
        } catch (e) {
          problems.push(`environment ${name}: ${e.message}`);
        }
        break;
      }
    }
    if (!picked) picked = { value: spec.default, source: 'default' };
    out[k] = picked;
  }
  return { settings: out, problems };
}

/** Read the settings file; missing → {}. Invalid JSON throws (the CLI
 *  reports it; the server refuses to start on a corrupt file rather than
 *  silently running on defaults). */
export function read_settings_file(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return {};
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${path}: expected a JSON object`);
  return obj;
}

/** Write atomically with owner-only permissions (0600 file, 0700 dir):
 *  the file may hold the hub token. */
export function write_settings_file(path, obj) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

/** Set (value !== null) or unset (value === null) one key in the file. */
export function update_settings_file(path, key, value) {
  const spec = setting_spec(key);
  if (!spec) throw new Error(`unknown setting "${key}"`);
  const cur = read_settings_file(path);
  if (value === null || value === undefined) delete cur[key];
  else cur[key] = coerce(spec, value);
  write_settings_file(path, cur);
  return cur;
}

/** Display form of a resolved value (secrets never printed). */
export function display_value(spec, value) {
  if (spec.secret) return value ? '(set, hidden)' : '(not set)';
  if (value === '' || value === null || value === undefined) return '(not set)';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
}

export const SOURCE_WORDS = { flag: 'launch flag', setting: 'setting', env: 'environment (legacy)', default: 'default' };

/**
 * Parse argv. Shapes:
 *   abstractcontinuum [serve] [--flag value | --flag=value | --bool-flag]...
 *   abstractcontinuum config get [key] | set <key> <value> | set hub_token --from-file <path> | unset <key> | path
 * Returns { command, flags, settings_file, config, error }.
 */
export function parse_args(argv) {
  const out = { command: 'serve', flags: {}, settings_file: '', config: null, error: '' };
  const rest = [];
  const args = [...argv];
  let i = 0;
  const fail = (msg) => ({ ...out, error: msg });
  while (i < args.length) {
    const a = args[i];
    if (a === '--help' || a === '-h') return { ...out, command: 'help' };
    if (a === '--version' || a === '-v') return { ...out, command: 'version' };
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(0, eq) : a;
      const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
      const take = () => {
        if (inline !== undefined) return inline;
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) throw new Error(`${name} needs a value`);
        i += 1;
        return args[i];
      };
      try {
        if (name === '--settings-file') {
          out.settings_file = expand_home(take());
        } else if (name === '--hub-token-file') {
          const p = expand_home(take());
          let text;
          try {
            text = readFileSync(p, 'utf8');
          } catch (e) {
            throw new Error(`--hub-token-file: cannot read ${p} (${e.code || e.message})`);
          }
          const token = text.trim();
          if (!token) throw new Error(`--hub-token-file: ${p} is empty`);
          out.flags.hub_token = token;
        } else if (name === '--from-file') {
          out.from_file = expand_home(take());
        } else if (name.startsWith('--no-') && BY_FLAG.get('--' + name.slice(5))?.type === 'bool' && inline === undefined) {
          out.flags[BY_FLAG.get('--' + name.slice(5)).key] = false;
        } else if (BY_FLAG.has(name)) {
          const spec = BY_FLAG.get(name);
          if (spec.type === 'bool') {
            out.flags[spec.key] = inline === undefined ? true : coerce(spec, inline);
          } else {
            out.flags[spec.key] = coerce(spec, take());
          }
        } else {
          throw new Error(`unknown option ${name} (see --help)`);
        }
      } catch (e) {
        return fail(e.message);
      }
      i += 1;
      continue;
    }
    rest.push(a);
    i += 1;
  }
  if (rest[0] === 'serve') rest.shift();
  if (rest[0] === 'config') {
    const [, action, key, value] = rest;
    if (!['get', 'set', 'unset', 'path'].includes(action || '')) return fail('config: expected get, set, unset or path');
    if ((action === 'set' || action === 'unset') && !key) return fail(`config ${action}: name a setting`);
    if (key && !BY_KEY.has(key)) return fail(`config: unknown setting "${key}" (known: ${SETTINGS.map((s) => s.key).join(', ')})`);
    if (action === 'set' && value === undefined && !out.from_file) return fail(`config set ${key}: give a value${BY_KEY.get(key)?.secret ? ' or --from-file <path>' : ''}`);
    if (rest.length > (action === 'set' ? 4 : 3)) return fail(`config ${action}: unexpected "${rest.slice(action === 'set' ? 4 : 3).join(' ')}"`);
    return { ...out, command: 'config', config: { action, key: key || '', value } };
  }
  if (rest.length) return fail(`unexpected "${rest.join(' ')}" (see --help)`);
  if (out.from_file) return fail('--from-file only applies to `config set`');
  return out;
}

/**
 * Bridge to @abstractframework/app-server's session proxy, which reads its
 * three hardening gates from environment names only. The resolved value
 * (flag > setting > environment > default) is made the ONLY one it can
 * see: every legacy name is removed, then the app's own name is set when
 * the resolved gate is on. Without this a legacy variable would beat an
 * explicit `--no-trust-proxy-headers`.
 */
export function apply_session_proxy_gates(settings, env) {
  for (const spec of SETTINGS) {
    if (!spec.gate) continue;
    for (const name of spec.env) delete env[name];
    if (settings[spec.key]?.value === true) env[spec.env[0]] = '1';
  }
}

/**
 * Live settings: flags are fixed at launch; the file is re-read when it
 * changes on disk (so `abstractcontinuum config set hub_seat …` in a
 * terminal and a save on the Settings page both apply to the Team page
 * without a restart). Port, host, gateway URL and the sign-in gates are
 * read once at start.
 */
export function createLiveSettings({ flags = {}, settingsPath, env = process.env, onProblem = () => {} }) {
  let stamp = '';
  let file = {};
  let resolved = null;
  function refresh(force = false) {
    let next = '';
    try {
      const st = statSync(settingsPath);
      next = `${st.mtimeMs}:${st.size}`;
    } catch {
      next = 'missing';
    }
    if (!force && resolved && next === stamp) return resolved;
    stamp = next;
    try {
      file = read_settings_file(settingsPath);
    } catch (e) {
      onProblem(`settings file ${settingsPath}: ${e.message}`);
    }
    const r = resolve_settings({ flags, file, env });
    for (const p of r.problems) onProblem(p);
    resolved = r.settings;
    return resolved;
  }
  refresh(true);
  return {
    settingsPath,
    flags,
    get: () => refresh(),
    value: (key) => refresh()[key].value,
    set(key, value) {
      update_settings_file(settingsPath, key, value);
      return refresh(true);
    },
  };
}

function send_json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function is_loopback_peer(req) {
  const peer = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
  return peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1' || peer === '';
}

function same_origin(req) {
  const origin = String((req.headers && req.headers.origin) || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === String((req.headers && req.headers.host) || '').trim().toLowerCase();
  } catch {
    return false;
  }
}

/** Public view: every setting with its source; secrets as presence only. */
export function settings_view(live, extra = {}) {
  const s = live.get();
  const settings = {};
  for (const spec of SETTINGS) {
    const { value, source } = s[spec.key];
    settings[spec.key] = spec.secret ? { set: Boolean(value), source } : { value, source };
  }
  return { settings, writable: UI_WRITABLE_KEYS, settings_file: live.settingsPath, ...extra };
}

/**
 * GET/PUT /api/continuum/settings — the Settings page's door to this
 * server's own settings. Local only: the socket peer must be loopback
 * (the same gate as the hub proxy, which this seat setting steers) and a
 * browser Origin must match the Host. PUT takes `{ hub_seat: "<seat>" }`
 * or `{ hub_seat: null }` (back to the default) and persists to the
 * settings file.
 */
export const SETTINGS_ROUTE = '/api/continuum/settings';

export function createSettingsRoute({ live, extra = () => ({}) }) {
  return {
    path: SETTINGS_ROUTE,
    handle(req, res, pathname) {
      if (pathname !== SETTINGS_ROUTE) return false;
      if (!is_loopback_peer(req)) {
        send_json(res, 403, { error: 'settings_non_loopback', detail: "Continuum's settings can only be changed from the computer it runs on." });
        return true;
      }
      if (!same_origin(req)) {
        send_json(res, 403, { error: 'settings_cross_origin', detail: 'Cross-origin requests to the settings route are refused.' });
        return true;
      }
      if (req.method === 'GET') {
        send_json(res, 200, settings_view(live, extra()));
        return true;
      }
      if (req.method !== 'PUT') {
        send_json(res, 405, { error: 'method_not_allowed' });
        return true;
      }
      const ctype = String((req.headers && req.headers['content-type']) || '').toLowerCase();
      if (!ctype.startsWith('application/json')) {
        send_json(res, 415, { error: 'expected_json' });
        return true;
      }
      void (async () => {
        let text = '';
        try {
          for await (const chunk of req) {
            text += chunk;
            if (text.length > 16384) throw new Error('body too large');
          }
          const body = JSON.parse(text || '{}');
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('expected a JSON object');
          const keys = Object.keys(body);
          if (!keys.length) throw new Error('no setting given');
          for (const k of keys) {
            if (!UI_WRITABLE_KEYS.includes(k)) throw new Error(`"${k}" cannot be changed here (use \`abstractcontinuum config set ${k} …\`)`);
            // Validate every key before writing any.
            if (body[k] !== null) coerce(setting_spec(k), body[k]);
          }
          for (const k of keys) live.set(k, body[k]);
          send_json(res, 200, settings_view(live, extra()));
        } catch (e) {
          send_json(res, 400, { error: 'invalid_setting', detail: String(e && e.message ? e.message : e) });
        }
      })();
      return true;
    },
  };
}
