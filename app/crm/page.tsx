import {requireChatGPTUser} from '@/app/chatgpt-auth';
import Workspace from '@/components/Workspace';
export default async function Page(){await requireChatGPTUser('/crm');return <Workspace/>;}
