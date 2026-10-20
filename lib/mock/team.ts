
export interface TeamMember { id:string; fullName:string; title:string; email?:string; hidden?:boolean; departed?:boolean; }
export const TEAM:Record<string,TeamMember>={};
export const TEAM_MEMBERS:TeamMember[]=[];
export const CRM_OWNERS:string[]=[];
export const ASSIGNABLE_OWNERS:string[]=[];
export const MEMBER_EMAIL:Record<string,string>={};
export function memberName(id:string):string {return TEAM[id]?.fullName||id||"Unassigned";}
export function memberKeyForEmail(email:string):string|null {return TEAM_MEMBERS.find(m=>m.email?.toLowerCase()===email.toLowerCase())?.id||null;}
export function configureTeam(members:TeamMember[]) {for(const key of Object.keys(TEAM))delete TEAM[key];for(const key of Object.keys(MEMBER_EMAIL))delete MEMBER_EMAIL[key];TEAM_MEMBERS.splice(0,TEAM_MEMBERS.length,...members);CRM_OWNERS.splice(0);ASSIGNABLE_OWNERS.splice(0);for(const m of members){TEAM[m.id]=m;if(m.email)MEMBER_EMAIL[m.id]=m.email;CRM_OWNERS.push(m.id);ASSIGNABLE_OWNERS.push(m.id);}}
