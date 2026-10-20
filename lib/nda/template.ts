import { COMPANY, COMPANY_REGISTERED_ADDRESS, ORGANISATION_ENTITY, NDA_TERMS } from '@/lib/config/company';

export interface NdaFields {
  partyBName: string;
  partyBEntity: string;
  partyBAddress: string;
  purpose: string;
}
export type NdaKind = "company" | "individual";
export interface NdaOrganisation { name: string; party: string; terms: string }
export const NDA_TITLE = "NONDISCLOSURE AGREEMENT";
export const NDA_TERMS_REQUIRED = "Save your own NDA agreement terms in Settings before requesting a signature.";

export function validateNdaTerms(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return NDA_TERMS_REQUIRED;
  if (value.length > 50_000) return 'Keep NDA agreement terms within 50,000 characters.';
  return null;
}

export function currentNdaOrganisation(): NdaOrganisation {
  return {
    name: COMPANY.name,
    party: [COMPANY.name, ORGANISATION_ENTITY, COMPANY_REGISTERED_ADDRESS || COMPANY.address].filter(Boolean).join(', '),
    terms: NDA_TERMS,
  };
}

export function ndaDetails(f: NdaFields, kind: NdaKind, organisation: NdaOrganisation): [string, string][] {
  return [
    ['Organisation', organisation.party || organisation.name],
    ['Counterparty', f.partyBName],
    ...(kind === 'company' ? [['Entity', f.partyBEntity] as [string, string]] : []),
    ['Address', f.partyBAddress],
    ['Purpose', f.purpose],
  ];
}

export function ndaAgreementText(f: NdaFields, kind: NdaKind = 'company', organisation = currentNdaOrganisation()): string {
  const invalid = validateNdaTerms(organisation.terms);
  if (invalid) throw new Error(invalid);
  return [NDA_TITLE, ...ndaDetails(f, kind, organisation).map(([label, value]) => `${label}: ${value}`), organisation.terms].join('\n\n');
}
