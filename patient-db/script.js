// --- Supabase Configuration ---
const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
let supabaseClient;

// Utility to convert full-width alphanumeric to half-width
const toHalfWidth = (str) => {
    if (!str) return "";
    return str.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/ー/g, '-');
};

// Function to calculate remaining days based on category and diagnosis date
function calculateRemainingDays(diagDate, category) {
    if (!diagDate || !category) return null;

    let limit = 0;
    if (category === '脳血管') limit = 180;
    else if (category === '運動器') limit = 150;
    else if (category === '廃用') limit = 120;
    else return null;

    const diag = new Date(diagDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    diag.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - diag.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Day 1 is the diagnosis date itself.
    const elapsed = diffDays + 1;
    const remaining = limit - elapsed;

    return remaining;
}

let admissionTableBody, outpatientTableBody, archivedAdmissionTableBody, archivedOutpatientTableBody, nursingCareTableBody, archivedNursingCareTableBody;
let addAdmissionModal, addAdmissionForm, addOutpatientModal, addOutpatientForm, addNursingCareModal, addNursingCareForm;

// Initialize Admission Table
async function renderAdmissionTable() {
    admissionTableBody = document.getElementById('patientTableBody');
    if (!admissionTableBody) return;
    admissionTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'admission')
        .order('p_id', { ascending: true });

    if (error || !dbPatients) return;

    dbPatients.forEach((patient) => {
        let categoryClass = 'tag-unknown';
        if (patient.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.p_category === '廃用') categoryClass = 'tag-disuse';

        const remainingDays = calculateRemainingDays(patient.p_diagnosis_date, patient.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails('${patient.p_id}')"><strong>${patient.p_id}</strong></td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_name}</td>
            <td onclick="openPatientDetails('${patient.p_id}')"><span class="tag-type-admission">入院</span></td>
            <td onclick="openPatientDetails('${patient.p_id}')"><span class="${categoryClass}">${patient.p_category || '未設定'}</span></td>
            <td onclick="openPatientDetails('${patient.p_id}')"><span style="background: #e1f5fe; color: #0277bd; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${patient.p_disease}</span></td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_diagnosis_date}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${remainingHtml}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteAdmissionPatient('${patient.p_id}')">削除</button>
            </td>
        `;
        admissionTableBody.appendChild(tr);
    });
}

// Initialize Nursing Care Table
async function renderNursingCareTable() {
    nursingCareTableBody = document.getElementById('nursingCareTableBody');
    if (!nursingCareTableBody) return;
    nursingCareTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'nursing_care')
        .order('p_id', { ascending: true });

    if (error || !dbPatients) return;

    dbPatients.forEach((patient) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails('${patient.p_id}')"><strong>${patient.p_id}</strong></td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_name}</td>
            <td onclick="openPatientDetails('${patient.p_id}')"><span class="tag-type-admission" style="background:#ede9fe; color:#6d28d9;">介護医療院</span></td>
            <td onclick="openPatientDetails('${patient.p_id}')"><span style="background: #f3f4f6; color: #374151; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${patient.p_disease}</span></td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_diagnosis_date}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${patient.p_id}')">${patient.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteNursingCarePatient('${patient.p_id}')">削除</button>
            </td>
        `;
        nursingCareTableBody.appendChild(tr);
    });
}

// Function to delete an admission patient record (Archive)
async function deleteAdmissionPatient(dbId) {
    if (confirm('この患者データを「退院者」としてアーカイブへ移動しますか？')) {
        const dischargeDate = new Date().toLocaleDateString('ja-JP');
        await supabaseClient.from('patients').update({
            p_type: 'archived_admission',
            p_termination_date: dischargeDate
        }).eq('p_id', dbId);
        await renderAdmissionTable();
    }
}

// Function to delete a nursing care patient record (Archive)
async function deleteNursingCarePatient(dbId) {
    if (confirm('この利用者を「介護医療院修了者」としてアーカイブへ移動しますか？')) {
        const terminationDate = new Date().toLocaleDateString('ja-JP');
        await supabaseClient.from('patients').update({
            p_type: 'archived_nursing_care',
            p_termination_date: terminationDate
        }).eq('p_id', dbId);
        await renderNursingCareTable();
    }
}

// Function to open patient details modal
let currentPatientIndex = -1;
let currentPatientType = ''; // 'admission' or 'outpatient'

// Function to open patient details modal
let currentPatientDbId = null;

async function openPatientDetails(dbId) {
    const modal = document.getElementById('patientDetailsModal');
    if (!modal) return;

    currentPatientDbId = dbId;

    const { data: patient, error } = await supabaseClient.from('patients').select('*').eq('p_id', dbId).single();
    if (error || !patient) return;

    document.getElementById('details-patient-name').textContent = patient.p_name;

    const categoryEl = document.getElementById('details-patient-category');
    if (categoryEl) {
        let categoryClass = 'tag-unknown';
        if (patient.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.p_category === '廃用') categoryClass = 'tag-disuse';
        categoryEl.innerHTML = `<span class="${categoryClass}">${patient.p_category || '未設定'}</span>`;
    }

    document.getElementById('details-patient-id').textContent = `ID: ${patient.p_id}`;

    // Parse history
    let history = [];
    try {
        if (patient.history) {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : patient.history;
        }
    } catch (e) { }

    // Calculate cancel rate
    let totalAppointments = 0;
    let cancelCount = 0;

    history.forEach(h => {
        if (h.status !== 'deleted') {
            totalAppointments++;
            if (h.status === 'canceled') {
                cancelCount++;
            }
        }
    });

    const cancelRate = totalAppointments > 0 ? Math.round((cancelCount / totalAppointments) * 100) : 0;
    const rateEl = document.getElementById('details-cancel-rate');
    rateEl.textContent = `${cancelRate}%`;

    if (cancelRate >= 30) rateEl.style.color = '#ef4444';
    else if (cancelRate > 0) rateEl.style.color = '#f59e0b';
    else rateEl.style.color = '#10b981';

    document.getElementById('details-cancel-count').textContent = `${cancelCount} / ${totalAppointments} 回`;

    // Render history table
    const historyBody = document.getElementById('details-history-body');
    historyBody.innerHTML = '';

    if (history.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-muted);">履歴はありません</td></tr>`;
    } else {
        history.filter(h => h.status !== 'deleted').forEach(h => {
            const tr = document.createElement('tr');
            let statusHtml = '';
            if (h.status === 'arrived') statusHtml = '<span style="background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">来院</span>';
            else if (h.status === 'canceled') statusHtml = '<span style="background: #f3f4f6; color: #6b7280; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">キャンセル</span>';
            else statusHtml = '<span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">予約中</span>';

            tr.innerHTML = `
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${h.date}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${h.time}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${h.type}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${h.cancelReason || '-'}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); text-align: center;">${statusHtml}</td>
            `;
            historyBody.appendChild(tr);
        });
    }

    document.getElementById('next-visit-date').value = patient.next_reserve_date || '';
    if (document.getElementById('details-nursing-care')) {
        document.getElementById('details-nursing-care').checked = !!patient.p_nursing_care;
    }
    if (document.getElementById('doc-submission-date')) {
        document.getElementById('doc-submission-date').value = patient.p_doc_submission_date || '';
    }
    // Adjust grid for 3 items
    const gridContainer = document.getElementById('details-grid-container');
    if (gridContainer) {
        gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
    }
    modal.style.display = 'flex';
}

