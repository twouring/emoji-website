import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {richText,mediaUrl}=createRequire(import.meta.url)('../lib/event-rich-text');
test('rich event content preserves useful formatting while rejecting executable markup',()=>{
 const html=richText('<h2>Hello</h2><script>alert(1)</script><p onclick="alert(1)" style="position:fixed">Text <strong>bold</strong></p><a href="jav&#97;script:alert(1)">bad</a><img src="https://example.com/a.png" onerror="alert(1)"><iframe src="https://evil.example/embed/x"></iframe>');
 assert.match(html,/<h2>Hello<\/h2>/);assert.match(html,/<strong>bold<\/strong>/);assert.doesNotMatch(html,/script|onclick|onerror|style=|evil\.example|alert/);
 assert.match(richText('<a class="event-content-button other" href="https://example.com">Go</a>'),/class="event-content-button"/);
 assert.match(richText('<iframe src="https://www.youtube-nocookie.com/embed/abc_12"></iframe>'),/sandbox="allow-scripts allow-same-origin allow-presentation"/);
 for(const url of ['http://www.youtube-nocookie.com/embed/a','https://www.youtube-nocookie.com.evil.test/embed/a','https://user@www.youtube-nocookie.com/embed/a','https://www.youtube-nocookie.com:444/embed/a','data:text/html,bad'])assert.equal(mediaUrl(url,'video'),'');
 assert.equal(mediaUrl('/uploads/events/test.png','image'),'/uploads/events/test.png');
 assert.equal(richText('<img src="//example.com/a"><iframe src="https://www.loom.com/not-embed/a"></iframe>'),'');
 assert.throws(()=>richText('a'.repeat(100001)));assert.throws(()=>richText({}));
 assert.equal(richText(richText('<h3>Title</h3><a href="https://example.com">link</a>')),richText('<h3>Title</h3><a href="https://example.com">link</a>'));
});

test('content uploads enforce size and file signatures',()=>{
 const {contentFileType}=createRequire(import.meta.url)('../lib/event-rich-text');
 const check=(buffer,mimetype)=>contentFileType({buffer,size:buffer.length,mimetype});
 assert.equal(check(Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF'),'application/pdf').extension,'.pdf');
 assert.throws(()=>check(Buffer.from('<script>bad</script>'),'application/pdf'));
 assert.throws(()=>check(Buffer.from('%PDF-1.7 incomplete'),'application/pdf'));
 assert.throws(()=>check(Buffer.alloc(10*1024*1024+1),'application/pdf'));
 assert.throws(()=>check(Buffer.from('<svg></svg>'),'image/svg+xml'));
 assert.throws(()=>check(Buffer.alloc(32),'image/png'));
 assert.throws(()=>check(Buffer.alloc(0),'image/png'));
 assert.equal(check(Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),'image/png').type,'image');
 assert.match(richText('<a href="/uploads/events/content-test.pdf">PDF</a>'),/href="\/uploads\/events\/content-test.pdf"/);
});
test('email content makes uploaded links absolute and replaces video embeds with accessible links',()=>{
 const {mailRichText}=createRequire(import.meta.url)('../lib/event-rich-text');
 const html=mailRichText('<img src="/uploads/events/photo.png"><iframe src="https://player.vimeo.com/video/123"></iframe><a href="/uploads/events/info.pdf">PDF</a><script>bad()</script>','https://events.example.test');
 assert.match(html,/src="https:\/\/events.example.test\/uploads\/events\/photo.png"/);assert.match(html,/<a href="https:\/\/player.vimeo.com\/video\/123">/);assert.doesNotMatch(html,/<iframe|<script|bad\(\)/);assert.match(html,/href="https:\/\/events.example.test\/uploads\/events\/info.pdf"/);
 const {textToHtml}=createRequire(import.meta.url)('../lib/mail');assert.match(textToHtml('Stop\nhttps://example.test/unsubscribe?a=1&b=2'),/<a href="https:\/\/example.test\/unsubscribe\?a=1&amp;b=2">/);assert.doesNotMatch(textToHtml('<img onerror=bad()>'),/<img/);
});

test('video insertion accepts ordinary share URLs without broadening iframe origins',()=>{
 for(const [url,expected] of [
  ['https://youtu.be/abc_12?si=tracking','https://www.youtube-nocookie.com/embed/abc_12'],
  ['https://www.youtube.com/watch?v=abc_12&list=playlist','https://www.youtube-nocookie.com/embed/abc_12'],
  ['https://youtube.com/shorts/abc_12','https://www.youtube-nocookie.com/embed/abc_12'],
  ['https://vimeo.com/12345','https://player.vimeo.com/video/12345'],
  ['https://www.loom.com/share/abc123','https://www.loom.com/embed/abc123']
 ]){assert.equal(mediaUrl(url,'video'),expected);assert.ok(richText('<iframe src="'+url.replaceAll('&','&amp;')+'"></iframe>').includes(expected));}
 for(const url of ['https://youtu.be/abc/extra','https://youtube.com/watch?v=../bad','https://youtube.com.evil.test/watch?v=abc','https://vimeo.com/settings','https://loom.com/share/abc/extra','https://user@youtu.be/abc'])assert.equal(mediaUrl(url,'video'),'');
});

test('rich editor busy state restores the current action label',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-rich-editor.js',import.meta.url),'utf8'),context={};
 runInNewContext(source.slice(source.indexOf(' function processing('),source.indexOf(' function load(')),context);
 const button={textContent:'儲存通知內容',dataset:{},setAttribute(k,v){this[k]=v;}};
 context.processing(button,true);assert.equal(button.disabled,true);assert.equal(button['aria-busy'],'true');assert.equal(button.textContent,'處理中…');
 context.processing(button,false);assert.equal(button.disabled,false);assert.equal(button['aria-busy'],'false');assert.equal(button.textContent,'儲存通知內容');
});

