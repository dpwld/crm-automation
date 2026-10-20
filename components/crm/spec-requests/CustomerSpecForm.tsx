'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ArrowLeft, Download, HelpCircle, Save, Send, Upload, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ds/core/Button';
import { Input } from '@/components/ds/forms/Input';
import {valueColumns} from '@/lib/crm/specSchema';
import { SPEC_ATTACHMENT_ACCEPT } from '@/lib/crm/spec-requests/attachments';
import { fieldKeys, validateAnswers, sameAnswers, displayedSubmission, type Answers, type PublicSpecRequest, type SpecField, type SpecAttachment } from '@/lib/crm/spec-requests/model';
import { SpecNoteEditor, SpecNoteView } from './SpecNote';
import './spec-requests.css';

export function CustomerSpecForm({request,onSave,onSubmit,onAttach,onRemove,onDownload,preview=false}:{request:PublicSpecRequest;onSave?:(answers:Answers,name:string,note:string)=>Promise<void>;onSubmit?:(answers:Answers,name:string,note:string)=>Promise<void>;onAttach?:(file:File)=>Promise<void>;onRemove?:(id:string)=>Promise<void>;onDownload?:(file:SpecAttachment)=>Promise<void>;preview?:boolean}){
 const [answers,setAnswers]=useState<Answers>(request.answers),[name,setName]=useState(request.respondent_name),[note,setNote]=useState(request.note||''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[fileNotice,setFileNotice]=useState(''),[noteError,setNoteError]=useState('');
 const fileInput=useRef<HTMLInputElement>(null),attachmentInput=useRef<HTMLInputElement>(null);
 const submitted=['submitted','reviewed'].includes(request.status),readOnly=submitted||review;
 const display=displayedSubmission(request,answers,name);
 const displayedNote=submitted?(request.note||''):note;
 const dirty=!!noteError||!sameAnswers(answers,request.answers)||name.trim()!==request.respondent_name.trim()||note.trim()!==(request.note||'').trim();
 useEffect(()=>{if(!dirty||submitted||preview)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty,submitted,preview]);
 async function act(submit:boolean){setError('');const invalid=noteError||validateAnswers(answers,request.fields);if(invalid){setError(invalid);return;}if(submit&&!name.trim()){setError('Enter your name.');return;}setBusy(true);try{if(submit)await onSubmit?.(answers,name,note);else{await onSave?.(answers,name,note);setSaved(true);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function download(){const {exportCustomerWorkbook}=await import('@/lib/crm/spec-requests/workbook');exportCustomerWorkbook(request);}
 async function upload(file:File){
  setError('');setFileNotice('');setBusy(true);
  try{
   if(!/\.xlsx$/i.test(file.name))throw new Error('Upload the .xlsx template downloaded from this page.');
   if(file.size>2*1024*1024)throw new Error('Choose an Excel file smaller than 2 MB.');
   const {importCustomerWorkbook}=await import('@/lib/crm/spec-requests/workbook');
   const imported=importCustomerWorkbook(await file.arrayBuffer(),request);
   setAnswers(current=>({...current,...imported.answers}));if(imported.name)setName(imported.name);
   setSaved(false);setFileNotice(`Imported ${Object.keys(imported.answers).length} values. Check the table, then save or submit. Blank cells in the file leave your current entries unchanged.`);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function update(key:string,value:string|null){setAnswers(a=>({...a,[key]:value}));setSaved(false);}
 async function attachmentAction(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const visibleFields=request.fields.filter(f=>!f.computed);
 const sections=Array.from(new Set(visibleFields.map(f=>f.section)));
 function cell(f:SpecField,col:string){
  const key=`${f.parameter}:${col}`,unknown=display.answers[key]===null;
  return <td key={key} colSpan={f.merged?valueColumns(request.fields).length:1} className={f.computed?'sr-computed':undefined}>
   {readOnly?<div className="sr-grid-value">{unknown?'Not known yet':display.answers[key]?.trim()||'—'}</div>:<div className="sr-grid-input-wrap">
    <input aria-label={`${f.parameter} ${col==='value'?'value':f.columnLabels[col==='hot'?0:1]}`} value={answers[key]??''} disabled={busy||unknown} maxLength={160} inputMode={f.isText?'text':'decimal'} placeholder={unknown?'Not known yet':'—'} onChange={e=>update(key,e.target.value)}/>
    <button type="button" className="sr-unknown-toggle" title="Not known yet" aria-label={`${f.parameter} ${col}: not known yet`} aria-pressed={unknown} disabled={busy} onClick={()=>update(key,unknown?'':null)}><HelpCircle size={14}/></button>
   </div>}
  </td>;
 }
 return <div className="sr-form">
  <header className="sr-customer-heading"><span className="sr-eyebrow">CUSTOMER REQUIREMENTS</span><h1>{submitted?'Thank you. We have your requirements.':review?'Review your requirements':'Share your project requirements'}</h1><p>{submitted?'Your Workspace representative will review your submission and follow up with you.':review?'Check the values below, then submit them to your Workspace representative.':'Fill in the table, or download the Excel template, complete it, and upload it here.'}</p></header>
  <div className="sr-project"><div><span>Customer</span><strong>{request.company}</strong></div><div><span>Workspace contact</span><strong>{request.contact}</strong></div>{request.due_date&&<div><span>Requested by</span><strong>{request.due_date}</strong></div>}</div>
  {submitted&&<div className="sr-success" role="status"><CheckCircle2 size={20}/><span>Received {request.submitted_at?new Date(request.submitted_at).toLocaleString('en-US'):''}. To make changes, contact your Workspace representative.</span></div>}
  <div className="sr-sheet-toolbar"><label className="sr-name">Your name<Input value={display.name} maxLength={120} disabled={readOnly||busy} autoComplete="name" placeholder="Full name" onChange={e=>{setName(e.target.value);setSaved(false);}}/></label><div className="sr-row-actions"><Button size="sm" variant="secondary" disabled={busy} leftIcon={<Download size={14}/>} onClick={()=>void download()}>Download Excel</Button>{!readOnly&&<Button size="sm" variant="secondary" disabled={busy||preview} leftIcon={<Upload size={14}/>} onClick={()=>fileInput.current?.click()}>Upload Excel</Button>}</div></div>
  <input ref={fileInput} type="file" accept=".xlsx" aria-label="Upload completed Excel template" hidden disabled={busy||readOnly||preview} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/>
  {!readOnly&&<p className="sr-grid-help">Use Tab to move through the table. All spec values are optional. Leave them blank, or select <HelpCircle size={13}/> for “Not known yet”.</p>}
  <p className="sr-grid-help">If this format is inconvenient, you can reply with an Excel file. Attach it below or email it to your Workspace representative.</p>
  {fileNotice&&!readOnly&&<div className="sr-success" role="status">{fileNotice}</div>}
  {error&&<div className="sr-error" role="alert">{error}</div>}
  <div className="sr-sheet-scroll" role="region" aria-label="Customer spec sheet" tabIndex={0}><table className="sr-sheet"><thead><tr><th scope="col">Table</th><th scope="col">Parameter</th><th scope="col">Symbol</th><th scope="col">Units</th>{valueColumns(request.fields).map(c=><th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{sections.flatMap(section=>visibleFields.filter(f=>f.section===section).map((f,idx,fields)=><tr key={f.parameter}>
   {idx===0&&<th className="sr-sheet-section" scope="rowgroup" rowSpan={fields.length}>{section}</th>}<th className="sr-sheet-parameter" scope="row">{f.parameter}</th><td className="sr-sheet-symbol">{f.symbol}</td><td className="sr-sheet-unit">{f.unit}</td>{fieldKeys(f).map(col=>cell(f,col))}
  </tr>))}</tbody></table></div>
  <section className="sr-supplement" aria-label="Notes and attachments">
   <div className="sr-note"><strong>Note</strong>{readOnly?<SpecNoteView value={displayedNote}/>:<><SpecNoteEditor value={note} disabled={busy} onChange={value=>{setNote(value);setSaved(false);}} onError={setNoteError}/>{noteError&&<p className="sr-error" role="alert">{noteError}</p>}</>}</div>
   <div className="sr-attachments"><div className="sr-attachments-heading"><strong>Attachments</strong>{!readOnly&&<Button size="sm" variant="secondary" disabled={busy||preview||!onAttach||(request.attachments?.length||0)>=5} leftIcon={<Paperclip size={14}/>} onClick={()=>attachmentInput.current?.click()}>Attach file</Button>}</div>
    {!readOnly&&<p className="sr-muted">Excel, CSV, PDF, Word, PNG, JPG, or text · Up to 5 files, 2 MB each. Files are saved when uploaded.</p>}
    <input ref={attachmentInput} type="file" accept={SPEC_ATTACHMENT_ACCEPT} aria-label="Attach requirements file" hidden disabled={busy||readOnly||preview} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&onAttach)void attachmentAction(()=>onAttach(file));}}/>
    {(request.attachments||[]).map(file=><div className="sr-attachment" key={file.id}><span>{file.name}<small>{Math.ceil(file.size/1024)} KB</small></span><Button size="sm" variant="ghost" disabled={busy||!onDownload} leftIcon={<Download size={14}/>} aria-label={`Download ${file.name}`} onClick={()=>onDownload&&void attachmentAction(()=>onDownload(file))}>Download</Button>{!readOnly&&<Button size="sm" variant="ghost" disabled={busy||!onRemove} leftIcon={<Trash2 size={14}/>} aria-label={`Remove ${file.name}`} onClick={()=>onRemove&&void attachmentAction(()=>onRemove(file.id))}>Remove</Button>}</div>)}
    {!request.attachments?.length&&<p className="sr-muted">No attachments.</p>}
   </div>
  </section>
  {!submitted&&<footer className="sr-form-footer"><span aria-live="polite">{preview?'Preview only':saved&&!dirty?'Progress saved':dirty?'Unsaved changes':'Save a draft to return later.'}</span>{review?<><Button variant="secondary" disabled={busy} leftIcon={<ArrowLeft size={15}/>} onClick={()=>setReview(false)}>Back to edit</Button><Button disabled={preview} loading={busy} leftIcon={<Send size={15}/>} onClick={()=>void act(true)}>Submit requirements</Button></>:<><Button variant="secondary" disabled={preview} loading={busy} leftIcon={<Save size={15}/>} onClick={()=>void act(false)}>Save draft</Button><Button disabled={busy} onClick={()=>{const invalid=noteError||validateAnswers(answers,request.fields);setError(invalid||'');if(!invalid)setReview(true);}}>Review &amp; submit</Button></>}</footer>}
 </div>;
}
