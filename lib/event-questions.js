'use strict';
const TYPES=['short','long','single','multiple','checkbox','terms','signature','website','company','phone','instagram','linkedin','youtube','x'];
function questions(input){
  if(!Array.isArray(input)||input.length>30)throw new Error('報名問題最多 30 題。');
  const ids=new Set();
  return input.map(q=>{
    if(!q||typeof q.id!=='string'||!/^q_[a-zA-Z0-9_-]{1,60}$/.test(q.id)||ids.has(q.id))throw new Error('問題識別碼無效或重複。');
    ids.add(q.id);
    if(!TYPES.includes(q.type)||typeof q.label!=='string'||!q.label.trim()||q.label.length>1000||typeof q.required!=='boolean')throw new Error('請填寫有效的問題、類型與必填設定。');
    const out={id:q.id,type:q.type,label:q.label.trim(),required:q.required};
    if(['single','multiple'].includes(q.type)){
      if(!Array.isArray(q.options)||q.options.length<2||q.options.length>30||q.options.some(v=>typeof v!=='string'||!v.trim()||v.length>200)||new Set(q.options.map(v=>v.trim())).size!==q.options.length)throw new Error('選項需為 2–30 個不重複的文字。');
      out.options=q.options.map(v=>v.trim());
    }
    out.translations={};
    for(const lang of ['en','ja'])if(q.translations?.[lang]){
      if(typeof q.translations[lang]!=='string'||q.translations[lang].length>1000)throw new Error('翻譯不得超過 1000 字。');
      out.translations[lang]=q.translations[lang].trim();
    }
    if(out.options){out.option_translations={};for(const lang of ['en','ja']){
      const values=q.option_translations?.[lang];if(values===undefined||Array.isArray(values)&&!values.length)continue;
      if(!Array.isArray(values)||values.length!==out.options.length||values.some(v=>typeof v!=='string'||!v.trim()||v.length>200))throw new Error('翻譯選項需與原選項逐行對應，且每項不可空白。');
      out.option_translations[lang]=values.map(v=>v.trim());
    }}
    return out;
  });
}
function answers(list,input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('報名答案格式不正確。');
  if(Object.keys(input).some(id=>!list.some(q=>q.id===id)))throw new Error('報名表已更新，請重新整理。');
  return list.map(q=>{
    let value=input[q.id];
    if(['checkbox','terms'].includes(q.type)){
      if(value!==undefined&&typeof value!=='boolean')throw new Error(q.label+'：請勾選確認。');
      value=!!value;
    }else if(q.type==='multiple'){
      value=value??[];
      if(!Array.isArray(value)||value.some(v=>!q.options.includes(v))||new Set(value).size!==value.length)throw new Error(q.label+'：選項不正確。');
    }else{
      value=value??'';
      if(typeof value!=='string'||value.length>10000)throw new Error(q.label+'：答案格式不正確。');
      value=value.trim();
      if(q.type==='single'&&value&&!q.options.includes(value))throw new Error(q.label+'：選項不正確。');
      if(q.type==='website'&&value){let url;try{url=new URL(value);}catch{}if(!url||!['https:','http:'].includes(url.protocol))throw new Error(q.label+'：請輸入 http 或 https 網址。');}
    }
    if(q.required&&(!value||(Array.isArray(value)&&!value.length)))throw new Error(q.label+'：此題必填。');
    return {question:q,value};
  });
}
module.exports={questions,answers};
