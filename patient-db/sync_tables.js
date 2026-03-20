const fs = require('fs');
const path = 'script.js';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// 1. Nursing Care Table Update (Indices 132-133 for lines 133-134)
const ncLine1 = `            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>`;
const ncLine2 = `            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>`;
const ncLine3 = `            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>`;

// Apply Nursing Care update
lines[132] = ncLine1;
lines[133] = ncLine2;
lines.splice(134, 0, ncLine3);

// 2. Outpatient Table Update (Index 345-346 for lines 345-346, but shifted by 1 now)
// Original 345 is now 346.
const opIdx = 345 + 1;
const opLine1 = `            <td onclick="openPatientDetails('\${op.p_id}')">\${op.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>`;
const opLine2 = `            <td onclick="openPatientDetails('\${op.p_id}')">\${op.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>`;
const opLine3 = `            <td onclick="openPatientDetails('\${op.p_id}')">\${op.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>`;

lines[345 + 1] = opLine1;
lines[346 + 1] = opLine2;
lines.splice(347 + 1, 0, opLine3);

fs.writeFileSync(path, lines.join('\n'));
console.log('Successfully synchronized tables in script.js');
