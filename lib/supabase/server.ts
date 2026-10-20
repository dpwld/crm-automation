import {identity} from '@/lib/server/auth';
import {execute} from '@/lib/server/store';
export async function createClient(){
 const user=await identity();
 return { from:(table:string)=>({ select:async(_projection?:string)=>{
  try {const result=await execute(user.userId,{table,action:'select',filters:[],orders:[]});return {data:result.data as import('./client').Row[],error:null};}
  catch(error){return {data:null,error:{message:String(error)}};}
 }})};
}
