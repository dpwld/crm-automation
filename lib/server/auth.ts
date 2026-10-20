import { getChatGPTUser } from '@/app/chatgpt-auth';
export class ApiError extends Error { constructor(message:string, public status = 400) { super(message); } }
export async function identity() {
 const user = await getChatGPTUser();
 if (!user) throw new ApiError('Sign in with ChatGPT to access your private CRM.',401);
 return user;
}
export function failure(error:unknown) { return Response.json({error:error instanceof Error ? error.message : 'Unexpected server error'}, { status:error instanceof ApiError ? error.status : 500, headers:{'Cache-Control':'no-store'} }); }
export function checkOrigin(request:Request) { const origin=request.headers.get('origin'); if(origin && origin !== new URL(request.url).origin) throw new ApiError('Cross-origin writes are not allowed.',403); }