test('picker, paste and drop share the upload path and release controls after failure',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-rich-editor.js',import.meta.url),'utf8');
 const input={setAttribute(k,v){this[k]=v;}},language={},status={};let uploads=0;
 const context={host:{querySelector:id=>id==='#rich-file'?input:language},status,id:'event_test',FormData:class{append(){}},api:async()=>{uploads++;assert.equal(input.disabled,true);assert.equal(language.disabled,true);throw Error('Upload unavailable');}};
 runInNewContext(source.slice(source.indexOf(' async function upload('),source.indexOf(" host.querySelector('#rich-save').onclick")),context);
 await context.upload([{},{}]);assert.equal(uploads,0);await context.upload([{name:'test.pdf'}]);assert.equal(uploads,1);assert.equal(status.textContent,'Upload unavailable');assert.equal(input.disabled,false);assert.equal(input['aria-busy'],'false');assert.equal(language.disabled,false);
 input.disabled=true;await context.upload([{}]);assert.equal(uploads,1);
});

test('image dimensions accept bounded pixel widths and remain safe in email',()=>{
 const {mailRichText}=createRequire(import.meta.url)('../lib/event-rich-text');
 const html='<img src="https://example.test/image.png" width="320" alt="Description">';assert.match(richText(html),/width="320"/);assert.match(mailRichText(html),/width="320"/);
 for(const width of ['0','43','1601','100%','1e3','320px','-100'])assert.doesNotMatch(richText('<img src="https://example.test/a.png" width="'+width+'">'),/width=/);
});

test('editing an existing image rejects a stale target after server validation',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-rich-editor.js',import.meta.url),'utf8'),imageUpdate={},status={};
 const context={imageUpdate,status,selectedImage:{},lang:'zh',id:'test',host:{querySelector:id=>({value:id==='#rich-url'?'https://example.test/a.png':id==='#rich-label'?'alt':'320'})},escape:v=>v,processing:(button,active)=>{button.disabled=active;},api:async()=>({html:'<img src="https://example.test/a.png" width="320">'}),editor:{contains:()=>false},refreshImages(){},document:{createRange(){assert.fail('stale image must not be replaced');}}};
 runInNewContext(source.slice(source.indexOf(' imageUpdate.onclick='),source.indexOf(' function processing(')),context);
 await imageUpdate.onclick();assert.equal(status.textContent,'內容已變更，請重新選取圖片。');assert.equal(imageUpdate.disabled,false);
});


test('pasting a standalone supported video uses the same sanitizer and preserves other pasted content',()=>{
 assert.match(richText('<a href="https://youtu.be/abc_12">Video</a>',' https://youtu.be/abc_12 '),/<iframe src="https:\/\/www.youtube-nocookie.com\/embed\/abc_12"/);
 for(const text of ['See https://youtu.be/abc_12','https://youtu.be/abc\n_12','https://youtu.be/abc_12\nAnother line','https://youtube.com.evil.test/watch?v=abc','javascript:alert(1)'])assert.equal(richText('<p>Original <strong>content</strong></p><script>bad()</script>',text),'<p>Original <strong>content</strong></p>');
 assert.throws(()=>richText('<p>Text</p>',{}),/貼上內容/);assert.throws(()=>richText('', 'a'.repeat(100001)),/貼上內容/);
});


test('editor paste forwards plain text for video detection while retaining HTML and file upload behavior',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/event-rich-editor.js',import.meta.url),'utf8');let paste,inserted,uploaded,prevented=0;
 const context={editor:{addEventListener:(name,handler)=>{paste=handler;}},remember(){},escape:v=>v,status:{},insert:async(...args)=>{inserted=args;},upload:async files=>{uploaded=files;}};
 runInNewContext(source.slice(source.indexOf(" editor.addEventListener('paste'"),source.indexOf(" editor.addEventListener('dragover'")),context);
 await paste({preventDefault(){prevented++;},clipboardData:{files:[],getData:type=>type==='text/html'?'<a>Video</a>':'https://youtu.be/abc_12'}});
 assert.deepEqual(inserted,['<a>Video</a>','https://youtu.be/abc_12']);assert.equal(prevented,1);
 inserted=null;const files=[{name:'photo.png'}];await paste({preventDefault(){},clipboardData:{files}});assert.equal(uploaded,files);assert.equal(inserted,null);
});
