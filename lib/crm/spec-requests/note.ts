// A versioned, compact block tree keeps public notes separate from legacy plain text.
// Only these tags and bounded layout attributes can ever become HTML.
const PREFIX='WORKSPACE_NOTE_V1:';
const TAGS=new Set(['p','div','span','h1','h2','h3','ul','ol','li','blockquote','pre','br','hr','b','strong','i','em','u','s','strike','table','tbody','thead','tr','th','td','input']);
const DROP=new Set(['script','style','iframe','object','embed','svg','math','img','video','audio']);
type NoteAttributes={checked?:boolean;indent?:number;width?:number};
export type NoteNode=string|[string,NoteNode[],NoteAttributes?];
export const SPEC_NOTE_LIMIT=5000;
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function cleanNodes(value:unknown,depth=0):NoteNode[]{
 if(!Array.isArray(value)||depth>24)return [];
 return value.slice(0,1000).flatMap((item):NoteNode[]=>{
  if(typeof item==='string')return [item];
  if(!Array.isArray(item)||typeof item[0]!=='string')return [];
  const tag=item[0].toLowerCase();if(DROP.has(tag))return [];
  const children=cleanNodes(item[1],depth+1);if(!TAGS.has(tag))return children;
  const raw=item[2],attrs:NoteAttributes={};
  if(raw&&typeof raw==='object'){
   if(tag==='input'&&raw.checked===true)attrs.checked=true;
   if(tag==='div'&&Number.isInteger(raw.indent)&&raw.indent>0&&raw.indent<=96)attrs.indent=raw.indent;
   if(['td','th'].includes(tag)&&Number.isInteger(raw.width)&&raw.width>=36&&raw.width<=1200)attrs.width=raw.width;
  }
  return [Object.keys(attrs).length?[tag,children,attrs]:[tag,children]];
 });
}
function richNodes(note:string):NoteNode[]|null {
 if(!note.startsWith(PREFIX))return null;
 try{const value:unknown=JSON.parse(note.slice(PREFIX.length));return Array.isArray(value)?cleanNodes(value):null;}catch{return null;}
}
function hasContent(nodes:NoteNode[]):boolean{return nodes.some(node=>typeof node==='string'?!!node.trim():['hr','table','input'].includes(node[0])||hasContent(node[1]));}
function limit(note:string){if(note.length>SPEC_NOTE_LIMIT)throw new Error('Keep the note under 5,000 characters, including formatting.');return note;}
export function formatSpecNote(nodes:unknown):string {const clean=cleanNodes(nodes);return limit(hasContent(clean)?PREFIX+JSON.stringify(clean):'');}
export function normalizeSpecNote(note:string):string {limit(note);const nodes=richNodes(note);return nodes===null?note:formatSpecNote(nodes);}


export function specNoteHtml(note:string,readOnly=false):string {
 const nodes=richNodes(note);if(nodes===null)return escape(note).replace(/\r?\n/g,'<br>');
 function html(node:NoteNode):string {
  if(typeof node==='string')return escape(node);
  const [tag,children,attrs]=node;
  if(tag==='input')return `<input type="checkbox"${attrs?.checked?' checked':''}${readOnly?' disabled':''}>`;
  if(tag==='br'||tag==='hr')return `<${tag}>`;
  const style=attrs?.indent?` style="margin-left:${attrs.indent}px"`:attrs?.width?` style="width:${attrs.width}px"`:'';
  return `<${tag}${style}>${children.map(html).join('')}</${tag}>`;
 }
 return nodes.map(html).join('');
}


export function specNoteFromHtml(html:string):string {
 const root=new DOMParser().parseFromString(html,'text/html').body;
 function nodes(parent:Node):NoteNode[]{return Array.from(parent.childNodes).flatMap((node):NoteNode[]=>{
  if(node.nodeType===3)return [node.textContent||''];
  if(node.nodeType!==1)return [];
  const el=node as HTMLElement,tag=el.tagName.toLowerCase();
  const attrs:NoteAttributes={};
  if(tag==='input'&&(el as HTMLInputElement).checked)attrs.checked=true;
  const indent=parseInt(el.style.marginLeft,10),width=parseInt(el.style.width,10);
  if(indent)attrs.indent=indent;if(width)attrs.width=width;
  return [[tag,nodes(node),attrs]];
 });}
 return formatSpecNote(nodes(root));
}