async function saveNextVisit() {
    if (!currentPatientDbId) return;
    const nextDate = document.getElementById('next-visit-date').value;
    const nursingCare = document.getElementById('details-nursing-care')?.checked || false;
    const docDateInput = document.getElementById('doc-submission-date');
    const docDate = docDateInput?.value || null;
    const label = document.getElementById('next-visit-label')?.textContent || '次回予定日';

    // Validation: Check for invalid years (e.g., 202604)
    const validateDate = (dateStr) => {
        if (!dateStr) return true;
        const year = parseInt(dateStr.split('-')[0]);
        return year >= 1900 && year <= 2100;
    };

    if (!validateDate(nextDate) || (docDate && !validateDate(docDate))) {
        alert('入力された日付の年が正しくありません（例: 2026）。正しく修正してください。');
        return;
    }

    // Auto-calculate Doc Submission Date if category is '運動器' and Suzuki is attending
    // (Actually simpler per user request: if category is '運動器', set to 2 days before nextDate)
    const categoryContent = document.getElementById('details-patient-category')?.textContent || '';
    if (categoryContent.includes('運動器') && nextDate && !docDate) {
        const d = new Date(nextDate);
        d.setDate(d.getDate() - 2);
        const autoDate = d.toISOString().split('T')[0];
        if (confirm(`カテゴリーが運動器のため、書類提出予定日を2日前の ${autoDate} に自動設定しますか？`)) {
            document.getElementById('doc-submission-date').value = autoDate;
            // Recursively call saveNextVisit or just continue with the new value
            saveNextVisit();
            return;
        }
    }

    const { data, error } = await supabaseClient.from('patients').update({
        next_reserve_date: nextDate,
        p_nursing_care: nursingCare,
        p_doc_submission_date: docDate
    }).eq('p_id', currentPatientDbId);

    if (error) {
        console.error('Save error:', error);
        if (error.message.includes('column') && (error.message.includes('not found') || error.message.includes('does not exist'))) {
            alert(`保存に失敗しました。Supabaseに新しいカラム（p_doc_submission_date）を追加してください。\nエラー内容: ${error.message}`);
        } else {
            alert(`保存に失敗しました: ${error.message || JSON.stringify(error)}`);
        }
        return;
    }

    alert(`${label}および設定を保存しました。`);
    // Refresh relevant table
    await renderAdmissionTable();
    await renderOutpatientTable();
    await renderNursingCareTable();
    // Refresh calendar if modal is open
    const calendarModal = document.getElementById('calendarModal');
    if (calendarModal && calendarModal.style.display === 'flex') {
        const title = document.getElementById('calendarMonthTitle').textContent;
        if (title.includes('面談予定')) {
            renderMeetingCalendar();
        } else if (title.includes('書類提出')) {
            renderDocSubmissionCalendar();
        }
    }
}

