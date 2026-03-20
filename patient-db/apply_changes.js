const fs = require('fs');
const path = 'script.js';
let content = fs.readFileSync(path, 'utf8');

// Update renderAdmissionTable (Line 80-81 area)
const oldTableCode = `            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>`;

const newTableCode = `            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('\${patient.p_id}')">\${patient.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>`;

// Update saveNextVisit (Line 269-275 area)
const oldSaveCode = `    await supabaseClient.from('patients').update({
        next_reserve_date: nextDate,
        p_nursing_care: nursingCare,
        p_doc_submission_date: docDate
    }).eq('p_id', currentPatientDbId);

    alert(\`\${label}および設定を保存しました。\`);`;

const newSaveCode = `    const { error } = await supabaseClient.from('patients').update({
        next_reserve_date: nextDate,
        p_nursing_care: nursingCare,
        p_doc_submission_date: docDate
    }).eq('p_id', currentPatientDbId);

    if (error) {
        console.error('Save error:', error);
        if (error.message.includes('column') && (error.message.includes('not found') || error.message.includes('does not exist'))) {
            alert(\`保存に失敗しました。Supabaseに新しいカラム（p_doc_submission_date）を追加してください。\\nエラー内容: \${error.message}\`);
        } else {
            alert(\`保存に失敗しました: \${error.message || JSON.stringify(error)}\`);
        }
        return;
    }

    alert(\`\${label}および設定を保存しました。\`);`;

if (content.includes(oldTableCode)) {
    content = content.replace(oldTableCode, newTableCode);
} else {
    console.error('oldTableCode not found');
}

if (content.includes(oldSaveCode)) {
    content = content.replace(oldSaveCode, newSaveCode);
} else {
    // Try without specific spacing if it fails
    console.error('oldSaveCode not found');
}

fs.writeFileSync(path, content);
console.log('Successfully updated script.js');
