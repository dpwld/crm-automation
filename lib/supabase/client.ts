import {readJson} from '@/lib/http';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Filter = { field: string; op: string; value: unknown };
export type QuerySpec = { table: string; action: string; values?: Row | Row[]; filters: Filter[]; orders: { field: string; ascending?: boolean; nullsFirst?: boolean }[]; limit?: number; projection?: string; conflict?: string; single?: boolean; optional?: boolean };
export type Result<T> = {data:T;error:null;count?:number}|{data:null;error:{message:string;code?:string};count?:number};
async function send<T>(url: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(url, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), cache: 'no-store' });
    const json = await readJson(response);
    if (!response.ok) return { data: null, error: { message: json.error || `Request failed (${response.status})`, code: json.code } };
    return { data: json.data, error: null, count: json.count };
  } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }; }
}
class Query<T = Row[]> implements PromiseLike<Result<T>> {
  private q: QuerySpec;
  constructor(table: string) { this.q = { table, action: 'select', filters: [], orders: [] }; }
  select(projection = '*', _options?: unknown): this { this.q.projection = projection; return this; }
  insert(values: Row | Row[]): this { this.q.action = 'insert'; this.q.values = values; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this { this.q.action = 'upsert'; this.q.values = values; this.q.conflict = options?.onConflict; return this; }
  update(values: Row): this { this.q.action = 'update'; this.q.values = values; return this; }
  delete(): this { this.q.action = 'delete'; return this; }
  private filter(field: string, op: string, value: unknown): this { this.q.filters.push({ field, op, value }); return this; }
  eq(f: string, v: unknown): this { return this.filter(f, 'eq', v); }
  neq(f: string, v: unknown): this { return this.filter(f, 'neq', v); }
  in(f: string, v: unknown[]): this { return this.filter(f, 'in', v); }
  is(f: string, v: unknown): this { return this.filter(f, 'is', v); }
  not(f: string, op: string, v: unknown): this { if(op !== 'is') throw new Error('Unsupported filter'); return this.filter(f, 'not', v); }
  like(f: string, v: string): this { return this.filter(f, 'like', v); }
  ilike(f: string, v: string): this { return this.filter(f, 'ilike', v); }
  order(field: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this { this.q.orders.push({ field, ...options }); return this; }
  limit(value: number): this { this.q.limit = value; return this; }
  single(): Query<Row> { this.q.single = true; return this as unknown as Query<Row>; }
  maybeSingle(): Query<Row | null> { this.q.single = true; this.q.optional = true; return this as unknown as Query<Row | null>; }
  then<TResult1 = Result<T>, TResult2 = never>(onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { return send<T>('/api/crm/data', this.q).then(onfulfilled, onrejected); }
}
class Storage {
  constructor(private bucket: string) {}
  async upload(path: string, file: Blob, options?: { contentType?: string; upsert?: boolean }): Promise<Result<{path:string}>> {
    const form = new FormData(); form.set('bucket', this.bucket); form.set('path', path); form.set('file', file); form.set('upsert', String(!!options?.upsert));
    try { const r = await fetch('/api/crm/files', { method: 'POST', body: form }); const json = await readJson(r); return r.ok ? { data: {path}, error: null } : { data: null, error: {message:json.error} }; } catch(error) { return {data:null,error:{message:String(error)}}; }
  }
  createSignedUrl(path: string, _seconds?: number): Promise<Result<{ signedUrl: string }>> { return send('/api/crm/files', { action: 'url', bucket: this.bucket, path }); }
  remove(paths: string[]): Promise<Result<null>> { return send('/api/crm/files', { action: 'remove', bucket: this.bucket, paths }); }
}
export function createClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: <T = unknown>(name: string, args?: Row) => send<T>('/api/crm/rpc', { name, args }),
    storage: { from: (bucket: string) => new Storage(bucket) },
    auth: { getUser: async () => { const r = await fetch('/api/session'); const json = await readJson(r); return { data: {user: r.ok ? {id:json.user.id,email:json.user.email} : null }, error:r.ok ? null : {message:json.error} }; } },
  };
}
