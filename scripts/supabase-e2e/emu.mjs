// A small Supabase stand-in for end-to-end verification without Docker or the
// hosted service. It runs the REAL repo SQL (schema + migrations) on PGlite and
// speaks the subset of PostgREST and GoTrue that the app uses, with the same
// semantics that matter here:
//   - the caller's role comes from the JWT (anon / authenticated / service_role)
//     and is applied with SET LOCAL ROLE, so RLS behaves as on Supabase;
//   - every request is one transaction;
//   - upsert = INSERT .. ON CONFLICT .. DO UPDATE (needs UPDATE policy) and
//     `resolution=ignore-duplicates` = DO NOTHING, exactly as PostgREST sends them;
//   - errors come back as {code,message,details,hint} with HTTP statuses that
//     supabase-js surfaces the same way.
import crypto from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

export const EMU_URL = 'http://emu.test'
export const JWT_SECRET = 'emu-test-secret-0123456789abcdef0123456789'

const b64u = (buf) => Buffer.from(buf).toString('base64url')
export function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify(payload))
  const sig = b64u(crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest())
  return `${head}.${body}.${sig}`
}
export function verifyJwt(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const expect = b64u(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest())
  const a = Buffer.from(expect), b = Buffer.from(parts[2])
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) return null
    return p
  } catch { return null }
}
export const ANON_KEY = signJwt({ iss: 'emu', role: 'anon', exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 })
export const SERVICE_KEY = signJwt({ iss: 'emu', role: 'service_role', exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 })

const IDENT = /^[a-z_][a-z0-9_]*$/i
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

class HttpErr extends Error {
  constructor(status, body) { super(body?.message || 'error'); this.status = status; this.body = body }
}
const json = (body, status = 200, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  })

