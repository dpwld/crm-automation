import type { SpecVersionRow } from '@/lib/data/specBuilds';
import type {SpecField} from '@/lib/crm/specSchema';
export type {SpecField} from '@/lib/crm/specSchema';
export function fieldsFromRows(rows:SpecVersionRow[]):SpecField[]{return rows.filter(r=>!r.confidential).map(r=>({section:r.section,parameter:r.parameter,symbol:r.symbol,unit:r.unit,merged:r.merged,isText:r.isText,computed:false,columnLabels:r.columnLabels||['Value 1','Value 2']}));}
export interface SpecAttachment {id:string;name:string;size:number;content_type:string}
export type Answers=Record<string,string|null>;
export type RequestStatus='sending'|'sent'|'in_progress'|'submitted'|'reviewed'|'failed'|'needs_verification'|'revoked';
export interface PublicSpecRequest {note?:string;attachments?:SpecAttachment[];company:string;contact:string;due_date:string|null;expires_at:string;fields:SpecField[];answers:Answers;respondent_name:string;draft_version:number;status:RequestStatus;submitted_at:string|null}
export interface SpecRequest {fields:SpecField[];note?:string;attachments?:SpecAttachment[];id:string;version_id:string;company_id:string;deal_id:string;contact_id:string;recipient:string;recipient_name:string;cc?:string[];cc_member_ids?:string[];message:string;due_date:string|null;expires_at:string;status:RequestStatus;created_at:string;sent_at:string|null;submitted_at:string|null;answers:Answers|null;respondent_name:string;part_label:string;deal_title:string;deal_no:string;current_rows:SpecVersionRow[];spec_updated_at:string;is_final:boolean;delivery_error:string;applied_version_id:string|null}
export function fieldKeys(f:SpecField){return f.merged?['value']:['hot','cold'];}
export function validateAnswers(answers:Answers,fields:SpecField[]):string|null {
 const allowed=new Map<string,SpecField>(fields.filter(f=>!f.computed).flatMap(f=>fieldKeys(f).map(col=>[`${f.parameter}:${col}`,f] as const)));
 for(const [key,value] of Object.entries(answers)){
  const f=allowed.get(key);if(!f)return 'Unknown field.';
  if(value===null)continue;
  if(typeof value!=='string'||value.length>160)return 'Keep values under 160 characters.';
  if(value.trim()&&!f.isText&&!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,2})?$/.test(value.trim()))return `Enter a valid number for ${f.parameter}.`;
 }
 return null;
}
export function answerRows(answers:Answers,fields:SpecField[]):SpecVersionRow[]{
 return fields.map((f,sort)=>({...f,confidential:false,sort,value:answers[`${f.parameter}:value`]??'',valueHot:answers[`${f.parameter}:hot`]??'',valueCold:answers[`${f.parameter}:cold`]??''}));
}
export function changedCells(answers:Answers,current:SpecVersionRow[],fields:SpecField[]=fieldsFromRows(current)){
 return fields.filter(f=>!f.computed).flatMap(f=>fieldKeys(f).map(col=>{
  const key=`${f.parameter}:${col}`,raw=answers[key];
  const row=current.find(r=>r.parameter===f.parameter&&r.section===f.section);
  const prior=(col==='hot'?row?.valueHot:col==='cold'?row?.valueCold:row?.value)||'';
  return {key,label:`${f.parameter}${col==='value'?'':` · ${f.columnLabels[col==='hot'?0:1]}`}`,unit:f.unit,current:prior,next:raw===null?'Not known yet':raw??'',unknown:raw===null};
 }).filter(c=>c.next!==''&&(c.unknown||c.next!==c.current)));
}
export function redactSpecLinks(text:string){return text.replace(/(\/spec-request#)[A-Za-z0-9_-]{43}/g,'$1[private-link]');}
export function requestStatus(r:Pick<SpecRequest,'status'|'expires_at'>){return !['submitted','reviewed','revoked','failed'].includes(r.status)&&Date.parse(r.expires_at)<Date.now()?'Expired':({sending:'Sending',sent:'Sent',in_progress:'In progress',submitted:'Received',reviewed:'Applied',failed:'Delivery failed',needs_verification:'Check delivery',revoked:'Revoked'}[r.status]);}
export function sameAnswers(a:Answers,b:Answers){const value=(v:string|null|undefined)=>v===null?null:(v?.trim()||'');return Object.keys({...a,...b}).every(k=>value(a[k])===value(b[k]));}

export function displayedSubmission(request:PublicSpecRequest,draft:Answers,name:string){return ['submitted','reviewed'].includes(request.status)?{answers:request.answers,name:request.respondent_name}:{answers:draft,name};}

export interface SpecCcMember {id:string;name:string;email:string;team:string}
