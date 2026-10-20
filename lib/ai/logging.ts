import {identity} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
export async function logAiCall(value:{tool:string;model:string;input:unknown;output:unknown}){const user=await identity();return audit(user.userId,value.tool,'completed',`Model: ${value.model}; draft returned for human review.`);}