// Initialize Outpatient Table
async function renderOutpatientTable() {
    outpatientTableBody = document.getElementById('outpatientTableBody');
    if (!outpatientTableBody) return;
    outpatientTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'outpatient')
        .order('p_id', { ascending: true });

    if (error || !dbPatients) return;

    dbPatients.forEach((op) => {
        let categoryClass = 'tag-unknown';
        if (op.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (op.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (op.p_category === '廃用') categoryClass = 'tag-disuse';

        const remainingDays = calculateRemainingDays(op.p_diagnosis_date, op.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails('${op.p_id}')"><strong>${op.p_id}</strong></td>
            <td onclick="openPatientDetails('${op.p_id}')">${op.p_name}</td>
            <td onclick="openPatientDetails('${op.p_id}')"><span class="tag-type-outpatient">外来</span></td>
            <td onclick="openPatientDetails('${op.p_id}')"><span class="${categoryClass}">${op.p_category || '未設定'}</span></td>
            <td onclick="openPatientDetails('${op.p_id}')"><span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${op.p_disease}</span></td>
            <td onclick="openPatientDetails('${op.p_id}')">${op.p_diagnosis_date}</td>
            <td onclick="openPatientDetails('${op.p_id}')">${remainingHtml}</td>
            <td onclick="openPatientDetails('${op.p_id}')">${op.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${op.p_id}')">${op.p_doc_submission_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td onclick="openPatientDetails('${op.p_id}')">${op.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteOutpatient('${op.p_id}')">削除</button>
            </td>
        `;
        outpatientTableBody.appendChild(tr);
    });
}

// Function to delete an outpatient record (Archive)
async function deleteOutpatient(dbId) {
    if (confirm('この外来データを「外来終了」としてアーカイブへ移動しますか？')) {
        const terminationDate = new Date().toLocaleDateString('ja-JP');
        await supabaseClient.from('patients').update({
            p_type: 'archived_outpatient',
            p_termination_date: terminationDate
        }).eq('p_id', dbId);
        await renderOutpatientTable();
    }
}



// Archive Table Rendering
async function renderDischargedTable() {
    archivedAdmissionTableBody = document.getElementById('archivedAdmissionTableBody');
    if (!archivedAdmissionTableBody) return;
    archivedAdmissionTableBody.innerHTML = '';

    const { data: dbPatients } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'archived_admission')
        .order('p_termination_date', { ascending: false });

    if (!dbPatients) return;

    dbPatients.forEach((p) => {
        let categoryClass = 'tag-unknown';
        if (p.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (p.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (p.p_category === '廃用') categoryClass = 'tag-disuse';

        const remainingDays = calculateRemainingDays(p.p_diagnosis_date, p.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-admission">入院</span></td>
            <td><span class="${categoryClass}">${p.p_category || '未設定'}</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${remainingHtml}</td>
            <td>${p.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreAdmission('${p.p_id}')">復元</button>
            </td>
        `;
        archivedAdmissionTableBody.appendChild(tr);
    });
}

async function renderTerminatedTable() {
    archivedOutpatientTableBody = document.getElementById('archivedOutpatientTableBody');
    if (!archivedOutpatientTableBody) return;
    archivedOutpatientTableBody.innerHTML = '';

    const { data: dbPatients } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'archived_outpatient')
        .order('p_termination_date', { ascending: false });

    if (!dbPatients) return;

    dbPatients.forEach((p) => {
        let categoryClass = 'tag-unknown';
        if (p.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (p.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (p.p_category === '廃用') categoryClass = 'tag-disuse';

        const remainingDays = calculateRemainingDays(p.p_diagnosis_date, p.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-outpatient">外来</span></td>
            <td><span class="${categoryClass}">${p.p_category || '未設定'}</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${remainingHtml}</td>
            <td>${p.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreOutpatient('${p.p_id}')">復元</button>
            </td>
        `;
        archivedOutpatientTableBody.appendChild(tr);
    });
}

async function renderNursingCareArchivedTable() {
    archivedNursingCareTableBody = document.getElementById('archivedNursingCareTableBody');
    if (!archivedNursingCareTableBody) return;
    archivedNursingCareTableBody.innerHTML = '';

    const { data: dbPatients } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'archived_nursing_care')
        .order('p_termination_date', { ascending: false });

    if (!dbPatients) return;

    dbPatients.forEach((p) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-admission" style="background:#ede9fe; color:#6d28d9;">介護医療院</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${p.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreNursingCare('${p.p_id}')">復元</button>
            </td>
        `;
        archivedNursingCareTableBody.appendChild(tr);
    });
}

async function restoreNursingCare(dbId) {
    await supabaseClient.from('patients').update({ p_type: 'nursing_care', p_termination_date: null }).eq('p_id', dbId);
    await renderNursingCareArchivedTable();
    await renderNursingCareTable();
    alert('介護医療院リストに復元しました。');
}

async function restoreAdmission(dbId) {
    await supabaseClient.from('patients').update({ p_type: 'admission', p_termination_date: null }).eq('p_id', dbId);
    await renderDischargedTable();
    await renderAdmissionTable();
    alert('入院患者リストに復元しました。');
}

async function restoreOutpatient(dbId) {
    await supabaseClient.from('patients').update({ p_type: 'outpatient', p_termination_date: null }).eq('p_id', dbId);
    await renderTerminatedTable();
    await renderOutpatientTable();
    alert('外来患者リストに復元しました。');
}

// Close modal when clicking outside
window.onclick = function (event) {
    if (addAdmissionModal && event.target == addAdmissionModal) {
        addAdmissionModal.style.display = "none";
    }
    if (addOutpatientModal && event.target == addOutpatientModal) {
        addOutpatientModal.style.display = "none";
    }
    if (addNursingCareModal && event.target == addNursingCareModal) {
        addNursingCareModal.style.display = "none";
    }
}

// Main Initialization Function
async function initApp() {
    console.log(">>> initApp started");
    // Initialize Supabase Client safely
    if (window.supabase) {
        console.log("Supabase library found.");
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error("Supabase library not loaded!");
        alert("システムの初期化に失敗しました。ページを再読み込みしてください。");
        return;
    }

    addAdmissionModal = document.getElementById('addModal');
    addAdmissionForm = document.getElementById('addPatientForm');
    addOutpatientModal = document.getElementById('addOutpatientModal');
    addOutpatientForm = document.getElementById('addOutpatientForm');
    addNursingCareModal = document.getElementById('addNursingCareModal');
    addNursingCareForm = document.getElementById('addNursingCareForm');

    console.log("Form elements retrieved:", {
        addAdmissionForm: !!addAdmissionForm,
        addOutpatientForm: !!addOutpatientForm,
        addNursingCareForm: !!addNursingCareForm
    });

    // --- Form Submission Listeners ---
    // Extracted to global inline handlers to ensure reliable execution!

    // --- Auto Migration if Opened from Patient DB ---
    const migrateDataToSupabase = async () => {
        const isMigrated = localStorage.getItem('supabase_migrated_v6');
        if (isMigrated) return;

        const admission = JSON.parse(localStorage.getItem('admissionPatients')) || [];
        const outpatient = JSON.parse(localStorage.getItem('outpatientPatients')) || [];
        const allPatients = [...admission, ...outpatient];

        // Remove duplicates by ID to avoid Postgres ON CONFLICT batch errors
        const uniquePatientsMap = {};
        for (const p of allPatients) {
            if (p && p.id) {
                uniquePatientsMap[p.id] = p;
            }
        }

        const patientsToMigrate = Object.values(uniquePatientsMap).map(p => ({
            p_id: p.id,
            p_name: p.name,
            p_type: p.type || (admission.includes(p) ? 'admission' : 'outpatient'),
            p_disease: p.disease,
            p_diagnosis_date: (p.date && p.date.trim()) ? p.date.trim() : null,
            p_category: p.category,
            next_reserve_date: (p.next_reserve_date && p.next_reserve_date.trim()) ? p.next_reserve_date.trim() : null,
            history: p.history || []
        }));

        if (patientsToMigrate.length > 0) {
            const { error } = await supabaseClient.from('patients').upsert(patientsToMigrate);
            if (error) console.error('Patient migration error:', error);
        }

        // Migrate Staff Names (Just in case)
        const staffNames = JSON.parse(localStorage.getItem('staffNames'));
        if (staffNames) {
            try {
                await supabaseClient.from('staff_settings').upsert(staffNames.map((name, i) => ({ id: i + 1, name: name, attendance: 'work' })));
            } catch (e) { }
        }

        localStorage.setItem('supabase_migrated_v6', 'true');
    };

    await migrateDataToSupabase();

    await renderAdmissionTable();
    await renderOutpatientTable();
    await renderNursingCareTable();
    await renderDischargedTable();
    await renderTerminatedTable();
    await renderNursingCareArchivedTable();

    // Excel Import Logic
    const excelImportInput = document.getElementById('excel-import');

    if (excelImportInput) {
        excelImportInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    console.log('Imported Excel Data:', jsonData);
                    alert(`Excelファイルの読み込みに成功しました。\n${jsonData.length} 行のデータを取得しました。\n※ここのデータを使って患者DBに反映させる処理を今後実装します。`);

                    excelImportInput.value = '';
                } catch (error) {
                    console.error('Error reading Excel file:', error);
                    alert('Excelファイルの読み込みに失敗しました。対応しているファイル形式（.xlsx, .xls）か確認してください。');
                }
            };

            reader.onerror = () => {
                alert('ファイルの読み込み中にエラーが発生しました。');
            };

            reader.readAsArrayBuffer(file);
        });
    }
} // End of initApp()

console.log("script.js loaded. readyState:", document.readyState);

// Run initialization immediately if DOM is ready, otherwise wait for it
if (document.readyState === 'loading') {
    console.log("Waiting for DOMContentLoaded...");
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    console.log("Running initApp immediately...");
    initApp();
}

// --- Meeting Calendar Logic ---
let currentCalendarDate = new Date();
let currentCalendarMode = 'meeting'; // 'meeting' or 'document'

function openMeetingCalendar() {
    currentCalendarMode = 'meeting';
    const modal = document.getElementById('calendarModal');
    if (modal) {
        modal.style.display = 'flex';
        renderMeetingCalendar();
    }
}

function openDocSubmissionCalendar() {
    currentCalendarMode = 'document';
    const modal = document.getElementById('calendarModal');
    if (modal) {
        modal.style.display = 'flex';
        renderDocSubmissionCalendar();
    }
}

async function renderMeetingCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    // Render basic grid structure FIRST for immediate feedback
    grid.innerHTML = '';
    document.getElementById('calendarMonthTitle').textContent = `🗓️ 面談予定 (${currentCalendarDate.getFullYear()}年${currentCalendarDate.getMonth() + 1}月)`;

    // Add day headers
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();

    // Fill previous month's days
    const prevLastDay = new Date(year, month, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<span class="day-number">${prevLastDay.getDate() - i}</span>`;
        grid.appendChild(dayDiv);
    }

    // Fill current month's days (empty for now)
    const currentMonthDays = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dayDiv.innerHTML = `<span class="day-number">${d}</span>`;
        dayDiv.dataset.date = dateStr;
        grid.appendChild(dayDiv);
        currentMonthDays.push(dayDiv);
    }

    // Fill next month's days to complete the grid (up to 42 cells)
    const currentCells = grid.children.length - 7;
    const remainingCells = 42 - currentCells;
    for (let i = 1; i <= remainingCells; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<span class="day-number">${i}</span>`;
        grid.appendChild(dayDiv);
    }

    // Now Fetch data
    const { data: patients, error } = await supabaseClient
        .from('patients')
        .select('p_name, next_reserve_date')
        .not('next_reserve_date', 'is', null);

    if (error) {
        console.error("Calendar fetch error:", error);
        return;
    }

    const meetingsByDate = {};
    if (patients) {
        patients.forEach(p => {
            if (p.next_reserve_date && p.next_reserve_date.length >= 10) {
                const d = p.next_reserve_date.substring(0, 10);
                if (!meetingsByDate[d]) meetingsByDate[d] = [];
                meetingsByDate[d].push(p.p_name);
            }
        });
    }

    // Update the already rendered grid with events
    const today = new Date();
    currentMonthDays.forEach(dayDiv => {
        const dateStr = dayDiv.dataset.date;
        const d = parseInt(dayDiv.querySelector('.day-number').textContent);
        if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
            dayDiv.classList.add('today');
        }
        if (meetingsByDate[dateStr]) {
            meetingsByDate[dateStr].forEach(name => {
                const event = document.createElement('div');
                event.className = 'calendar-event';
                event.textContent = name;
                dayDiv.appendChild(event);
            });
        }
    });

    // Render Doctor Sidebar
    await fetchDoctorHolidays();
    renderDoctorSidebar();
}

