const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {PGlite} = require(process.env.BOOKFLOW_PGLITE_PATH || '@electric-sql/pglite');
const project=path.resolve(__dirname,'..');
const staged=project;
const moduleExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(staged,'supabase/functions/invoice-public/payload.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleExports,Intl,Date});
const {publicInvoiceResponse}=moduleExports;
const token='2339ffe7-5385-400d-8c9f-2dbf07e0cdc0';
let db;
test.before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
 for(const file of ['20260824000000_create_bookflow_workspaces.sql','20260824001000_create_public_invoice_links.sql','20260830000000_invoice_trash_and_void.sql']) await db.exec(fs.readFileSync(path.join(project,'supabase/migrations',file),'utf8'));
 await db.exec(fs.readFileSync(path.join(staged,'supabase/migrations/20260916010000_harden_public_invoice_responses.sql'),'utf8'));
});
test.after(async()=>db?.close());
async function fixture(status='Sent',linkStatus='Sent',payments=[],extra={}){
 await db.exec('delete from public_invoice_links; delete from bookflow_workspaces');
 const invoice={id:'invoice-a',status,amount:100,dueDate:'2026-10-01',...extra};
 await db.query('insert into bookflow_workspaces(user_id,data) values ($1,$2)', ['owner-a',JSON.stringify({invoices:[invoice],payments})]);
 await db.query(`insert into public_invoice_links(token,user_id,invoice_id,status,payload) values ($1,'owner-a','invoice-a',$2,$3)`,[token,linkStatus,JSON.stringify({invoice:{id:'invoice-a',amount:100},currency:'MYR'})]);
}
async function respond(status){return (await db.query('select respond_to_invoice_link($1,$2) as result',[token,status])).rows[0].result;}
async function read(){return (await db.query('select read_public_invoice_state($1) as result',[token])).rows[0].result;}
test('only Sent/Overdue can respond; repeated or opposite responses cannot overwrite',async()=>{
 for(const initial of ['Sent','Overdue']) for(const next of ['Accepted','Declined']) {
  await fixture(initial);assert.equal((await respond(next)).status,next);
  await assert.rejects(respond(next),/no longer active/);await assert.rejects(respond(next==='Accepted'?'Declined':'Accepted'),/no longer active/);
  const w=(await db.query('select data from bookflow_workspaces')).rows[0].data;assert.equal(w.invoices[0].status,next);
 }
 for(const status of ['Paid','Accepted','Declined','Cancelled','Void','Partially Paid','Draft']) {
  await fixture(status);await assert.rejects(respond('Accepted'),/no longer active/);
 }
 for(const status of ['Paid','Accepted','Declined','Cancelled','Void']) {
  await fixture('Sent',status);await assert.rejects(respond('Declined'),/no longer active/);
 }
});
test('workspace deletion, payment and missing invoice prevent stale links from accepting',async()=>{
 await fixture('Sent','Sent',[],{deletedAt:'2026-09-16'});await assert.rejects(respond('Accepted'),/no longer active/);
 await fixture('Sent','Sent',[{invoiceId:'invoice-a',amount:20}]);await assert.rejects(respond('Declined'),/no longer active/);
 await fixture('Sent','Sent',[],{depositPaid:20});await assert.rejects(respond('Declined'),/no longer active/);
 await fixture();await db.exec(`update bookflow_workspaces set data='{"invoices":[]}'`);assert.equal(await read(),null);await assert.rejects(respond('Accepted'),/not found/);
});
test('expiry, revocation and invalid actions fail without updates',async()=>{
 await fixture();await assert.rejects(respond(null),/Unsupported/);await assert.rejects(respond('Paid'),/Unsupported/);
 await db.exec(`update public_invoice_links set expires_at=now()-interval '1 second'`);assert.equal(await read(),null);await assert.rejects(respond('Accepted'),/expired/);
 await fixture();await db.exec('delete from public_invoice_links');assert.equal(await read(),null);await assert.rejects(respond('Accepted'),/not found/);
});
test('reads current payments without resharing; filters other invoices and owners',async()=>{
 await fixture();await db.query(`update bookflow_workspaces set data=jsonb_set(data,'{payments}',$1)`,[JSON.stringify([{invoiceId:'invoice-a',amount:40,kind:'deposit'},{invoiceId:'other',amount:900}])]);
 let result=publicInvoiceResponse(await read());assert.equal(result.status,'Partially Paid');assert.equal(result.payload.invoice.depositPaid,40);
 await db.query(`update bookflow_workspaces set data=jsonb_set(data,'{payments}',$1)`,[JSON.stringify([{invoiceId:'invoice-a',amount:100}])]);
 result=publicInvoiceResponse(await read());assert.equal(result.status,'Paid');assert.equal(result.payload.invoice.depositPaid,100);
 await db.exec(`update bookflow_workspaces set data=jsonb_set(data,'{payments}','[]')`);assert.equal(publicInvoiceResponse(await read()).payload.invoice.depositPaid,0);
 const row=await read();assert.ok(!JSON.stringify(row).includes('other'));
 await db.exec(`set role anon`);await assert.rejects(read(),/permission denied/);await db.exec('reset role');
 await db.exec(`set role authenticated`);await assert.rejects(read(),/permission denied/);await assert.rejects(respond('Accepted'),/permission denied/);await db.exec('reset role');
});
test('public projection removes hidden data in every copy and drops unrecognized fields',()=>{
 const hidden='PRIVATE-CANARY';const visibility=Object.fromEntries(['businessAddress','clientAddress','dueDate','paymentStatus','paymentInformation','paymentInstructions','terms','thankYou'].map(k=>[k,false]));
 const input={status:'Sent',invoice:{id:'a',status:'Sent',amount:100,dueDate:'2026-10-01'},payments:[{invoiceId:'a',amount:30,kind:'deposit'}],payload:{secret:hidden,currency:'MYR',invoice:{id:hidden,terms:hidden,dueDate:hidden},businessProfile:{address:hidden},render:{design:{visibility,thankYouMessage:hidden},business:{address:hidden},client:{address:hidden},invoice:{dueOn:hidden},payment:{bankName:hidden,accountNumber:hidden},paymentInstructions:hidden,terms:hidden,thankYouMessage:hidden,unknown:hidden,items:[{description:'Service'}]}}};
 const result=publicInvoiceResponse(input);assert.ok(!JSON.stringify(result).includes(hidden));assert.equal(result.payload.render.totals.amountPaid,'RM 30.00');assert.equal(result.payload.render.totals.balance,'RM 70.00');assert.equal(result.status,'Partially Paid');
});
