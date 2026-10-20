import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import Workspace from '@/components/Workspace';
export default async function Home(){const user=await getChatGPTUser();if(!user)return <main className="signin"><span className="wordmark">RELAYO / CRM</span><h1>Your customer workspace, in CRM Automation</h1><p>Companies, deals, requirements, documents and follow-ups in one private workspace.</p><a className="signin-button" href={chatGPTSignInPath('/')}>Sign in with ChatGPT</a></main>;return <Workspace/>;}
