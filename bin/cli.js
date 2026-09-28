#!/usr/bin/env node

/**
 * CLI entry point for AbstractContinuum
 * Serves the built console and proxies /api/* to the gateway through the
 * shared app-origin session proxy (first-party cookies + CSRF; tokens never
 * in URLs) — the same @abstractframework/app-server module the observer,
 * flow, and code apps converge on.
 *
 * Mountable under the gateway at /apps/continuum/ (the kit's mount
 * contract): every response announces `X-AbstractFramework-App:
 * continuum; mount=1`, the page gets `<base href="<base path>/">` and
 * `base_path`, and every "is this the operator's own computer?" check reads
 * the kit's requestContext (bin/request_gate.js). Served at `/` on its own
 * port it works exactly as before.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createContinuumServer } from './server.js';
import {
  SETTINGS,
  SOURCE_WORDS,
  apply_session_proxy_gates,
  createLiveSettings,
  default_settings_path,
  display_value,
  parse_args,
  read_settings_file,
  resolve_settings,
  setting_spec,
  update_settings_file,
} from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

function help_text() {
  const lines = [];
  const col = (left, right) => (left.length >= 30 ? `  ${left}\n${' '.repeat(32)}${right}` : `  ${left.padEnd(30)}${right}`);
  lines.push('Usage:');
  lines.push('  abstractcontinuum [options]                 start the console server');
  lines.push('  abstractcontinuum config get [setting]      show settings and their sources');
  lines.push('  abstractcontinuum config set <setting> <value>');
  lines.push('  abstractcontinuum config set hub_token --from-file <path>');
  lines.push('  abstractcontinuum config unset <setting>');
  lines.push('  abstractcontinuum config path               print the settings file path');
  lines.push('');
  lines.push('Serves the AbstractContinuum console and proxies /api/* to a Run Gateway');
  lines.push('through a same-origin session proxy.');
  lines.push('');
  lines.push('Options (each is also a saved setting; its name follows "setting"):');
  for (const spec of SETTINGS) {
    const left = spec.type === 'bool' ? spec.flag : `${spec.flag} ${spec.metavar}`;
    const def = spec.type === 'bool' ? 'off' : spec.default === '' ? 'none' : String(spec.default);
    lines.push(col(left, spec.help));
    lines.push(`${' '.repeat(32)}default ${def}; setting ${spec.key}`);
    if (spec.key === 'gateway_url') {
      lines.push(`${' '.repeat(32)}also --gateway <url>, --url <url>; with none set, the gateway`);
      lines.push(`${' '.repeat(32)}installed on this computer (~/.abstractframework/gateway.json)`);
    }
    if (spec.key === 'hub_token') {
      lines.push(col('--hub-token-file <path>', 'read the hub token from a file (never printed)'));
      lines.push(`${' '.repeat(32)}setting hub_token`);
    }
  }
  lines.push(col('--settings-file <path>', 'settings file'));
  lines.push(`${' '.repeat(32)}default ~/.abstractcontinuum/settings.json`);
  lines.push(col('--help', 'show this help'));
  lines.push(col('--version', 'print the version'));
  lines.push('');
  lines.push('On/off options take --option, --option=off or --no-option.');
  lines.push('Precedence: launch flag > settings file > environment (legacy) > default.');
  lines.push('The hub seat can also be set on the Settings page.');
  lines.push('Legacy fallback: the environment variables listed in the configuration guide are');
  lines.push('still read when neither a flag nor a setting is set.');
  lines.push('');
  lines.push('Documentation: https://github.com/lpalbou/AbstractContinuum#readme');
  return lines.join('\n');
}

const parsed = parse_args(process.argv.slice(2));
if (parsed.error) {
  console.error(`abstractcontinuum: ${parsed.error}`);
  process.exit(2);
}
if (parsed.command === 'version') {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}
if (parsed.command === 'help') {
  console.log(help_text());
  process.exit(0);
}

const SETTINGS_PATH = parsed.settings_file || default_settings_path();

if (parsed.command === 'config') {
  process.exit(run_config(parsed));
}

/** `abstractcontinuum config get|set|unset|path` — same keys as the flags. */
function run_config(p) {
  const { action, key, value } = p.config;
  try {
    if (action === 'path') {
      console.log(SETTINGS_PATH);
      return 0;
    }
    if (action === 'set' || action === 'unset') {
      let v = action === 'unset' ? null : value;
      if (action === 'set' && p.from_file) {
        v = readFileSync(p.from_file, 'utf8').trim();
        if (!v) throw new Error(`${p.from_file} is empty`);
      }
      update_settings_file(SETTINGS_PATH, key, v);
      const spec = setting_spec(key);
      const shown = action === 'unset' ? '(removed)' : display_value(spec, read_settings_file(SETTINGS_PATH)[key]);
      console.log(`${key} = ${shown}  (${SETTINGS_PATH})`);
      return 0;
    }
    // get
    const { settings, problems } = resolve_settings({ flags: p.flags, file: read_settings_file(SETTINGS_PATH), env: process.env });
    for (const msg of problems) console.error(`warning: ${msg}`);
    if (key) {
      console.log(display_value(setting_spec(key), settings[key].value));
      return 0;
    }
    const width = Math.max(...SETTINGS.map((s) => s.key.length)) + 2;
    for (const spec of SETTINGS) {
      const { value: v, source } = settings[spec.key];
      console.log(`${spec.key.padEnd(width)}${display_value(spec, v)}  (${SOURCE_WORDS[source]})`);
    }
    console.log(`\nsettings file: ${SETTINGS_PATH}`);
    return 0;
  } catch (e) {
    console.error(`abstractcontinuum config: ${e && e.message ? e.message : e}`);
    return 1;
  }
}

// A corrupt settings file stops the start (running on silent defaults
// would, e.g., drop a saved seat without a word).
try {
  read_settings_file(SETTINGS_PATH);
} catch (e) {
  console.error(`abstractcontinuum: cannot read the settings file ${SETTINGS_PATH}: ${e && e.message ? e.message : e}`);
  process.exit(2);
}

const settings = createLiveSettings({
  flags: parsed.flags,
  settingsPath: SETTINGS_PATH,
  env: process.env,
  onProblem: (msg) => console.error(`warning: ${msg}`),
});
const AT_START = settings.get();

const PORT = AT_START.port.value;
// Default bind is LOOPBACK (entity's c1768 SSRF finding against the shared
// session proxy, plus a continuum-specific amplifier: this server also
// mounts the hub proxy carrying the OPERATOR's seat key — a LAN peer
// reaching the port could author hub messages as the operator). Wider
// binds are an explicit deployment choice (--host).
const HOST = AT_START.host.value;
const DEFAULT_GATEWAY_URL = AT_START.gateway_url.value;
// The session proxy reads its hardening gates from the environment only;
// hand it the resolved values (flag > setting > environment > default).
apply_session_proxy_gates(AT_START, process.env);

const server = createContinuumServer({ settings, distDir: DIST_DIR });

server.listen(PORT, HOST, () => {
  const seat = AT_START.hub_seat;
  console.log(`
AbstractContinuum is running.
  Local:    http://localhost:${PORT}
  Gateway:  ${DEFAULT_GATEWAY_URL} (${SOURCE_WORDS[AT_START.gateway_url.source]})
  Hub seat: ${seat.value} (${SOURCE_WORDS[seat.source]})
  Settings: ${SETTINGS_PATH}
`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
