import {pathToFileURL} from 'node:url';

export function localOrigin(input) {
  const url=new URL(input);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='4323'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('README fixtures require the native loopback preview at http://127.0.0.1:4323 only.');
  return url.origin;
}
const prefix='readme-crm--';
const id=name=>prefix+name;
export function fixtureRecords(){
 const names=['Lumen Vale Labs','Northline Supply','Meridian Loop','Aster Fieldworks','Cedar Array','Pebble Harbor','Morrow Systems','Quiet Peak'];
 const codes=['LUM','NOR','MER','AST','CED','PEB','MOR','QUI'];
 const stages=['lead','in_review','in_review','spec','quoted','won','won','won'];
 const statuses=['spec','quoting','customer_po','invoiced','closed'];
 const directory=[{id:id('owner'),full_name:'Rowan Vale',title:'Account lead · fictional example',email:'rowan@example.invalid'}];
 const companies=names.map((name,i)=>({id:id(`company-${i}`),ref:`README-${i+1}`,party_code:codes[i],name,sector:i%2?'Industrial':'Energy',stage:stages[i],importance:i===3?'high':i%2?'med':'low',value:[18000,26000,42000,56000,74000,38000,92000,48000][i],progress:[5,15,25,40,55,70,85,100][i],owner_key:id('owner'),contact:`${['Avery','Jordan','Casey','Morgan','Taylor','Riley','Jamie','Skyler'][i]} · fictional contact`,address:'Fictional screenshot record',nda_status:i===2?'in_review':'none'}));
 const contacts=companies.map((c,i)=>({id:id(`contact-${i}`),company_id:c.id,name:['Avery Reed','Jordan Moss','Casey Brook','Morgan Lake','Taylor Fern','Riley Stone','Jamie Birch','Skyler Pine'][i],title:'Project engineer',email:`contact-${i}@example.invalid`,category:'customer',space:'crm'}));
 const deals=statuses.map((status,i)=>({id:id(`deal-${i}`),company_id:companies[i+3].id,deal_no:`${codes[i+3]}-D-2026-00${i+1}`,title:['Custom project study','Pilot delivery','Prototype evaluation batch','Qualification delivery','Project validation'][i],kind:'new',status,owner_key:id('owner'),notes:'Fictional local README screenshot opportunity; no external activity.'}));
 const specBuilds=[{id:id('spec-build'),company_id:companies[3].id,deal_id:deals[0].id,build_no:1,name:'Custom project requirements'}];
 const columns=['Requested','Confirmed'];
 const fields=[
  {section:'Delivery',parameter:'Batch quantity',symbol:'',unit:'items',merged:false,isText:false,computed:false,columnLabels:columns},
  {section:'Delivery',parameter:'Package label',symbol:'',unit:'',merged:true,isText:true,computed:false,columnLabels:columns},
  {section:'Quality',parameter:'Review interval',symbol:'',unit:'days',merged:false,isText:false,computed:false,columnLabels:columns},
 ];
 const settings=[{id:id('schema'),key:'spec_schema',value:{name:'Example project requirements',columns,fields}}];
 const specVersions=[{id:id('spec-version'),build_id:id('spec-build'),label:'Customer initial request',is_final:false,sort:0,rows:fields.map((f,i)=>({...f,confidential:false,value:i===1?'Sample batch':'',valueHot:i===0?'24':i===2?'14':'',valueCold:i===0?'24':i===2?'7':'',sort:i}))}];
 const registryParts=[{id:id('registry-part'),serial:20261020001,part_code:'README-PART-001',customer:companies[3].name,internal_label:'Custom item · fictional example',descriptor:'Fictional project deliverable',notes:'Local README example only',status:'registered',adopted:false}];
 const dealParts=[{id:id('deal-part'),deal_id:deals[0].id,part_id:id('registry-part'),role:'prototype'}];
 const activities=companies.map((c,i)=>({id:id(`activity-${i}`),company_id:c.id,type:'note',context:i<3?'targeting':'spec',summary:['Research customer project fit','Arrange introductory engineering call','Review proposed NDA terms','Confirm delivery requirements','Prepare pilot quotation','Record customer purchase order','Review invoice checklist','Archive completed evaluation'][i],actor_key:'local_seedy'}));
 const logs=[{id:id('contact-log'),contact_id:contacts[1].id,kind:'call',body:'Fictional introductory call: discuss delivery requirements and next review.',log_date:'2026-10-20',space:'crm',step:'first_contact',author_key:'local_seedy'}];
 const specs=[{id:id('spec'),company_id:companies[3].id,section:'Delivery',parameter:'Batch quantity',symbol:'',unit:'items',column_labels:columns,merged:false,value_hot:'24',value_cold:'24',sort:0}];
 const documents=deals.slice(1).map((d,i)=>({id:id(`document-${i}`),company_id:d.company_id,deal_id:d.id,doc_no:`README-${['QT','PO','INV','INV'][i]}-2026-001`,doc_type:['quotation','purchase_order','invoice','invoice'][i],currency:'USD',status:'draft',issue_date:'2026-10-20',memo:'Fictional local screenshot record. Not issued or sent.',line_items:[{name:'Custom project deliverable',qty:[2,3,4,2][i],unit_price:[7400,3800,9200,4800][i],amount:0}],discount_pct:0,tax_rate:0}));
 const followups=[{id:id('followup'),company_id:companies[1].id,title:'Confirm technical review slot · fictional example',due_date:'2026-10-25',owner_key:id('owner'),done:false}];
 return [['app_settings',settings],['profiles',directory],['companies',companies],['customer_contacts',contacts],['deals',deals],['spec_builds',specBuilds],['spec_versions',specVersions],['registry_parts',registryParts],['deal_parts',dealParts],['activities',activities],['contact_logs',logs],['company_specs',specs],['company_documents',documents],['crm_followups',followups]];
}
async function run(){
 const [mode,input='http://127.0.0.1:4323']=process.argv.slice(2);
 if(!['seed','cleanup'].includes(mode))throw new Error('Usage: node scripts/readme-fixtures.mjs seed|cleanup [http://127.0.0.1:4323]');
 const origin=localOrigin(input);
 const login=await fetch(`${origin}/signin-with-chatgpt?return_to=/`,{redirect:'manual'});
 const cookie=login.headers.get('set-cookie')?.match(/__sites_local_auth=1/)?.[0];
 if(!cookie)throw new Error('Native loopback development sign-in was not confirmed. No records changed.');
 async function query(table,action,values,ids){const response=await fetch(`${origin}/api/crm/data`,{method:'POST',headers:{'Content-Type':'application/json',cookie,origin},body:JSON.stringify({table,action,values,filters:ids?[{field:'id',op:'in',value:ids}]:[],orders:[]})});const json=await response.json();if(!response.ok)throw new Error(json.error||`HTTP ${response.status}`);return json.data;}
 const manifest=fixtureRecords();
 if(mode==='cleanup'){
  // Delete only exact manifest IDs. Check that no real record became linked to fixtures.
  const all=await Promise.all(manifest.map(async([table,records])=>[table,await query(table,'select'),new Set(records.map(r=>r.id))]));
  const fixtureIds=new Set(manifest.flatMap(([,records])=>records.map(r=>r.id)));
  for(const [table,records,ownedIds] of all)for(const row of records)if(!ownedIds.has(row.id)&&Object.values(row).some(value=>typeof value==='string'&&fixtureIds.has(value)))throw new Error(`A non-fixture ${table} record references a fixture. Unlink it before cleanup.`);
  // Server cascades can affect any table: inspect all CRM record tables before deletion.
  const {readFile}=await import('node:fs/promises');
  const fields=JSON.parse(await readFile(new URL('../lib/server/entity-fields.json',import.meta.url),'utf8'));
  for(const table of Object.keys(fields)){
   if(['doc_counters','spec_requests','nda_requests','vendor_sites'].includes(table))continue;
   const records=await query(table,'select');
   for(const row of records)if(!fixtureIds.has(row.id)&&Object.values(row).some(value=>typeof value==='string'&&fixtureIds.has(value)))throw new Error(`Non-fixture ${table} links to a fixture. Unlink before cleanup.`);
  }
  for(const [table,records] of [...manifest].reverse())await query(table,'delete',undefined,records.map(r=>r.id));
  console.log('Removed exact local README fixture IDs. Other records preserved.');return;
 }
 // Preflight the entire manifest; inserts only, never upserts or overwrites.
 for(const [table,records] of manifest){const existing=await query(table,'select',undefined,records.map(r=>r.id));if(existing.length)throw new Error(`Fixture namespace already exists in ${table}. No records changed. Run cleanup first.`);}
 const existingSettings=await query('app_settings','select');if(existingSettings.some(r=>r.key==='spec_schema'))throw new Error('A specification schema already exists. Use a separate local preview database for README fixtures.');
 const inserted=[];
 try{for(const [table,records] of manifest){await query(table,'insert',records);inserted.push([table,records]);}}
 catch(error){for(const [table,records] of inserted.reverse())await query(table,'delete',undefined,records.map(r=>r.id));throw error;}
 console.log('Created fictional README examples in local preview only: 8 companies, 5 deals, 8 contacts, activity, spec, documents and follow-up. No email or AI calls.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(error=>{console.error(error.message);process.exitCode=1;});
