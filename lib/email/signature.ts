import { COMPANY } from '@/lib/config/company';
export interface SignatureIdentity {name:string;title?:string;email:string;mobile?:string;office?:string;}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function buildSignature(id:SignatureIdentity):string {return `<div style="font:13px/1.6 Arial,sans-serif;color:#333;border-top:1px solid #ddd;margin-top:24px;padding-top:12px"><strong>${esc(id.name)}</strong>${id.title?`<br>${esc(id.title)}`:''}${COMPANY.name?`<br>${esc(COMPANY.name)}`:''}<br>${esc(id.email)}${id.mobile?`<br>${esc(id.mobile)}`:''}${COMPANY.address?`<br>${esc(COMPANY.address)}`:''}</div>`;}
export function withSignature(html:string,id:SignatureIdentity):string{return html+buildSignature(id);}
export const signatureHtml=buildSignature;
