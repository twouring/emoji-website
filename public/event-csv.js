(function(root){
 function parseCSV(text){
  if(typeof text!=='string'||text.length>1000000)throw new Error('CSV 不得超過 1 MB');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c==='"'){if(cell||closed)throw new Error('CSV 引號格式不正確');quoted=true;continue;}
   if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}continue;}
   if(closed){if(c===' '||c==='\t')continue;throw new Error('CSV 引號後有非分隔文字');}
   cell+=c;
  }
  if(quoted)throw new Error('CSV 引號尚未結束');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
 }
 if(typeof module==='object'&&module.exports)module.exports={parseCSV};else root.eventCSV={parseCSV};
})(typeof window==='object'?window:globalThis);
