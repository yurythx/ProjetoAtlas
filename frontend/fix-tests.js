const fs = require('fs');
const files = [
  'src/features/crm/__tests__/crm-pipeline-overview.test.tsx',
  'src/features/crm/__tests__/crm-table-view.test.tsx',
  'src/features/crm/__tests__/crm.test.tsx',
  'src/features/crm/__tests__/deal-details-modal.test.tsx'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/is_closed: (true|false),?/g, "is_closed: $1, record_type: 'incident', sla_status: 'within',");
    
    // For deal-details-modal.test.tsx 'value_stream_phase' in columns
    content = content.replace(/requires_assignee: true,?\s*\}/g, "requires_assignee: true, value_stream_phase: 'demand' }");
    content = content.replace(/column_kind: (['"])active\1,?\s*\}/g, "column_kind: $1active$1, value_stream_phase: 'demand' }");

    fs.writeFileSync(f, content);
    console.log('Fixed:', f);
  } else {
    console.log('Not found:', f);
  }
});