async function renderDocSubmissionCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    // Render basic grid structure FIRST
    grid.innerHTML = '';
    document.getElementById('calendarMonthTitle').textContent = `📄 書類提出 (${currentCalendarDate.getFullYear()}年${currentCalendarDate.getMonth() + 1}月)`;

    // Add day headers
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();

    // Fill previous month's days
    const prevLastDay = new Date(year, month, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<span class="day-number">${prevLastDay.getDate() - i}</span>`;
        grid.appendChild(dayDiv);
    }

    // Fill current month's days
    const currentMonthDays = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dayDiv.innerHTML = `<span class="day-number">${d}</span>`;
        dayDiv.dataset.date = dateStr;
        grid.appendChild(dayDiv);
        currentMonthDays.push(dayDiv);
    }

    // Fill next month's days to complete the grid
    const currentCells = grid.children.length - 7;
    const remainingCells = 42 - currentCells;
    for (let i = 1; i <= remainingCells; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<span class="day-number">${i}</span>`;
        grid.appendChild(dayDiv);
    }

    // Now Fetch data
    const { data: patients, error } = await supabaseClient
        .from('patients')
        .select('p_name, p_doc_submission_date')
        .not('p_doc_submission_date', 'is', null);

    if (error) {
        console.error("Calendar fetch error:", error);
        return;
    }

    const docsByDate = {};
    if (patients) {
        patients.forEach(p => {
            if (p.p_doc_submission_date && p.p_doc_submission_date.length >= 10) {
                const d = p.p_doc_submission_date.substring(0, 10);
                if (!docsByDate[d]) docsByDate[d] = [];
                docsByDate[d].push(p.p_name);
            }
        });
    }

    // Update with events
    const today = new Date();
    currentMonthDays.forEach(dayDiv => {
        const dateStr = dayDiv.dataset.date;
        const d = parseInt(dayDiv.querySelector('.day-number').textContent);
        if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
            dayDiv.classList.add('today');
        }
        if (docsByDate[dateStr]) {
            docsByDate[dateStr].forEach(name => {
                const event = document.createElement('div');
                event.className = 'calendar-event';
                event.style.backgroundColor = '#10b981'; // Green for document
                event.textContent = name;
                dayDiv.appendChild(event);
            });
        }
    });

    // Render Doctor Sidebar
    await fetchDoctorHolidays();
    renderDoctorSidebar();
}

function changeCalendarMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    if (currentCalendarMode === 'meeting') {
        renderMeetingCalendar();
    } else {
        renderDocSubmissionCalendar();
    }
}

// Close calendar modal when clicking outside
const originalWindowClick = window.onclick;
window.onclick = function (event) {
    if (originalWindowClick) originalWindowClick(event);
    const calendarModal = document.getElementById('calendarModal');
    if (calendarModal && event.target == calendarModal) {
        calendarModal.style.display = "none";
    }
}

// Global Submit Handlers
window.handleAdmissionSubmit = async function (e) {
    if (e) e.preventDefault();
    try {
        if (!supabaseClient) throw new Error("Supabase is not initialized. Check your network.");
        const newPatient = {
            p_id: toHalfWidth(document.getElementById('patientId').value),
            p_name: document.getElementById('patientName').value,
            p_type: 'admission',
            p_category: document.getElementById('patientCategory').value,
            p_disease: document.getElementById('diseaseName').value,
            p_diagnosis_date: document.getElementById('diagnosisDate').value,
            p_nursing_care: document.getElementById('patientNursingCare')?.checked || false
        };
        const { error } = await supabaseClient.from('patients').insert([newPatient]);
        if (error) {
            console.error(error);
            alert("保存に失敗しました: " + error.message);
            return;
        }
        await renderAdmissionTable();
        document.getElementById('addPatientForm')?.reset();
        if (document.getElementById('addModal')) document.getElementById('addModal').style.display = 'none';
        alert('新規患者を登録しました。');
    } catch (err) {
        console.error(err);
        alert("エラーが発生しました: " + (err.message || err));
    }
};

