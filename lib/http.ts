import type {Row} from './supabase/client';
/** Runtime payloads are validated at the owning endpoint. Keeps the retained
 * original interface modules independent of Worker/DOM Response type changes. */
export async function readJson<T = Row>(response: Pick<Response,'json'>):Promise<T>{return await response.json() as T;}