function qi(name) {
  if (!IDENT.test(String(name))) throw new HttpErr(400, { code: 'PGRST100', message: `bad identifier ${name}`, details: null, hint: null })
  return `"${name}"`
}
function splitTop(s) {
  const out = []; let depth = 0; let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.length) out.push(cur)
  return out
}
function toText(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export class SupabaseEmu {
  /** @param {{ db?: PGlite, sqlFiles?: string[], stubs?: string, grants?: string }} opts */
  constructor(opts = {}) {
    this.db = opts.db
    this.queue = Promise.resolve()
    this.log = []
    this.refresh = new Map()
  }

  static async create({ files = [], stubs, extraSql = '' } = {}) {
    const db = await PGlite.create()
    await db.exec(stubs)
    for (const sql of files) await db.exec(sql)
    if (extraSql) await db.exec(extraSql)
    return new SupabaseEmu({ db })
  }

  // Serialize every request: PGlite is a single connection.
  run(fn) {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => {})
    return next
  }

  async tx(role, sub, fn) {
    const claims = JSON.stringify(sub ? { sub, role, aud: 'authenticated' } : { role })
    await this.db.exec('begin')
    try {
      await this.db.exec(`set local role ${role}`)
      await this.db.query(
        `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)`,
        [claims, sub || '', role],
      )
      const out = await fn()
      await this.db.exec('commit')
      return out
    } catch (e) {
      await this.db.exec('rollback')
      throw e
    }
  }

  async handle(req) {
    return this.run(() => this.dispatch(req).catch((e) => this.errorResponse(e)))
  }

  errorResponse(e) {
    if (e instanceof HttpErr) return json(e.body, e.status)
    const code = e?.code
    let status = 400
    if (code === '42501') status = this.lastRole === 'anon' ? 401 : 403
    else if (code === '23505' || code === '23503' || code === '40001' || code === '40P01') status = 409
    else if (code === '42P01') status = 404
    else if (code === '42703' || code === 'P0001' || code === '23514' || code === '22P02' || code === '23502' || code === '22001') status = 400
    else if (code === 'PGRST116') status = 406
    else status = 500
    this.log.push({ code, message: e?.message })
    return json({ code, message: e?.message, details: e?.detail ?? null, hint: e?.hint ?? null }, status)
  }

  identity(req) {
    const auth = req.headers.get('authorization') || ''
    const apikey = req.headers.get('apikey') || ''
    let token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) token = apikey
    if (!token) return { role: 'anon', sub: null }
    const p = verifyJwt(token)
    if (!p) {
      if (auth) throw new HttpErr(401, { code: 'PGRST301', message: 'JWT expired or invalid', details: null, hint: null })
      return { role: 'anon', sub: null }
    }
    return { role: p.role || 'anon', sub: p.sub || null }
  }

  async dispatch(req) {
    const url = new URL(req.url)
    const p = url.pathname
    if (p.startsWith('/auth/v1/')) return this.auth(req, url)
    if (!p.startsWith('/rest/v1/')) return json({ message: 'not found' }, 404)
    const who = this.identity(req)
    this.lastRole = who.role
    const rest = p.slice('/rest/v1/'.length)
    if (rest.startsWith('rpc/')) return this.rpc(req, url, who, rest.slice(4))
    return this.table(req, url, who, rest)
  }

  async tableExists(name) {
    const r = await this.db.query(`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1`, [name])
    return r.rows.length > 0
  }

  async table(req, url, who, name) {
    if (!IDENT.test(name)) throw new HttpErr(404, { code: 'PGRST205', message: `Could not find the table '${name}'`, details: null, hint: null })
    if (!(await this.tableExists(name))) {
      throw new HttpErr(404, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache`, details: null, hint: null })
    }
    const params = url.searchParams
    const method = req.method.toUpperCase()
    const prefer = req.headers.get('prefer') || ''
    if (method === 'GET' || method === 'HEAD') return this.select(req, params, who, name)
    const body = req.headers.get('content-type')?.includes('json') ? await req.json() : null
    if (method === 'POST') return this.insert(params, prefer, who, name, body)
    if (method === 'PATCH') return this.update(params, prefer, who, name, body)
    throw new HttpErr(405, { code: 'PGRST000', message: `method ${method} not supported by the emulator`, details: null, hint: null })
  }

  buildWhere(params, values) {
    const conds = []
    const push = (v) => { values.push(v); return `$${values.length}` }
    for (const [key, raw] of params.entries()) {
      if (RESERVED.has(key)) continue
      if (key === 'or') {
        const inner = String(raw).replace(/^\(/, '').replace(/\)$/, '')
        const parts = splitTop(inner).map((item) => this.condFromItem(item, push))
        conds.push(`(${parts.join(' or ')})`)
        continue
      }
      conds.push(this.condFromItem(`${key}.${raw}`, push))
    }
    return conds.length ? ` where ${conds.join(' and ')}` : ''
  }

  condFromItem(item, push) {
    const m = String(item).match(/^([a-z_][a-z0-9_]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/is)
    if (!m) throw new HttpErr(400, { code: 'PGRST100', message: `unsupported filter ${item}`, details: null, hint: null })
    const col = qi(m[1]); const neg = !!m[2]; const op = m[3].toLowerCase(); const val = m[4]
    let cond
    switch (op) {
      case 'eq': cond = `${col} = ${push(val)}`; break
      case 'neq': cond = `${col} <> ${push(val)}`; break
      case 'gt': cond = `${col} > ${push(val)}`; break
      case 'gte': cond = `${col} >= ${push(val)}`; break
      case 'lt': cond = `${col} < ${push(val)}`; break
      case 'lte': cond = `${col} <= ${push(val)}`; break
      case 'like': cond = `${col} like ${push(val.replace(/\*/g, '%'))}`; break
      case 'ilike': cond = `${col} ilike ${push(val.replace(/\*/g, '%'))}`; break
      case 'is': {
        const v = val.toLowerCase()
        if (v === 'null') cond = `${col} is null`
        else if (v === 'true' || v === 'false') cond = `${col} is ${v}`
        else throw new HttpErr(400, { code: 'PGRST100', message: `bad is value ${val}`, details: null, hint: null })
        break
      }
      case 'in': {
        const inner = val.replace(/^\(/, '').replace(/\)$/, '')
        const items = inner.length ? splitTop(inner).map((s) => s.replace(/^"(.*)"$/s, '$1')) : []
        cond = items.length ? `${col} in (${items.map((x) => push(x)).join(',')})` : 'false'
        break
      }
      default: throw new HttpErr(400, { code: 'PGRST100', message: `op ${op}`, details: null, hint: null })
    }
    return neg ? `not (${cond})` : cond
  }

  buildOrder(order) {
    if (!order) return ''
    const parts = String(order).split(',').map((tok) => {
      const bits = tok.split('.')
      const col = qi(bits[0])
      const dir = bits.includes('desc') ? 'desc' : 'asc'
      const nulls = bits.includes('nullsfirst') ? ' nulls first' : bits.includes('nullslast') ? ' nulls last' : ''
      return `${col} ${dir}${nulls}`
    })
    return ` order by ${parts.join(', ')}`
  }

  buildSelectList(sel) {
    if (!sel || sel === '*') return '*'
    return splitTop(sel).map((raw) => {
      let tok = raw.trim(); let alias = null
      const a = tok.match(/^([a-z_][a-z0-9_]*):(.+)$/i)
      if (a) { alias = a[1]; tok = a[2] }
      const j = tok.match(/^([a-z_][a-z0-9_]*)->([a-z_][a-z0-9_]*)$/i)
      if (j) return `${qi(j[1])}->'${j[2]}' as ${qi(alias || j[2])}`
      if (!IDENT.test(tok)) throw new HttpErr(400, { code: 'PGRST100', message: `bad select ${raw}`, details: null, hint: null })
      return alias ? `${qi(tok)} as ${qi(alias)}` : qi(tok)
    }).join(', ')
  }

  async select(req, params, who, name) {
    const prefer = req.headers.get('prefer') || ''
    const accept = req.headers.get('accept') || ''
    const values = []
    const where = this.buildWhere(params, values)
    const order = this.buildOrder(params.get('order'))
    let limit = params.get('limit'); let offset = params.get('offset')
    const range = req.headers.get('range')
    if (range && !limit && !offset) {
      const m = range.match(/^(\d+)-(\d+)$/)
      if (m) { offset = m[1]; limit = String(Number(m[2]) - Number(m[1]) + 1) }
    }
    const lim = limit !== null ? ` limit ${Math.max(0, Number(limit) | 0)}` : ''
    const off = offset !== null ? ` offset ${Math.max(0, Number(offset) | 0)}` : ''
    const base = `select ${this.buildSelectList(params.get('select'))} from public.${qi(name)}${where}`
    return this.tx(who.role, who.sub, async () => {
      const rows = await this.db.query(`select coalesce(json_agg(t), '[]'::json) as r from (${base}${order}${lim}${off}) t`, values)
      const data = rows.rows[0].r
      const headers = {}
      if (/count=exact/.test(prefer)) {
        const c = await this.db.query(`select count(*)::int as n from public.${qi(name)}${where}`, values)
        const total = c.rows[0].n
        const from = offset ? Number(offset) : 0
        headers['Content-Range'] = data.length ? `${from}-${from + data.length - 1}/${total}` : `*/${total}`
      }
      if (/vnd\.pgrst\.object/.test(accept)) {
        if (!Array.isArray(data) || data.length !== 1) {
          throw new HttpErr(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${Array.isArray(data) ? data.length : 0} rows`, hint: null })
        }
        return json(data[0], 200, headers)
      }
      return json(data, 200, headers)
    })
  }

  resolutionOf(prefer) {
    if (/resolution=merge-duplicates/.test(prefer)) return 'merge'
    if (/resolution=ignore-duplicates/.test(prefer)) return 'ignore'
    return null
  }

  async insert(params, prefer, who, name, body) {
    const rows = Array.isArray(body) ? body : [body]
    if (!rows.length || !rows[0] || typeof rows[0] !== 'object') throw new HttpErr(400, { code: 'PGRST102', message: 'Empty or invalid body', details: null, hint: null })
    const cols = []
    for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
    const values = []
    const tuples = rows.map((r) => `(${cols.map((c) => {
      if (!(c in r) || r[c] === undefined) return 'DEFAULT'
      values.push(toText(r[c]))
      return `$${values.length}`
    }).join(',')})`)
    let sql = `insert into public.${qi(name)} (${cols.map(qi).join(',')}) values ${tuples.join(',')}`
    const res = this.resolutionOf(prefer)
    if (res) {
      const conflictCols = (params.get('on_conflict') || 'id').split(',').map((c) => c.trim())
      const conflict = conflictCols.map(qi).join(',')
      if (res === 'merge') {
        const upd = cols.filter((c) => !conflictCols.includes(c))
        sql += upd.length
          ? ` on conflict (${conflict}) do update set ${upd.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(', ')}`
          : ` on conflict (${conflict}) do nothing`
      } else {
        sql += ` on conflict (${conflict}) do nothing`
      }
    }
    const returning = /return=representation/.test(prefer)
    if (returning) sql = `with ins as (${sql} returning *) select coalesce(json_agg(ins), '[]'::json) as r from ins`
    return this.tx(who.role, who.sub, async () => {
      if (returning) {
        const r = await this.db.query(sql, values)
        return json(r.rows[0].r, 201)
      }
      await this.db.query(sql, values)
      return new Response(null, { status: 201 })
    })
  }

  async update(params, prefer, who, name, body) {
    if (!body || typeof body !== 'object') throw new HttpErr(400, { code: 'PGRST102', message: 'Empty or invalid body', details: null, hint: null })
    const values = []
    const setSql = Object.keys(body).map((c) => { values.push(toText(body[c])); return `${qi(c)} = $${values.length}` }).join(', ')
    const where = this.buildWhere(params, values)
    const returning = /return=representation/.test(prefer)
    const sql = `update public.${qi(name)} set ${setSql}${where}${returning ? ' returning *' : ''}`
    return this.tx(who.role, who.sub, async () => {
      if (returning) {
        const r = await this.db.query(`select coalesce(json_agg(u), '[]'::json) as r from (${sql}) u`, values)
        return json(r.rows[0].r, 200)
      }
      await this.db.query(sql, values)
      return new Response(null, { status: 204 })
    })
  }

  async rpc(req, url, who, fn) {
    if (!IDENT.test(fn)) throw new HttpErr(404, { code: 'PGRST202', message: `Could not find the function ${fn}`, details: null, hint: null })
    const args = req.method.toUpperCase() === 'POST' ? (await req.json().catch(() => ({}))) || {} : {}
    const meta = await this.db.query(
      `select p.proretset, format_type(p.prorettype, null) as rt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`, [fn])
    if (!meta.rows.length) throw new HttpErr(404, { code: 'PGRST202', message: `Could not find the function public.${fn}`, details: null, hint: null })
    const names = Object.keys(args)
    const values = names.map((k) => toText(args[k]))
    const callSql = `public.${qi(fn)}(${names.map((k, i) => `${qi(k)} := $${i + 1}`).join(', ')})`
    const setof = meta.rows[0].proretset
    const sql = setof
      ? `select coalesce(json_agg(t), '[]'::json) as r from (select * from ${callSql}) t`
      : `select to_json(${callSql}) as r`
    return this.tx(who.role, who.sub, async () => {
      const r = await this.db.query(sql, values)
      return json(r.rows[0].r, 200)
    })
  }

  // ---------------------------------------------------------------- GoTrue
  async auth(req, url) {
    const p = url.pathname.replace('/auth/v1', '')
    const body = req.headers.get('content-type')?.includes('json') && req.method !== 'GET' ? await req.json() : {}
    if (p === '/token' && url.searchParams.get('grant_type') === 'password') {
      const r = await this.db.query(
        `select id, email, encrypted_password, raw_user_meta_data from auth.users where lower(email) = lower($1)`, [String(body.email || '')])
      const u = r.rows[0]
      if (!u || u.encrypted_password !== hashPw(String(body.password || ''))) {
        return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      }
      await this.db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [u.id])
      return json(this.session(u))
    }
    if (p === '/signup' && req.method === 'POST') {
      const id = crypto.randomUUID()
      const email = String(body.email || '').toLowerCase()
      const dup = await this.db.query(`select 1 from auth.users where lower(email) = $1`, [email])
      if (dup.rows.length) return json({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' }, 422)
      await this.db.query(
        `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4, now())`,
        [id, email, hashPw(String(body.password || '')), JSON.stringify(body.data || {})])
      const r = await this.db.query(`select id, email, encrypted_password, raw_user_meta_data from auth.users where id = $1`, [id])
      return json(this.session(r.rows[0]))
    }
    if (p === '/admin/users' && req.method === 'POST') {
      if (this.identity(req).role !== 'service_role') return json({ code: 403, msg: 'not allowed' }, 403)
      const id = crypto.randomUUID()
      await this.db.query(
        `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4, now())`,
        [id, String(body.email || '').toLowerCase(), hashPw(String(body.password || '')), JSON.stringify(body.user_metadata || {})])
      return json({ id, email: body.email, user_metadata: body.user_metadata || {} })
    }
    if (p === '/user' && req.method === 'GET') {
      const auth = req.headers.get('authorization') || ''
      const payload = verifyJwt(auth.replace(/^Bearer\s+/i, '').trim())
      if (!payload || payload.role !== 'authenticated') return json({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, 401)
      const r = await this.db.query(`select id, email, raw_user_meta_data from auth.users where id = $1`, [payload.sub])
      if (!r.rows[0]) return json({ code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' }, 403)
      const u = r.rows[0]
      return json({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.raw_user_meta_data || {} })
    }
    if (p === '/logout') return new Response(null, { status: 204 })
    return json({ code: 404, msg: `auth path ${p} not emulated` }, 404)
  }

  session(u) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const access = signJwt({ aud: 'authenticated', exp, sub: u.id, email: u.email, role: 'authenticated', iat: Math.floor(Date.now() / 1000) })
    return {
      access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp,
      refresh_token: crypto.randomBytes(12).toString('hex'),
      user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.raw_user_meta_data || {} },
    }
  }
}

export function hashPw(pw) {
  return crypto.createHash('sha256').update(`emu-salt:${pw}`).digest('hex')
}

// Supabase platform stand-ins: auth schema, auth.uid(), roles, storage.
export const STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    encrypted_password text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    created_at timestamptz default now()
  );
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $fn$ select string_to_array(name, '/') $fn$;
`

// Supabase default privileges: the API roles can use every public table
// (row visibility is then decided by RLS, which is the real security boundary).
export const DEFAULT_GRANTS = `
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`
