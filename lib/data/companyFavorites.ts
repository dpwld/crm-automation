import { createClient } from '@/lib/supabase/client';
export async function fetchCompanyFavorites():Promise<string[]>{
 const {data,error}=await createClient().rpc<string[]>('crm_company_favorites');
 if(error)throw error;return data||[];
}
export async function setCompanyFavorite(companyId:string,favorite:boolean):Promise<void>{
 const {error}=await createClient().rpc('crm_company_favorite_set',{p_company:companyId,p_favorite:favorite});
 if(error)throw error;
}
