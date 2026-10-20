import {readJson} from '@/lib/http';
import {checkOrigin,failure} from '@/lib/server/auth';
import {respondSpec} from '@/lib/server/spec-links';
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await respondSpec(await readJson(request)),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
