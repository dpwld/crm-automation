
export let ORGANISATION_ENTITY="";
export let NDA_GOVERNING_LAW="";
export const COMPANY={name:"",address:"",web:"",email:"",phone:""};
export let COMPANY_REGISTERED_ADDRESS="";
export const CEO_SIGNER={name:"",title:""};
export let DEFAULT_SHIP_TO="";
export let DEFAULT_SHIP_TO_KR="";
export const KR_LUNCH_MEMBER_KEYS:readonly string[]=[];
export function configureCompany(value:{name:string;address:string;web:string;email:string;phone:string;registeredAddress?:string;addressKr?:string;signerName?:string;signerTitle?:string;entityPhrase?:string;ndaGoverningLaw?:string}) {Object.assign(COMPANY,{name:value.name,address:value.address,web:value.web,email:value.email,phone:value.phone});COMPANY_REGISTERED_ADDRESS=value.registeredAddress||"";DEFAULT_SHIP_TO=value.address;DEFAULT_SHIP_TO_KR=value.addressKr||"";CEO_SIGNER.name=value.signerName||"";CEO_SIGNER.title=value.signerTitle||"";ORGANISATION_ENTITY=value.entityPhrase||"";NDA_GOVERNING_LAW=value.ndaGoverningLaw||"";}

export let QUOTATION_TERMS="";
export let PURCHASE_ORDER_TERMS="";
export let NDA_TERMS="";
export function configureTerms(quotation:string,purchaseOrder:string,nda=""){QUOTATION_TERMS=quotation;PURCHASE_ORDER_TERMS=purchaseOrder;NDA_TERMS=nda;}
