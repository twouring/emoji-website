'use strict';
function embedOrigins(value,allowLocal=false){
 if(!Array.isArray(value)||value.length>10)throw Error('最多設定 10 個嵌入網站。');
 return [...new Set(value.map(item=>{
  if(typeof item!=='string'||item.length>300)throw Error('請填寫完整網站來源，例如 https://example.com。');
  let url;try{url=new URL(item);}catch{throw Error('網站來源格式不正確。');}
  const local=allowLocal&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.hostname.includes('*'))throw Error('請使用 HTTPS 網站來源，不可包含路徑、帳密或萬用字元。');
  return url.origin;
 }))];
}
module.exports={embedOrigins};
