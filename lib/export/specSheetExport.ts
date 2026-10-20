import * as XLSX from 'xlsx';
import type {Company} from '@/types/domain';
import type {SpecSheetSection} from '@/components/ds/sheets/SpecSheet';
import {valueColumns} from '@/lib/crm/specSchema';
export interface ConfidentialRow {p:string;s:string;u:string;v:string}
function table(sections:SpecSheetSection[],confidential:ConfidentialRow[]=[]){
 const columns=valueColumns(sections.flatMap(s=>s.rows));
 const rows=sections.flatMap(s=>s.rows.map(r=>[String(s.name),String(r.param),String(r.symbol||''),String(r.unit||''),...(r.merged?[String(r.value||''),...columns.slice(1).map(()=> '')]:columns.map(c=>String(r[c.key]||'')))]));
 for(const r of confidential)rows.push(['Internal requirements',r.p,r.s,r.u,r.v,...columns.slice(1).map(()=> '')]);
 return [['Section','Field','Symbol','Unit',...columns.map(c=>c.label)],...rows];
}
export async function exportSpecToXlsx(company:Company,sections:SpecSheetSection[],opts?:{confidential?:ConfidentialRow[]}) {
 const sheet=XLSX.utils.aoa_to_sheet([['Specification sheet'],['Customer',company.name],['Reference',company.ref],[],...table(sections,opts?.confidential)]);
 sheet['!cols']=[{wch:24},{wch:28},{wch:12},{wch:14},{wch:22},{wch:22}];
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Specifications');XLSX.writeFile(book,`${fileBase(company)}.xlsx`);
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function fileBase(company:Company){return `${(company.ref||company.name||'Customer').replace(/[^\w.-]+/g,'_')}_Specifications`;}
export function specPrintHtml(company:Company,sections:SpecSheetSection[],opts?:{confidential?:ConfidentialRow[]}) {
 const [head,...rows]=table(sections,opts?.confidential);
 return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(fileBase(company))}</title><style>@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#0c4a6e}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bae6fd;padding:8px;text-align:left}th{background:#0369a1;color:white}tr{break-inside:avoid}tr:nth-child(even){background:#f0f9ff}</style></head><body><h1>Specification sheet</h1><p>${escape(company.name)} · ${escape(company.ref)}</p><table><thead><tr>${head.map(c=>`<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escape(c||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}
export function exportSpecToPdf(company:Company,sections:SpecSheetSection[],opts?:{confidential?:ConfidentialRow[]}) {
 const frame=document.createElement('iframe');Object.assign(frame.style,{position:'fixed',width:'0',height:'0',border:'0'});document.body.appendChild(frame);
 const doc=frame.contentWindow?.document;if(!doc){frame.remove();return;}doc.open();doc.write(specPrintHtml(company,sections,opts));doc.close();setTimeout(()=>{frame.contentWindow?.focus();frame.contentWindow?.print();setTimeout(()=>frame.remove(),1000);},250);
}
