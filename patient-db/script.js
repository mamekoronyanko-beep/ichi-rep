// --- Supabase Configuration ---
const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Utility to convert full-width alphanumeric to half-width
const toHalfWidth = (str) => {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/ー/g, '-');
};

const admissionTableBody = document.getElementById('patientTableBody');
const outpatientTableBody = document.getElementById('outpatientTableBody');
const archivedAdmissionTableBody = document.getElementById('archivedAdmissionTableBody');
const archivedOutpatientTableBody = document.getElementById('archivedOutpatientTableBody');

const addAdmissionModal = document.getElementById('addModal');
const addAdmissionForm = document.getElementById('addPatientForm');
const addOutpatientModal = document.getElementById('addOutpatientModal');
const addOutpatientForm = document.getElementById('addOutpatientForm');

// Initialize Admission Table
async function renderAdmissionTable() {
    if (!admissionTableBody) return;
    admissionTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabase
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

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails('${patient.id}')"><strong>${patient.p_id}</strong></td>
            <td onclick="openPatientDetails('${patient.id}')">${patient.p_name}</td>
            <td onclick="openPatientDetails('${patient.id}')"><span class="tag-type-admission">入院</span></td>
            <td onclick="openPatientDetails('${patient.id}')"><span class="${categoryClass}">${patient.p_category || '未設定'}</span></td>
            <td onclick="openPatientDetails('${patient.id}')"><span style="background: #e1f5fe; color: #0277bd; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${patient.p_disease}</span></td>
            <td onclick="openPatientDetails('${patient.id}')">${patient.p_diagnosis_date}</td>
            <td onclick="openPatientDetails('${patient.id}')">${patient.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteAdmissionPatient('${patient.id}')">削除</button>
            </td>
        `;
        admissionTableBody.appendChild(tr);
    });
}

// Function to delete an admission patient record (Archive)
async function deleteAdmissionPatient(dbId) {
    if (confirm('この患者データを「退院者」としてアーカイブへ移動しますか？')) {
        const dischargeDate = new Date().toLocaleDateString('ja-JP');
        await supabase.from('patients').update({ 
            p_type: 'archived_admission',
            p_termination_date: dischargeDate 
        }).eq('id', dbId);
        await renderAdmissionTable();
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

    const { data: patient, error } = await supabase.from('patients').select('*').eq('id', dbId).single();
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
    modal.style.display = 'flex';
}

async function saveNextVisit() {
    if (!currentPatientDbId) return;
    const nextDate = document.getElementById('next-visit-date').value;
    await supabase.from('patients').update({ next_reserve_date: nextDate }).eq('id', currentPatientDbId);
    alert('次回リハ予約日を保存しました。');
    // Refresh relevant table
    await renderAdmissionTable();
    await renderOutpatientTable();
}

// Initialize Outpatient Table
async function renderOutpatientTable() {
    if (!outpatientTableBody) return;
    outpatientTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabase
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

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails('${op.id}')"><strong>${op.p_id}</strong></td>
            <td onclick="openPatientDetails('${op.id}')">${op.p_name}</td>
            <td onclick="openPatientDetails('${op.id}')"><span class="tag-type-outpatient">外来</span></td>
            <td onclick="openPatientDetails('${op.id}')"><span class="${categoryClass}">${op.p_category || '未設定'}</span></td>
            <td onclick="openPatientDetails('${op.id}')"><span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${op.p_disease}</span></td>
            <td onclick="openPatientDetails('${op.id}')">${op.p_diagnosis_date}</td>
            <td onclick="openPatientDetails('${op.id}')">${op.next_reserve_date || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteOutpatient('${op.id}')">削除</button>
            </td>
        `;
        outpatientTableBody.appendChild(tr);
    });
}

// Function to delete an outpatient record (Archive)
async function deleteOutpatient(dbId) {
    if (confirm('この外来データを「外来終了」としてアーカイブへ移動しますか？')) {
        const terminationDate = new Date().toLocaleDateString('ja-JP');
        await supabase.from('patients').update({ 
            p_type: 'archived_outpatient',
            p_termination_date: terminationDate 
        }).eq('id', dbId);
        await renderOutpatientTable();
    }
}


