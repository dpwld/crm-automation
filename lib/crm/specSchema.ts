import type { SpecSheetSection } from '@/components/ds/sheets/SpecSheet';

export interface SpecField {
  section: string;
  parameter: string;
  symbol: string;
  unit: string;
  merged: boolean;
  isText: boolean;
  computed: boolean;
  columnLabels: string[];
}
export interface SpecSchema { name: string; columns: string[]; fields: SpecField[] }
export const SPEC_SCHEMA_KEY = 'spec_schema';

export function validateSpecSchema(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Enter a specification schema.';
  const schema = value as SpecSchema;
  const label = (v: unknown, max = 80): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !['__proto__','constructor','prototype'].includes(v.trim()) && !/[\u0000-\u001f:]/.test(v);
  if (!label(schema.name)) return 'Enter a schema name (up to 80 characters).';
  if (!Array.isArray(schema.columns) || schema.columns.length < 1 || schema.columns.length > 2 || schema.columns.some(c => !label(c, 40)) || new Set(schema.columns.map(c => c.trim().toLowerCase())).size !== schema.columns.length) return 'Enter one or two distinct value column labels (up to 40 characters each).';
  if (!Array.isArray(schema.fields) || !schema.fields.length || schema.fields.length > 80) return 'Add between 1 and 80 fields.';
  const seen = new Set<string>();
  for (const field of schema.fields) {
    if (!field || !label(field.section) || !label(field.parameter)) return 'Every field needs a section and label (up to 80 characters; no colons).';
    const key = field.parameter.trim().toLowerCase();
    if (seen.has(key)) return 'Field labels must be unique within a schema.';
    seen.add(key);
    if (typeof field.unit !== 'string' || field.unit.length > 40 || typeof field.symbol !== 'string' || field.symbol.length > 20) return 'Keep units under 40 and symbols under 20 characters.';
    if (typeof field.merged !== 'boolean' || typeof field.isText !== 'boolean' || field.computed !== false) return 'Choose a text or numeric field and a supported column layout.';
    if (schema.columns.length === 1 && !field.merged) return 'Fields in a one-column schema must use a single value.';
    if (!Array.isArray(field.columnLabels) || JSON.stringify(field.columnLabels) !== JSON.stringify(schema.columns)) return 'Field columns must match the schema columns.';
  }
  return null;
}

let configuredSchema: SpecSchema | null = null;
export function configureSpecSchema(schema: SpecSchema | null) { configuredSchema = schema; }
export function currentSpecSchema(): SpecSchema {
  if (!configuredSchema) throw new Error('Set up your company specification schema in CRM settings first.');
  return configuredSchema;
}
export function schemaSections(schema: SpecSchema): SpecSheetSection[] {
  const sections: SpecSheetSection[] = [];
  for (const f of schema.fields) {
    let section = sections.find(s => s.name === f.section);
    if (!section) { section = { name: f.section, rows: [] }; sections.push(section); }
    section.rows.push({param:f.parameter,symbol:f.symbol,unit:f.unit,text:f.isText,merged:f.merged,value:'',hot:'',cold:'',columnLabels:[...schema.columns]});
  }
  return sections;
}
export function valueColumns(fields: {columnLabels?: string[]; merged?: boolean}[]) {
  const labels = fields.find(f => f.columnLabels?.length)?.columnLabels || (fields.some(f => !f.merged) ? ['Value 1', 'Value 2'] : ['Value']);
  return labels.map((label,i) => ({key:labels.length === 1 ? 'value' : i === 0 ? 'hot' : 'cold',label}));
}

export function validateSpecRows(value:unknown):string|null {
 if(!Array.isArray(value)||!value.length||value.length>80)return 'A specification needs between 1 and 80 fields.';
 if(value.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return 'Invalid specification field.';
 const fields=value.map(r=>({...r,computed:false,columnLabels:r.columnLabels||['Value 1','Value 2']}));
 const invalid=validateSpecSchema({name:'Saved specification',columns:fields[0].columnLabels,fields});
 if(invalid)return invalid;
 for(const row of value){
  for(const key of row.merged?['value']:['valueHot','valueCold']){
   const cell=row[key];
   if(typeof cell!=='string'||cell.length>160)return 'Keep specification values under 160 characters.';
   if(cell.trim()&&!row.isText&&(!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,2})?$/.test(cell.trim())||!Number.isFinite(Number(cell))))return `Enter a valid number for ${row.parameter}.`;
  }
 }
 return null;
}
