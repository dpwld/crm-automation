import {ApiError,failure,identity} from '@/lib/server/auth';
import {rows} from '@/lib/server/store';
import {ndaPdf} from '@/lib/server/nda';
export async function GET(request:Request){try{const user=await identity(),id=new URL(request.url).searchParams.get('id'),row=(await rows(user.userId,'nda_requests')).find(r=>r.id===id);if(!row)throw new ApiError('NDA not found.',404);const bytes=await ndaPdf(row);return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="NDA.pdf"','Cache-Control':'private,no-store'}});}catch(error){return failure(error);}}