// Handle form submission to add new admission patient
if (addAdmissionForm) {
    addAdmissionForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const newPatient = {
            p_id: toHalfWidth(document.getElementById('patientId').value),
            p_name: document.getElementById('patientName').value,
            p_type: 'admission',
            p_category: document.getElementById('patientCategory').value,
            p_disease: document.getElementById('diseaseName').value,
            p_diagnosis_date: document.getElementById('diagnosisDate').value
        };

        const { error } = await supabase.from('patients').insert([newPatient]);
        if (error) {
            console.error(error);
            alert("保存に失敗しました。");
            return;
        }

        await renderAdmissionTable();
        addAdmissionForm.reset();
        addAdmissionModal.style.display = 'none';
    });
}

// Handle form submission to add new outpatient
if (addOutpatientForm) {
    addOutpatientForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const newOp = {
            p_id: toHalfWidth(document.getElementById('opPatientId').value),
            p_name: document.getElementById('opPatientName').value,
            p_type: 'outpatient',
            p_category: document.getElementById('opPatientCategory').value,
            p_disease: document.getElementById('opDiseaseName').value,
            p_diagnosis_date: document.getElementById('opVisitDate').value
        };

        const { error } = await supabase.from('patients').insert([newOp]);
        if (error) {
            console.error(error);
            alert("保存に失敗しました。");
            return;
        }

        await renderOutpatientTable();
        addOutpatientForm.reset();
        addOutpatientModal.style.display = 'none';
    });
}

// Archive Table Rendering
async function renderDischargedTable() {
    if (!archivedAdmissionTableBody) return;
    archivedAdmissionTableBody.innerHTML = '';

    const { data: dbPatients } = await supabase
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-admission">入院</span></td>
            <td><span class="${categoryClass}">${p.p_category || '未設定'}</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreAdmission('${p.id}')">復元</button>
            </td>
        `;
        archivedAdmissionTableBody.appendChild(tr);
    });
}

async function renderTerminatedTable() {
    if (!archivedOutpatientTableBody) return;
    archivedOutpatientTableBody.innerHTML = '';

    const { data: dbPatients } = await supabase
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-outpatient">外来</span></td>
            <td><span class="${categoryClass}">${p.p_category || '未設定'}</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreOutpatient('${p.id}')">復元</button>
            </td>
        `;
        archivedOutpatientTableBody.appendChild(tr);
    });
}

async function restoreAdmission(dbId) {
    await supabase.from('patients').update({ p_type: 'admission', p_termination_date: null }).eq('id', dbId);
    await renderDischargedTable();
    await renderAdmissionTable();
    alert('入院患者リストに復元しました。');
}

async function restoreOutpatient(dbId) {
    await supabase.from('patients').update({ p_type: 'outpatient', p_termination_date: null }).eq('id', dbId);
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
}

// Initial render
document.addEventListener('DOMContentLoaded', async () => {
    // --- Auto Migration if Opened from Patient DB ---
    const migrateDataToSupabase = async () => {
        const isMigrated = localStorage.getItem('supabase_migrated_v2');
        if (isMigrated) return;

        const admission = JSON.parse(localStorage.getItem('admissionPatients')) || [];
        const outpatient = JSON.parse(localStorage.getItem('outpatientPatients')) || [];
        const allPatients = [...admission, ...outpatient];
        
        const patientsToMigrate = allPatients.map(p => ({
            p_id: p.id,
            p_name: p.name,
            p_type: p.type || (admission.includes(p) ? 'admission' : 'outpatient'),
            p_disease: p.disease,
            p_diagnosis_date: p.date ? p.date : null,
            p_category: p.category,
            next_reserve_date: p.next_reserve_date ? p.next_reserve_date : null,
            history: p.history || []
        }));

        if (patientsToMigrate.length > 0) {
            const { error } = await supabase.from('patients').upsert(patientsToMigrate);
            if (error) console.error('Patient migration error:', error);
        }

        // Migrate Staff Names (Just in case)
        const staffNames = JSON.parse(localStorage.getItem('staffNames'));
        if (staffNames) {
            try {
                await supabase.from('staff_settings').upsert(staffNames.map((name, i) => ({ id: i + 1, name: name, attendance: 'work' })));
            } catch (e) {}
        }
        
        localStorage.setItem('supabase_migrated_v2', 'true');
    };
    
    await migrateDataToSupabase();

    // Render Tables
    await renderAdmissionTable();
    await renderOutpatientTable();
    await renderDischargedTable();
    await renderTerminatedTable();

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
});
