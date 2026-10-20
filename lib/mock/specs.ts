import type { Company } from '@/types/domain';
import { currentSpecSchema, schemaSections } from '@/lib/crm/specSchema';
export function specsForCompany(_company: Company) { return schemaSections(currentSpecSchema()); }
