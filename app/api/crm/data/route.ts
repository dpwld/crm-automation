import {readJson} from '@/lib/http';
import { checkOrigin, failure, identity } from '@/lib/server/auth';
import { execute } from '@/lib/server/store';
export async function POST(request:Request) {try {checkOrigin(request);const user=await identity();return Response.json(await execute(user.userId,await readJson(request)),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