window.handleOutpatientSubmit = async function (e) {
    if (e) e.preventDefault();
    try {
        if (!supabaseClient) throw new Error("Supabase is not initialized.");
        const newOp = {
            p_id: toHalfWidth(document.getElementById('opPatientId').value),
            p_name: document.getElementById('opPatientName').value,
            p_type: 'outpatient',
            p_category: document.getElementById('opPatientCategory').value,
            p_disease: document.getElementById('opDiseaseName').value,
            p_diagnosis_date: document.getElementById('opVisitDate').value,
            p_nursing_care: document.getElementById('opPatientNursingCare')?.checked || false
        };
        const { error } = await supabaseClient.from('patients').insert([newOp]);
        if (error) {
            console.error(error);
            alert("保存に失敗しました: " + error.message);
            return;
        }
        await renderOutpatientTable();
        document.getElementById('addOutpatientForm')?.reset();
        if (document.getElementById('addOutpatientModal')) document.getElementById('addOutpatientModal').style.display = 'none';
        alert('新規外来患者を登録しました。');
    } catch (err) {
        console.error(err);
        alert("エラーが発生しました: " + (err.message || err));
    }
};

window.handleNursingCareSubmit = async function (e) {
    if (e) e.preventDefault();
    try {
        if (!supabaseClient) throw new Error("Supabase is not initialized.");
        const newNc = {
            p_id: toHalfWidth(document.getElementById('ncPatientId').value),
            p_name: document.getElementById('ncPatientName').value,
            p_type: 'nursing_care',
            p_category: null,
            p_disease: document.getElementById('ncDiseaseName').value,
            p_diagnosis_date: document.getElementById('ncDiagnosisDate').value,
            p_nursing_care: document.getElementById('ncPatientNursingCare')?.checked || false
        };
        const { error } = await supabaseClient.from('patients').insert([newNc]);
        if (error) {
            console.error(error);
            alert("保存に失敗しました: " + error.message);
            return;
        }
        await renderNursingCareTable();
        document.getElementById('addNursingCareForm')?.reset();
        if (document.getElementById('addNursingCareModal')) document.getElementById('addNursingCareModal').style.display = 'none';
        alert('新規利用者を登録しました。');
    } catch (err) {
        console.error(err);
        alert("エラーが発生しました: " + (err.message || err));
    }
};



