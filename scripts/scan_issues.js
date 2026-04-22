const fs=require('fs'),path=require('path');
function walk(dir){
  let r=[];
  for(const f of fs.readdirSync(dir)){
    const fp=path.join(dir,f);
    if(fs.statSync(fp).isDirectory()) r=r.concat(walk(fp));
    else if(f.endsWith('.tsx')||f.endsWith('.ts')) r.push(fp);
  }
  return r;
}
const files=walk('frontend/src');
const results={};
for(const f of files){
  const c=fs.readFileSync(f,'utf8');
  const issues=[];
  if(/Ã/.test(c)) issues.push('mojibake');
  if(/anão|risão|detectanão|sãore/.test(c)) issues.push('garbled-pt');
  if(issues.length) results[f]=issues;
}
console.log(JSON.stringify(results,null,2));
