'use client';
import {readJson} from '@/lib/http';
import {useEffect,useState} from 'react';
import {Columns3,Settings2,LogOut} from 'lucide-react';
import {CrmWorkspace} from '@/components/crm/CrmWorkspace';
import {CurrentUserProvider} from '@/lib/auth/CurrentUserContext';
import {configureTeam} from '@/lib/mock/team';
import {configureCompany,configureTerms} from '@/lib/config/company';
import {Settings} from './WorkspaceSettings';
import {SpecSchemaSetup} from './SpecSchemaSetup';
import {configureSpecSchema,type SpecSchema} from '@/lib/crm/specSchema';
import {Modal} from '@/components/ds/feedback/Modal';
import {loadRecentRecipients} from '@/lib/recipients';
import type {User} from '@/types/domain';
export default function Workspace(){const [session,setSession]=useState<{specSchema:SpecSchema|null;user:User;org:Record<string,string>|null;members:Record<string,string>[];integrations:{ai:boolean;email:boolean}}|null>(null),[settingsOpen,setSettingsOpen]=useState(false),[error,setError]=useState('');
 async function load(){try{const response=await fetch('/api/session',{cache:'no-store'}),json=await readJson(response);if(!response.ok)throw new Error(json.error);const list=[{id:json.user.id,fullName:json.user.fullName,title:json.user.title,email:json.user.email},...json.members.filter((m:{id:string})=>m.id!==json.user.id).map((m:Record<string,string>)=>({id:m.id,fullName:m.full_name,title:m.title||'',email:m.email||''}))];configureTeam(list);configureSpecSchema(json.specSchema);if(json.org)configureCompany({...json.org,registeredAddress:json.org.registered_address,addressKr:json.org.address_kr,signerName:json.org.signer_name,signerTitle:json.org.signer_title,entityPhrase:json.org.entity_phrase,ndaGoverningLaw:json.org.nda_governing_law});configureTerms(json.org?.quotation_terms||'',json.org?.po_terms||'',json.org?.nda_terms||'');setSession(json as NonNullable<typeof session>);setError('');void loadRecentRecipients();}catch(e){setError(e instanceof Error?e.message:String(e));}}
 useEffect(()=>{void load();},[]);
 if(error)return <main className="signin"><h1>Unable to open CRM Automation</h1><p role="alert">{error}</p><button onClick={()=>void load()}>Try again</button></main>;
 if(!session)return <main className="signin"><p>Opening CRM Automation…</p></main>;
 return <CurrentUserProvider user={session.user}><div className="workspace-shell"><header className="workspace-header"><a className="workspace-brand" href="/" aria-label="CRM Automation CRM workspace"><Columns3 size={18}/><strong>CRM Automation</strong><span>Private workspace</span></a><div className="workspace-actions"><button onClick={()=>setSettingsOpen(true)}><Settings2 size={14}/>CRM settings</button><a href="/signout-with-chatgpt?return_to=/" aria-label="Sign out"><LogOut size={14}/></a></div></header><section className="workspace-main">{session.specSchema?<CrmWorkspace/>:<div className="setup-page settings-content"><SpecSchemaSetup initial={null} onSaved={load}/></div>}</section><Modal open={settingsOpen} onClose={()=>setSettingsOpen(false)} title="CRM settings" size="lg"><Settings session={session} onSaved={load}/></Modal></div></CurrentUserProvider>;
}
