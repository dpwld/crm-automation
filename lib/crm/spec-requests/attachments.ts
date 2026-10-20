export const MAX_SPEC_ATTACHMENT_BYTES=2*1024*1024;
export const SPEC_ATTACHMENT_ACCEPT='.xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.docx,.txt';
const types:Record<string,string>={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',csv:'text/csv',pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'};
export function validateSpecAttachment(name:string,bytes:Uint8Array){
 if(!name.trim()||name.length>200||/[\x00-\x1f\x7f/\\]/.test(name))throw new Error('Choose a file with a valid name.');
 if(!bytes.length||bytes.length>MAX_SPEC_ATTACHMENT_BYTES)throw new Error('Choose a non-empty file up to 2 MB.');
 const ext=name.split('.').at(-1)?.toLowerCase()||'',contentType=types[ext];
 if(!contentType)throw new Error('This file type is not supported. Use Excel, CSV, PDF, Word, an image, or text.');
 const starts=(prefix:number[])=>prefix.every((n,i)=>bytes[i]===n);
 const valid=ext==='pdf'?starts([37,80,68,70,45]):ext==='png'?starts([137,80,78,71,13,10,26,10]):['jpg','jpeg'].includes(ext)?starts([255,216,255]):ext==='xls'?starts([208,207,17,224,161,177,26,225]):['xlsx','docx'].includes(ext)?starts([80,75,3,4]):true;
 if(!valid)throw new Error('The file contents do not match its extension.');
 if(['txt','csv'].includes(ext)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(bytes.includes(0))throw new Error();}catch{throw new Error('Upload a UTF-8 text or CSV file.');}}
 return {name:name.trim(),contentType};
}


export async function readSpecAttachmentForm(request:Request):Promise<FormData>{
 const limit=MAX_SPEC_ATTACHMENT_BYTES+16384,reader=request.body?.getReader();
 if(!reader)throw new Error('Choose a file to attach.');
 const bytes=new Uint8Array(limit);let size=0;
 try{
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
   if(size>limit){await reader.cancel();throw new Error('Choose a file up to 2 MB.');}
   bytes.set(chunk.value,size-chunk.value.byteLength);
  }
 }finally{reader.releaseLock();}
 return new Response(bytes.subarray(0,size),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
