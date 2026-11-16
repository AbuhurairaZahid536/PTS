/* Targeted pre-deployment smoke checks for compact public contact layout. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const home=read('frontend/src/pages/Home.jsx');
const cms=read('frontend/src/pages/PublicWebsiteManagement.jsx');
const form=read('frontend/src/components/PublicSuggestionForm.jsx');
const css=read('frontend/src/publicContactCompact.css');
const model=read('backend/src/models/publicSite.model.js');
const tests = [
  ['Contact shell uses side-by-side columns', () => assert.match(home, /className="pts-contact-upper"/)],
  ['Suggestion is next to institutional heading', () => {const a=home.indexOf('className="pts-contact-upper"');assert(a>=0);assert(home.indexOf('<PublicSuggestionForm />',a)>a);assert(home.indexOf('</div>\n\n          <div className="pts-contact-information"',a)>home.indexOf('<PublicSuggestionForm />',a));}],
  ['Official contact strip uses 3 cells',()=>assert.equal((home.match(/className="pts-contact-information-item"/g)||[]).length,3)],
  ['Desktop contact strip is 3-column',()=>assert.match(css,/\.pts-contact-information\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s)],
  ['Mobile contact strip stacks properly',()=>assert.match(css,/@media \(max-width: 680px\)[\s\S]*?\.pts-contact-information \{ grid-template-columns: 1fr;/)],
  ['Compact suggestion cards not full-width',()=>assert.match(css,/\.pts-contact-compact \.pts-suggestion-box \{ grid-column: auto; display: block;/)],
  ['Suggestion backend endpoint unchanged',()=>assert.match(form,/api\.post\("\/public-site\/suggestions"/)],
  ['Consent preserved',()=>assert.match(form,/type="checkbox" checked=\{consent\} required/)],
  ['Honeypot preserved',()=>assert.match(form,/className="pts-suggestion-honeypot"/)],
  ['Success/error notifications preserved',()=>assert.match(form,/pts-suggestion-response/)],
  ['Google Maps URL editable through CMS',()=>assert.match(cms,/\["contact", "location_map_url"\]/)],
  ['CMS warns on invalid URL',()=>assert.match(cms,/validateStatus=\{content\.contact\?\.location_map_url/)],
  ['Google Maps setting in backend defaults',()=>assert.match(model,/location_map_url:\s*""/)],
  ['Google Maps setting in frontend defaults',()=>assert.match(home,/location_map_url:\s*""/)],
  ['External map link secure',()=>assert.match(home,/rel="noopener noreferrer"/)],
  ['Copyright displayed at end',()=>assert.match(home,/All rights reserved\./)],
  ['No contact login card: navbar remains login entry',()=>assert(!home.includes('className="contact-login-row"'))],
];
(async()=>{
  const {resolvePublicGoogleMapsUrl:fn}=await import(pathToFileURL(path.join(root,'frontend/src/utils/publicGoogleMapsUrl.js')).href);
  const links=[
    ['https://maps.app.goo.gl/shortlink',true],
    ['https://www.google.com/maps/place/PTS',true],
    ['https://maps.google.com/maps?q=PTS',true],
    ['https://goo.gl/maps/abc',true],
    ['https://www.google.com/maps?cid=9876',true],
    ['',false],
    ['javascript:alert(1)',false],
    ['http://www.google.com/maps',false],
    ['https://maps.app.goo.gl@evil.example/bad',false],
    ['https://www.google.com.evil.example/maps',false],
    ['https://www.google.com/',false],
    ['https://example.com/maps',false],
    ['https://goo.gl/other',false],
  ];
  for(const [link,allow] of links){tests.push([`Google Maps URL ${allow?'allow':'reject'}: ${link||'(empty)'}`,()=>assert.equal(!!fn(link),allow)]);}
  let count=0;
  for(const [label,test] of tests){test();count++;}
  console.log(`PASS ${count}/${tests.length} compact contact pre-deployment checks`);
})().catch(error=>{console.error(error);process.exitCode=1;});
