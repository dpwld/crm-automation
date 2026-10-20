import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,failure,identity} from '@/lib/server/auth';
import {rows} from '@/lib/server/store';
import {decideRequest} from '@/lib/server/approvals';
export async function POST(request:Request){try{checkOrigin(request);const user=await identity(),body=await readJson(request),row=(await rows(user.userId,'change_requests')).find(r=>r.id===body.id);if(!row)throw new ApiError('Request not found.',404);if(typeof body.approve!=='boolean'||(body.note!=null&&(typeof body.note!=='string'||body.note.length>2000)))throw new ApiError('Invalid decision.');return Response.json(await decideRequest(user.userId,row,body.approve,body.note||''));}catch(error){return failure(error);}}
