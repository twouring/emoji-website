'use strict';
const sanitizeHtml=require('sanitize-html');
function mediaUrl(value,type){
 if(type==='image'&&/^\/uploads\/events\/[A-Za-z0-9._-]+$/.test(value||''))return value;
 let url;try{url=new URL(value);}catch{return '';}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
 if(type==='video'){
  let id;
  if(['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname))id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]+)$/)?.[1];
  else if(url.hostname==='youtu.be')id=url.pathname.slice(1);
  if(id&&/^[A-Za-z0-9_-]+$/.test(id))url=new URL('https://www.youtube-nocookie.com/embed/'+id);
  if(['vimeo.com','www.vimeo.com'].includes(url.hostname)&&/^\/\d+$/.test(url.pathname))url=new URL('https://player.vimeo.com/video'+url.pathname);
  if(['loom.com','www.loom.com'].includes(url.hostname)&&/^\/share\/[A-Za-z0-9]+$/.test(url.pathname))url=new URL('https://www.loom.com'+url.pathname.replace('/share/','/embed/'));
 }
 if(type==='video'&&!((url.hostname==='www.youtube-nocookie.com'&&/^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname))||(url.hostname==='player.vimeo.com'&&/^\/video\/\d+$/.test(url.pathname))||(url.hostname==='www.loom.com'&&/^\/embed\/[A-Za-z0-9]+$/.test(url.pathname))))return '';
 return url.href;
}
function richText(value,pastedText){
 if(typeof value!=='string'||value.length>100000)throw Error('富文字內容格式不正確或超過 100000 字。');
 if(pastedText!==undefined){
  if(typeof pastedText!=='string'||pastedText.length>100000)throw Error('貼上內容格式不正確或超過 100000 字。');
  const text=pastedText.trim(),video=/^https:\/\/\S+$/i.test(text)?mediaUrl(text,'video'):'';
  if(video)value='<iframe src="'+video.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></iframe>';
 }
 return sanitizeHtml(value,{
 allowedTags:['p','div','br','h2','h3','strong','b','em','i','u','s','blockquote','ul','ol','li','a','img','figure','figcaption','iframe','hr','pre','code','table','thead','tbody','tr','th','td'],
 allowedAttributes:{a:['href','target','rel','class'],img:['src','alt','loading','width'],iframe:['src','title','loading','sandbox','allow','allowfullscreen'],ol:['start'],th:['colspan','rowspan'],td:['colspan','rowspan']},
 allowedClasses:{a:['event-content-button']},allowedSchemes:['https','mailto','tel'],allowProtocolRelative:false,
 transformTags:{
 a:(tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}}),
 img:(tag,attrs)=>({tagName:'img',attribs:{src:mediaUrl(attrs.src,'image'),alt:String(attrs.alt||'').slice(0,300),loading:'lazy',...(/^\d{1,4}$/.test(attrs.width||'')&&Number(attrs.width)>=44&&Number(attrs.width)<=1600?{width:String(Number(attrs.width))}:{})}}),
 iframe:(tag,attrs)=>({tagName:'iframe',attribs:{src:mediaUrl(attrs.src,'video'),title:String(attrs.title||'影片 / Video').slice(0,300),loading:'lazy',sandbox:'allow-scripts allow-same-origin allow-presentation',allow:'fullscreen',allowfullscreen:''}})
 },exclusiveFilter:frame=>['img','iframe'].includes(frame.tag)&&!frame.attribs.src
 });
}
function contentFileType(file){
 if(!file||!Buffer.isBuffer(file.buffer)||file.size!==file.buffer.length||file.size===0)throw Error('請選擇有效檔案。');
 if(file.mimetype==='application/pdf'){
  if(file.size>10*1024*1024)throw Error('PDF 上限為 10 MB。');
  if(!/^%PDF-[12]\.\d/.test(file.buffer.subarray(0,8).toString('ascii'))||!file.buffer.subarray(-1024).toString('latin1').includes('%%EOF'))throw Error('PDF 檔案格式不正確。');
  return {type:'file',extension:'.pdf',contentType:'application/pdf'};
 }
 const {assertSocialImageFile,sniffImageType}=require('./social-upload');
 const error=assertSocialImageFile(file);if(error||sniffImageType(file.buffer.subarray(0,12))!==file.mimetype)throw Error('請上傳 5 MB 以內的 PNG、JPEG 或 WebP 圖片。');
 return {type:'image',extension:{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[file.mimetype],contentType:file.mimetype};
}
function mailRichText(value,origin){
 const absolute=value=>{try{const url=new URL(value,origin||undefined);return ['https:','http:','mailto:','tel:'].includes(url.protocol)?url.href:'';}catch{return '';}};
 return sanitizeHtml(richText(value),{allowedTags:sanitizeHtml.defaults.allowedTags.concat(['img']),allowedAttributes:{a:['href','target','rel'],img:['src','alt','width'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedSchemes:['https','http','mailto','tel'],allowProtocolRelative:false,transformTags:{
  a:(tag,attrs)=>({tagName:'a',attribs:{...attrs,href:absolute(attrs.href)}}),
  img:(tag,attrs)=>({tagName:'img',attribs:{src:absolute(attrs.src),alt:attrs.alt||'',...(attrs.width?{width:attrs.width}:{})}}),
  iframe:(tag,attrs)=>({tagName:'a',attribs:{href:absolute(attrs.src)},text:'觀看影片 / Watch video / 動画を見る'})
 }});
}
module.exports={richText,mediaUrl,contentFileType,mailRichText};
