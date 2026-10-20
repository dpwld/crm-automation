import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SpecSheet} from '@/components/ds/sheets/SpecSheet';
import {canCountersignNda} from '@/lib/auth/roles';
import type {Company,User} from '@/types/domain';
import * as XLSX from 'xlsx';
import {documentTotals} from '@/lib/data/documents';
import {salesStageOf} from '@/lib/data/deals';
import {validateAnswers,answerRows,changedCells,type PublicSpecRequest} from '@/lib/crm/spec-requests/model';
import {importCustomerWorkbook} from '@/lib/crm/spec-requests/workbook';
import {configureSpecSchema,currentSpecSchema,validateSpecSchema,validateSpecRows,schemaSections,valueColumns,type SpecSchema} from '@/lib/crm/specSchema';
import {specVersionTemplate,versionRowsToSections} from '@/lib/data/specBuilds';
import {specPrintHtml} from '@/lib/export/specSheetExport';
import {configureTerms} from '@/lib/config/company';
import {ndaAgreementText,validateNdaTerms,NDA_TERMS_REQUIRED} from '@/lib/nda/template';
import {docHtml} from '@/lib/nda/document';
const columns=['Requested','Confirmed'];
const schema:SpecSchema={name:'Project requirements',columns,fields:[
 {section:'Delivery',parameter:'Batch quantity',symbol:'',unit:'items',merged:false,isText:false,computed:false,columnLabels:columns},
 {section:'Delivery',parameter:'Label',symbol:'',unit:'',merged:true,isText:true,computed:false,columnLabels:columns},
]};
assert.equal(validateSpecSchema(schema),null);
for(const bad of [{...schema,fields:[]},{...schema,columns:['Same','Same']},{...schema,fields:[...schema.fields,schema.fields[0]]},{...schema,fields:[{...schema.fields[0],computed:true}]},{...schema,fields:[{...schema.fields[0],parameter:'bad:key'}]},{...schema,fields:[{...schema.fields[0],columnLabels:['Other']}]}])assert.ok(validateSpecSchema(bad));
assert.equal(validateSpecSchema({...schema,fields:[{...schema.fields[0],parameter:'User label <&>'}]}),null);
configureSpecSchema(null);assert.throws(()=>currentSpecSchema(),/Set up/);configureSpecSchema(schema);
const snapshot=specVersionTemplate();assert.deepEqual(snapshot[0].columnLabels,columns);assert.equal(validateSpecRows(snapshot),null);
configureSpecSchema({...schema,columns:['New labels'],fields:[{...schema.fields[1],columnLabels:['New labels']}]});assert.deepEqual(snapshot[0].columnLabels,columns);
assert.deepEqual(valueColumns(versionRowsToSections(snapshot).flatMap(s=>s.rows)).map(c=>c.label),columns);
assert.equal(validateSpecRows([{...snapshot[0],valueHot:'NaN'}]),'Enter a valid number for Batch quantity.');
assert.equal(validateAnswers({'Batch quantity:hot':'NaN'},schema.fields),'Enter a valid number for Batch quantity.');assert.equal(validateAnswers({'unknown:value':'1'},schema.fields),'Unknown field.');assert.equal(validateAnswers({'Batch quantity:hot':null},schema.fields),null);
const answered=answerRows({'Batch quantity:hot':'12','Label:value':'Customer text'},schema.fields);assert.equal(answered[0].valueHot,'12');assert.equal(answered[1].value,'Customer text');assert.deepEqual(answered[0].columnLabels,columns);assert.equal(changedCells({'Batch quantity:hot':'13'},answered)[0].label,'Batch quantity · Requested');
const sections=schemaSections(schema);sections[0].rows[1].value='<script>alert(1)</script>';
const rendered=renderToStaticMarkup(React.createElement(SpecSheet,{sections,editable:false}));assert.ok(rendered.includes('Requested'));assert.ok(rendered.includes('Confirmed'));assert.ok(rendered.includes('Batch quantity'));assert.ok(rendered.includes('&lt;script&gt;'));
assert.equal(validateSpecRows([null]),'Invalid specification field.');
const html=specPrintHtml({name:'Customer <&>',ref:'TEST'} as Company,sections);assert.ok(html.includes('<th>Requested</th>'));assert.ok(html.includes('Batch quantity'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Customer &lt;&amp;&gt;'));
assert.deepEqual(documentTotals([{name:'A',qty:2,unitPrice:10,amount:20},{name:'Reference',qty:1,unitPrice:1000,amount:1000,billed:false}],10,8),{subtotal:20,discount:2,net:18,tax:1.44,total:19.44});assert.equal(salesStageOf('manufacturing'),'customer_po');assert.equal(salesStageOf('aftercare'),'invoiced');
const request:PublicSpecRequest={company:'Test-only customer',contact:'Test-only owner',due_date:null,expires_at:'2099-01-01',fields:schema.fields,answers:{},respondent_name:'',draft_version:0,status:'sent',submitted_at:null};
function workbook(){const data:unknown[][]=Array.from({length:9},()=>[]);data[1]=['Customer',request.company];data[4]=['Respondent','Test responder'];data[8]=['Section','Field','Symbol','Unit',...columns];for(const f of schema.fields)data.push([f.section,f.parameter,f.symbol,f.unit,f.isText?'Example':'12','']);const sheet=XLSX.utils.aoa_to_sheet(data),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Spec Sheet');return {book,sheet};}
const good=workbook();const parsed=importCustomerWorkbook(XLSX.write(good.book,{type:'buffer',bookType:'xlsx'}),request);assert.equal(parsed.answers['Batch quantity:hot'],'12');assert.equal(parsed.name,'Test responder');
const bad=workbook();bad.sheet.E10={t:'n',v:42,f:'SUM(20,22)'};assert.throws(()=>importCustomerWorkbook(XLSX.write(bad.book,{type:'buffer',bookType:'xlsx'}),request),/formulas/);assert.deepEqual(request.answers,{});
const wrong=workbook();wrong.sheet.B2={t:'s',v:'Other customer'};assert.throws(()=>importCustomerWorkbook(XLSX.write(wrong.book,{type:'buffer',bookType:'xlsx'}),request),/different customer/);
const missing=workbook();delete missing.sheet.A11;assert.throws(()=>importCustomerWorkbook(XLSX.write(missing.book,{type:'buffer',bookType:'xlsx'}),request),/Unrecognized field/);
assert.equal(canCountersignNda({role:'admin'} as User),true);assert.equal(canCountersignNda({role:'member'} as User),false);assert.equal(canCountersignNda({role:'member',toolAccess:{nda:true,'nda:countersign':true}} as unknown as User),true);
console.log('Domain checks passed: configurable schema validation, immutable field snapshots, numeric values, escaped custom rendering, document totals, stages, workbook validation and permissions.');

const ndaFields={partyBName:'Test counterparty',partyBEntity:'Test entity',partyBAddress:'Test address',purpose:'Test purpose'};
for(const terms of [undefined,null,[],{},'', '   '])assert.equal(validateNdaTerms(terms),NDA_TERMS_REQUIRED);
assert.ok(validateNdaTerms('x'.repeat(50_001)));assert.equal(validateNdaTerms('Test-only agreement text.'),null);
configureTerms('','');assert.throws(()=>ndaAgreementText(ndaFields),/Save your own/);assert.ok(docHtml(ndaFields).includes(NDA_TERMS_REQUIRED));
const ownTerms='Test-only operator content.\n\nLiteral markup <script>not executable</script> & symbols.';
configureTerms('','',ownTerms);
const ndaText=ndaAgreementText(ndaFields);assert.ok(ndaText.endsWith(ownTerms));
const ndaHtml=docHtml(ndaFields);assert.ok(ndaHtml.includes('&lt;script&gt;not executable&lt;/script&gt; &amp; symbols.'));assert.ok(!ndaHtml.includes('<script>'));
const snapshotOrg={name:'Test organisation',party:'Test organisation details',terms:ownTerms};
configureTerms('','','Changed test-only terms.');assert.equal(ndaAgreementText(ndaFields,'company',snapshotOrg),ndaText.replace('Organisation: ', 'Organisation: Test organisation details'));
assert.ok(docHtml(ndaFields,null,false,'company',snapshotOrg).includes('Test-only operator content.'));assert.ok(!docHtml(ndaFields,null,false,'company',snapshotOrg).includes('Changed test-only terms.'));
configureTerms('','');
console.log('NDA checks passed: operator terms required, exact terms preserved, escaped preview and immutable supplied snapshot.');
