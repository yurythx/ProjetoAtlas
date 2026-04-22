const fs = require('fs');
const path = require('path');

const patterns = [
    { from: /Enquando/g, to: 'Enquanto' },
    { from: /semÃ¢ntica/g, to: 'semântica' },
    { from: /nção/g, to: 'não' },
    { from: /çção/g, to: 'ção' },
    { from: /permitinão/g, to: 'permitindo' },
    { from: /sentimenão/g, to: 'sentimento' },
    { from: /transãormar/g, to: 'transformar' },
    { from: /calculanão/g, to: 'calculando' },
    { from: /detectanão/g, to: 'detectando' },
    { from: /sugerinão/g, to: 'sugerindo' },
    { from: /riscoss/g, to: 'riscos' },
    { from: /sãore/g, to: 'score' },
    { from: /risão/g, to: 'riscos' },
    { from: /dinÃ¢mica/g, to: 'dinâmica' },
    { from: /governanÃ§a/g, to: 'governança' },
    { from: /Ã¢/g, to: 'â' },
    { from: /Ã©/g, to: 'é' },
    { from: /Ã¡/g, to: 'á' },
    { from: /Ã³/g, to: 'ó' },
    { from: /Ãº/g, to: 'ú' },
    { from: /Ã§/g, to: 'ç' },
    { from: /Ã£/g, to: 'ã' },
    { from: /Ãª/g, to: 'ê' },
    { from: /Ã­/g, to: 'í' },
    { from: /Ã\u0083/g, to: 'Ã' },
    { from: /Ã\u0081/g, to: 'Á' },
    { from: /Ã\u0089/g, to: 'É' },
    { from: /Ã\u008d/g, to: 'Í' },
    { from: /Ã\u0093/g, to: 'Ó' },
    { from: /Ã\u009a/g, to: 'Ú' },
    { from: /Ã\u0095/g, to: 'Õ' },
];

const files = [
    'frontend/src/app/(dashboard)/itil-version-5/page.tsx',
    'frontend/src/app/(public)/p/artigos/[slug]/page.tsx',
    'frontend/src/features/crm/crm-analytics-page.tsx',
    'frontend/src/features/crm/crm-page.tsx',
    'frontend/src/features/crm/kanban-board.tsx',
    'frontend/src/features/crm/pipelines-hub.tsx',
    'frontend/src/features/crm/crm-table-view.tsx'
];

files.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let newContent = content;
        patterns.forEach(p => {
            newContent = newContent.replace(p.from, p.to);
        });
        if (newContent !== content) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
            console.log(`Fixed grammar/encoding in ${file}`);
        } else {
            console.log(`No changes needed in ${file}`);
        }
    } else {
        console.log(`File not found: ${file}`);
    }
});
