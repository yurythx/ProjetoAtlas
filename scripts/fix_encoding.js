const fs=require('fs'),path=require('path');

const fixes=[
  // Core compound patterns first (order matters!)
  [/Ã§Ã£o/g,'ção'],
  [/Ã\u00c7Ã\u0083O/g,'ÇÃO'],
  [/Ã\u00c3O/g,'ÃO'],
  // Single char replacements
  [/Ã£/g,'ã'],
  [/Ã¡/g,'á'],
  [/Ã©/g,'é'],
  [/Ã\u00aa/g,'ê'],
  [/Ãª/g,'ê'],
  [/Ã­/g,'í'],
  [/Ã³/g,'ó'],
  [/Ã\u00ba/g,'ú'],
  [/Ãº/g,'ú'],
  [/Ã§/g,'ç'],
  [/Ã\u00b5/g,'õ'],
  [/Ã\u00b3/g,'ó'],
  // Uppercase
  [/Ã\u0087/g,'Ç'],
  [/Ã\u0081/g,'Á'],
  [/Ã\u0089/g,'É'],
  [/Ã\u008d/g,'Í'],
  [/Ã\u0093/g,'Ó'],
  [/Ã\u009a/g,'Ú'],
  [/Ã\u0095/g,'Õ'],
  [/Ã\u0083/g,'Ã'],
  // Common Portuguese words that got garbled by bad encoding + word replacement
  [/anão(?!\s+(?:de|do|da|dos|das|e|é))/g,'ando'],
  [/detectanão/g,'detectando'],
  [/calculanão/g,'calculando'],
  [/sugerinão/g,'sugerindo'],
  [/gerencianão/g,'gerenciando'],
  [/identificanão/g,'identificando'],
  [/disponibilizan/g,'disponibilizando'],
  [/monitoranão/g,'monitorando'],
  [/exibinão/g,'exibindo'],
  [/fornecenão/g,'fornecendo'],
  [/garantinão/g,'garantindo'],
  [/possibiliranão/g,'possibilitando'],
  [/risão/g,'riscos'],
  [/sãore/g,'score'],
];

const targets=[
  'frontend/src/app/(dashboard)/itil-version-5/page.tsx',
  'frontend/src/app/(public)/p/artigos/[slug]/page.tsx',
  'frontend/src/features/crm/crm-analytics-page.tsx',
  'frontend/src/features/crm/crm-page.tsx',
  'frontend/src/features/crm/kanban-board.tsx',
  'frontend/src/features/crm/pipelines-hub.tsx',
];

for(const f of targets){
  try{
    let c=fs.readFileSync(f,'utf8');
    const before=c;
    for(const [p,r] of fixes) c=c.replace(p,r);
    if(c!==before){
      fs.writeFileSync(f,c,'utf8');
      console.log('Fixed:',f);
    } else {
      console.log('Clean:',f);
    }
  } catch(e){
    console.log('Error on',f,e.message);
  }
}
