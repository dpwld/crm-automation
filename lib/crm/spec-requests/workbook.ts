import * as XLSX from 'xlsx';
import { fieldKeys, validateAnswers, type Answers, type PublicSpecRequest } from './model';

import {valueColumns} from '@/lib/crm/specSchema';
const headers=(request:PublicSpecRequest)=>['Section','Field','Symbol','Unit',...valueColumns(request.fields).map(c=>c.label)];
const UNKNOWN='Not known yet';
const FIRST_ROW=9;
export const MAX_WORKBOOK_BYTES=2*1024*1024;

/** Parse and validate the entire file before the caller changes any form state. */
export function importCustomerWorkbook(bytes:Uint8Array|ArrayBuffer,request:PublicSpecRequest):{answers:Answers;name:string} {
 if(bytes.byteLength>MAX_WORKBOOK_BYTES)throw new Error('Choose an Excel file smaller than 2 MB.');
 let book:XLSX.WorkBook;
 try{book=XLSX.read(bytes,{type:'array',sheetRows:100,cellFormula:true,cellDates:true});}catch{throw new Error('This file could not be read. Upload the downloaded Excel template.');}
 const sheet=book.Sheets['Spec Sheet'];
 if(!sheet)throw new Error('Upload the Excel template downloaded from this request.');
 function value(row:number,col:number):string {
  const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})] as XLSX.CellObject|undefined;
  if(!cell)return '';
  if(cell.f)throw new Error('Replace Excel formulas with values before uploading.');
  if(!['s','n','z'].includes(cell.t))throw new Error('Use text or numeric values in the template.');
  return String(cell.v??'').trim();
 }
 if(value(1,1)!==request.company.trim())throw new Error('This file belongs to a different customer. Download the template from this link.');
 if(headers(request).some((v,i)=>value(FIRST_ROW-1,i)!==v))throw new Error('Keep the template column headings unchanged.');
 const last=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1').e;
 if(last.r>=100||last.c>=headers(request).length)throw new Error('Keep the template rows and columns unchanged.');
 const answers:Answers={},seen=new Set<string>();
 for(let row=FIRST_ROW;row<=last.r;row++){
  if(headers(request).map((_,i)=>i).every(col=>!sheet[XLSX.utils.encode_cell({r:row,c:col})]?.v))continue;
  const parameter=value(row,1),f=request.fields.find(f=>f.parameter===parameter&&f.section===value(row,0));
  if(!f)throw new Error(`Unrecognized field in row ${row+1}. Keep the template rows unchanged.`);
  if(seen.has(parameter))throw new Error(`Duplicate field: ${parameter}.`);
  seen.add(parameter);
  if(value(row,3)!==f.unit||value(row,2)!==f.symbol)throw new Error(`Keep the symbol and unit for ${parameter} unchanged.`);
  if(f.computed)continue;
  if(f.merged&&value(row,5))throw new Error(`Enter one value in the merged cell for ${parameter}.`);
  fieldKeys(f).forEach((col,index)=>{const entered=value(row,4+index);if(entered)answers[`${parameter}:${col}`]=entered.toLowerCase()===UNKNOWN.toLowerCase()?null:entered;});
 }
 if(request.fields.some(f=>!seen.has(f.parameter)))throw new Error('Some template rows are missing. Download a new template and keep all rows.');
 const invalid=validateAnswers(answers,request.fields);if(invalid)throw new Error(invalid);
 const name=value(4,1);if(name.length>120)throw new Error('Keep your name under 120 characters.');
 return {answers,name};
}

export function exportCustomerWorkbook(request:PublicSpecRequest){const data:unknown[][]=Array.from({length:9},()=>[]);data[0]=['Customer requirements'];data[1]=['Customer',request.company];data[2]=['Representative',request.contact];data[4]=['Respondent',request.respondent_name];data[8]=headers(request);for(const field of request.fields)data.push([field.section,field.parameter,field.symbol,field.unit,request.answers[`${field.parameter}:${field.merged?'value':'hot'}`]??'',...(valueColumns(request.fields).length===2?[field.merged?'':request.answers[`${field.parameter}:cold`]??'']:[])]);const sheet=XLSX.utils.aoa_to_sheet(data);sheet['!cols']=[{wch:26},{wch:30},{wch:12},{wch:15},{wch:18},{wch:18}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Spec Sheet');XLSX.writeFile(book,'Customer Requirements.xlsx');}
