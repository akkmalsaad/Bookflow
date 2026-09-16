const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,'supabase/functions/invoice-public',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(result){
 const exports={};vm.runInNewContext(compile('payload.ts'),{exports,Intl,Date});
 let handler;const calls=[];
 vm.runInNewContext(compile('index.ts'),{exports:{},Request,Response,URL,Date,
 Deno:{env:{get:()=> 'configured'},serve:fn=>handler=fn},
 require:name=>name==='./payload.ts'?exports:{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})}});
 return {request:(query='',options={})=>handler(new Request('https://example.com/invoice-public'+query,options)),calls};
}
const token='2339ffe7-5385-400d-8c9f-2dbf07e0cdc0';
const query=`?format=json&token=${token}`;
test('malformed input is rejected before RPC and legacy browser links redirect',async()=>{
 const s=setup({});assert.equal((await s.request('?format=json&token=bad')).status,400);
 assert.equal((await s.request(query,{method:'PUT'})).status,405);
 assert.equal((await s.request('',{method:'OPTIONS'})).status,204);
 assert.equal((await s.request(query,{method:'POST',body:'not json'})).status,400);
 assert.equal((await s.request(query,{method:'POST',body:JSON.stringify({action:'Paid'})})).status,400);
 const redirect=await s.request(`?token=${token}`);assert.equal(redirect.status,302);assert.ok(redirect.headers.get('location').startsWith('https://bookflow.expo.app/invoice-public?'));assert.equal(s.calls.length,0);
});
test('GET and POST both filter public data; failures use appropriate generic responses',async()=>{
 const data={status:'Sent',invoice:{id:'a',amount:100,status:'Sent'},payments:[],payload:{currency:'MYR',invoice:{id:'a'},privateSecret:'CANARY'}};
 for(const method of ['GET','POST']){
  const s=setup({data,error:null});const res=await s.request(query,{method,...(method==='POST'?{body:JSON.stringify({action:'Accepted'})}:{})});
  assert.equal(res.status,200);assert.ok(!(await res.text()).includes('CANARY'));assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('referrer-policy'),'no-referrer');
  assert.equal(s.calls[0].name,method==='GET'?'read_public_invoice_state':'respond_to_invoice_link');
 }
 assert.equal((await setup({error:{message:'This invoice is no longer active',code:'P0001'}}).request(query,{method:'POST',body:'{"action":"Accepted"}'})).status,409);
 assert.equal((await setup({error:{code:'P0002'}}).request(query,{method:'POST',body:'{"action":"Accepted"}'})).status,404);
 const failed=await setup({error:{message:'SQL secret stack'}}).request(query);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('SQL secret'));
 assert.equal((await setup({data:null,error:null}).request(query)).status,404);
});
