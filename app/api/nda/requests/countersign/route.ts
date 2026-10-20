import {readJson} from '@/lib/http';
import {checkOrigin,failure,identity} from '@/lib/server/auth';
import {countersignNda} from '@/lib/server/nda';
export async function POST(request:Request){try{checkOrigin(request);const user=await identity(),body=await readJson(request);return Response.json(await countersignNda(user.userId,{email:user.email,name:user.displayName},body.id));}catch(error){return failure(error);}}
