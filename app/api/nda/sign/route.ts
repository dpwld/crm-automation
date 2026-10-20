import {readJson} from '@/lib/http';
import {checkOrigin,failure} from '@/lib/server/auth';
import {signNda} from '@/lib/server/nda';
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await signNda(request,await readJson(request)),{headers:{'Cache-Control':'private,no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
