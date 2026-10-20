'use client';
import { MemoEditor } from '@/components/pm/MemoEditor';
import { specNoteFromHtml, specNoteHtml } from '@/lib/crm/spec-requests/note';

export function SpecNoteEditor({value,onChange,onError,disabled}:{value:string;onChange:(note:string)=>void;onError:(error:string)=>void;disabled:boolean}){
 function update(html:string){
  try{
   const next=specNoteFromHtml(html);onError('');
   // Focusing an old plain-text note must not turn it into an unsaved rich draft.
   if(next!==specNoteFromHtml(specNoteHtml(value)))onChange(next);
  }catch(error){onError((error as Error).message);}
 }
 return <div className="sr-note-editor"><MemoEditor value={specNoteHtml(value)} onSave={update} onChange={update} publicMode disabled={disabled} label="Note"/></div>;
}

export function SpecNoteView({value}:{value:string}){
 return <div className="sr-note-value sx-memo sx-memo--view" dangerouslySetInnerHTML={{__html:specNoteHtml(value,true)||'—'}}/>;
}