// --- Doctor Holiday Logic ---
let doctorHolidays = [];

async function fetchDoctorHolidays() {
    try {
        const { data, error } = await supabaseClient
            .from('doctor_attendance') // Keeping table name for simplicity, but treating as holidays
            .select('*');
        if (error) {
            if (error.message.includes('relation "doctor_attendance" does not exist')) {
                console.warn("Table 'doctor_attendance' not found. Please create it in Supabase.");
                return [];
            }
            throw error;
        }
        doctorHolidays = data || [];
        return doctorHolidays;
    } catch (err) {
        console.error("Error fetching doctor holidays:", err);
        return [];
    }
}

async function toggleDrHoliday(drId, dateStr) {
    // drId is suzuki or tsukamoto
    try {
        const existing = doctorHolidays.find(a => a.dr_name === drId && a.attendance_date === dateStr);

        if (existing) {
            const { error } = await supabaseClient
                .from('doctor_attendance')
                .delete()
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('doctor_attendance')
                .insert([{ dr_name: drId, attendance_date: dateStr }]);
            if (error) throw error;
        }

        await fetchDoctorHolidays();
        renderDoctorSidebar();
    } catch (err) {
        console.error("Error toggling holiday:", err);
        alert("操作に失敗しました: " + (err.message || err));
    }
}

