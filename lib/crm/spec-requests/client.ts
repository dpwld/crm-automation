import {readJson} from '@/lib/http';
import type { SpecRequest,PublicSpecRequest,SpecCcMember,SpecAttachment } from './model';
export async function specFetch<T>(url:string,body?:unknown):Promise<T>{const response=await fetch(url,{cache:'no-store',referrerPolicy:'no-referrer',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Your session has ended. Sign in again and reload.');const result=await readJson(response);if(!response.ok)throw new Error(result.error||'Unable to complete this request.');return result as T;}
export const fetchSpecRequests=(company:string)=>specFetch<SpecRequest[]>(`/api/crm/spec-requests?company=${encodeURIComponent(company)}`);
export const specCommand=(body:unknown)=>specFetch<{id?:string;status?:string;error?:string;applied_version_id?:string}>('/api/crm/spec-requests',body);
export const specRespond=(body:unknown)=>specFetch<PublicSpecRequest>('/api/crm/spec-response',body);

export const fetchSpecCcMembers=(company:string)=>specFetch<SpecCcMember[]>(`/api/crm/spec-requests?company=${encodeURIComponent(company)}&members=1`);

interface AttachmentUpdate {attachments:SpecAttachment[];draft_version:number}
export async function uploadSpecAttachment(token:string,file:File,revision:number):Promise<AttachmentUpdate>{
 const body=new FormData();body.set('token',token);body.set('file',file);body.set('revision',String(revision));
 const response=await fetch('/api/crm/spec-attachments',{method:'POST',body,cache:'no-store',referrerPolicy:'no-referrer'});
 if(response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Unable to upload this attachment. Reload and try again.');
 const data=await readJson(response);if(!response.ok)throw new Error(data.error||'Unable to upload this attachment.');return data as AttachmentUpdate;
}
export const deleteSpecAttachment=(token:string,id:string,revision:number)=>specFetch<AttachmentUpdate>('/api/crm/spec-attachments',{action:'delete',token,id,revision});
export async function downloadSpecAttachment(file:SpecAttachment,token?:string){
 const response=await fetch('/api/crm/spec-attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'download',id:file.id,token}),cache:'no-store',referrerPolicy:'no-referrer'});
 if(response.redirected)throw new Error('Your session has ended. Sign in again and reload.');
 if(!response.ok){const error=await readJson(response);throw new Error(error.error||'Unable to download this attachment.');}
 if(!response.headers.get('content-disposition')?.startsWith('attachment;'))throw new Error('Unable to download this attachment. Reload and try again.');
 const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
