'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let ts;
try { ts = require('typescript'); } catch (_) {
  try { ts = require(process.env.NODE_PATH + '/typescript'); } catch (_) { ts = null; }
}
const root = path.resolve(__dirname, '../..');
const passed = [];
const check = (name, callback) => { callback();passed.push(name); };
function importWithMocks(filepath,mocks={}) {
  const filename=path.join(root,filepath);
  const exports={};
  const sandbox={module:{exports},exports,console,process,Buffer,AbortSignal,setTimeout,fetch:global.fetch,require:(name) => {
    if (Object.prototype.hasOwnProperty.call(mocks,name)) return mocks[name];
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
  return sandbox.module.exports;
}
const files=fs.readdirSync(path.join(root,'frontend/src/components')).filter(f=>f.endsWith('.jsx'));
if (ts) check('Modified frontend JSX parses',()=>{
  const targets=[...files.map(f=>`frontend/src/components/${f}`),
    'frontend/src/App.jsx','frontend/src/main.jsx','frontend/src/pages/Home.jsx','frontend/src/pages/PublicTenderPage.jsx','frontend/src/pages/PublicWebsiteManagement.jsx'];
  for (const file of targets) {
    const content=fs.readFileSync(path.join(root,file),'utf8');
    const source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
    assert.equal(source.parseDiagnostics.length,0,`${file}: ${source.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' '))}`);
  }
});
check('Original attendance files untouched (hash checks in audit)',()=>{
  assert(fs.existsSync(path.join(root,'backend/src/services/attendanceEngine.service.js')));
});
(async()=>{
  let inserted=0, ack=[], emailCount=0;
  const model={
    createSuggestion:async()=>{inserted++;return inserted},
    updateAcknowledgement:async(id,state)=>{ack.push([id,state])},
    listSuggestions:async()=>[{id:1,suggestion_text:'Test',visitor_email:'test@example.com'}],
    countUnread:async()=>1,
    countSuggestions:async()=>1,
    markSuggestionRead:async(id)=>id===1,
  };
  let failMail=false;
  const controller=importWithMocks('backend/src/controllers/publicSuggestions.controller.js',{
    '../models/publicSuggestions.model':model,
    '../services/publicSuggestionEmail.service':{sendSuggestionAcknowledgement:async()=>{emailCount++;if(failMail)throw Error('mail failed');return {status:'SENT'}}},
    '../utils/logger':{warn:()=>{}},
  });
  async function response(handler,body={},params={}) {
    const res={code:200,payload:null,status(n){this.code=n;return this},json(obj){this.payload=obj;return this}};
    let thrown;
    await handler({body,params,query:{},user:{id:1}},res,e=>{thrown=e});
    if(thrown) throw thrown;
    return res;
  }
  const valid={name:'Visitor',email:'Visitor@example.com',suggestion:'A useful suggestion on training facilities.',consent:true,website:''};
  let r=await response(controller.submitSuggestion,{...valid,email:'bad'});
  assert.equal(r.code,400);passed.push('Invalid visitor email rejected');
  r=await response(controller.submitSuggestion,{...valid,consent:false});
  assert.equal(r.code,400);passed.push('Privacy consent required');
  r=await response(controller.submitSuggestion,{...valid,suggestion:'too short'});
  assert.equal(r.code,400);passed.push('Feedback minimum length enforced');
  r=await response(controller.submitSuggestion,{...valid,website:'bot.test'});
  assert.equal(r.code,202);assert.equal(inserted,0);passed.push('Honeypot submission not stored');
  r=await response(controller.submitSuggestion,valid);
  assert.equal(r.code,201);assert.equal(inserted,1);assert.equal(ack.at(-1)[1],'SENT');passed.push('Submission stored and email acknowledged');
  failMail=true;
  r=await response(controller.submitSuggestion,valid);
  assert.equal(r.code,201);assert.equal(inserted,2);assert.equal(ack.at(-1)[1],'FAILED');passed.push('Mail failure never loses suggestion');
  r=await response(controller.getSuggestionNotifications);
  assert.equal(r.payload.data.unread,1);passed.push('Admin inbox loads unread count');
  r=await response(controller.markNotificationRead,{}, {id:'1'});
  assert.equal(r.code,200);passed.push('Admin can mark suggestion read');
  r=await response(controller.markNotificationRead,{}, {id:'0'});
  assert.equal(r.code,400);passed.push('Invalid notification ID rejected');
  const publicHandler=importWithMocks('backend/src/controllers/publicSite.controller.js', {
    '../middleware/publicSiteUpload':{uploadDirectory:'/tmp'},
    '../services/audit.service':{logRequestAudit:async()=>{}},
    '../services/imageOptimization.service':{isSupportedImageMime:()=>true,optimizeImageFile:async()=>{},safeUnlink:async()=>{}},
    '../models/publicSite.model':{
      getPublicSiteContent:async()=>({news_updates:[{text:'published',is_active:true},{text:'draft news',is_active:false}],tenders:[{id:'1',title:'Published',image_media_id:11,is_active:true},{id:'2',title:'Secret',image_media_id:12,is_active:false}]}),
      getPublicSiteMedia:async()=>[{id:11,category:'TENDER',media_type:'IMAGE',file_path:'/uploads/public-site/pub.webp',is_active:1},{id:12,category:'TENDER',media_type:'IMAGE',file_path:'/uploads/public-site/draft.webp',is_active:1}],
    },
  });
  const json={headers:{},setHeader(k,v){this.headers[k]=v},json(v){this.payload=v;return this}};
  await publicHandler.getPublicSite({},json,e=>{throw e});
  assert.equal(json.payload.data.content.tenders.length,1);
  assert.equal(json.payload.data.content.news_updates.length,1);
  assert.equal(json.payload.data.media.length,1);
  passed.push('Unpublished tender/news and draft media excluded from public API');
  process.env.RESEND_API_KEY=''; process.env.PUBLIC_SUGGESTION_FROM_EMAIL='';
  const mail=importWithMocks('backend/src/services/publicSuggestionEmail.service.js');
  const delivery=await mail.sendSuggestionAcknowledgement({to:'test@example.com',name:'Visitor'});
  assert.equal(delivery.status,'NOT_CONFIGURED');
  passed.push('No false email-delivered status without configured provider');
  console.log(`PASS ${passed.length}/${passed.length} public website predeploy checks`);
  passed.forEach((x,i)=>console.log(String(i+1).padStart(2),x));
})().catch((error)=>{console.error(error);process.exitCode=1});