async function renderDoctorSidebar() {
    const sidebar = document.getElementById('doctorSidebar');
    if (!sidebar) return;

    sidebar.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const doctors = [
        { id: 'suzuki', name: '鈴木医師', role: '運動器' },
        { id: 'tsukamoto', name: '塚本医師', role: '脳・廃用' }
    ];

    doctors.forEach(dr => {
        const container = document.createElement('div');
        container.className = 'dr-calendar-container';

        const tagClass = dr.id === 'suzuki' ? 'dr-tag-suzuki' : 'dr-tag-tsukamoto';

        container.innerHTML = `
            <div class="dr-calendar-title">
                <span class="${tagClass}">${dr.name}</span>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; margin-left:4px;">(${dr.role})</span>
            </div>
            <div style="font-size:0.6rem; color:#ef4444; margin-bottom:4px;">※クリックで休診日に設定</div>
            <div class="mini-calendar-grid" id="mini-calendar-${dr.id}"></div>
        `;
        sidebar.appendChild(container);

        const grid = container.querySelector('.mini-calendar-grid');

        ['日', '月', '火', '水', '木', '金', '土'].forEach(d => {
            const h = document.createElement('div');
            h.className = 'mini-day-header';
            if (d === '日') h.style.color = '#ef4444';
            h.textContent = d;
            grid.appendChild(h);
        });

        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'mini-day other-month';
            grid.appendChild(empty);
        }

        for (let d = 1; d <= lastDate; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isHoliday = doctorHolidays.some(a => a.dr_name === dr.id && a.attendance_date === dateStr);

            const dayDiv = document.createElement('div');
            dayDiv.className = `mini-day ${isHoliday ? 'holiday-off' : 'attendance-on'}`;
            dayDiv.textContent = d;
            dayDiv.onclick = () => toggleDrHoliday(dr.id, dateStr);
            grid.appendChild(dayDiv);
        }
    });
}
