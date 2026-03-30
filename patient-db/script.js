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

// Helper to format date as YYYY-MM-DD in local time (preventing timezone shift)
const formatLocalDate = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// --- Holiday Support ---
let holidaysData = {};

async function fetchHolidays() {
    try {
        const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
        holidaysData = await response.json();
        console.log("Japanese holidays fetched:", Object.keys(holidaysData).length);
    } catch (err) {
        console.error("Failed to fetch holidays:", err);
    }
}

function isNonWorkingDay(dateStr) {
    const date = new Date(dateStr);
    if (date.getDay() === 0) return true; // Sunday
    if (holidaysData[dateStr]) return true; // Japanese Holiday
    return false;
}

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
 
// State for search and sort
let categoryState = {
    admission: { data: [], filtered: [], sortCol: 'p_id', sortOrder: 'asc', query: '' },
    outpatient: { data: [], filtered: [], sortCol: 'p_id', sortOrder: 'asc', query: '' },
    nursing_care: { data: [], filtered: [], sortCol: 'p_id', sortOrder: 'asc', query: '' }
};
 
function sortCategoryTable(category, column) {
    const state = categoryState[category];
    if (state.sortCol === column) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortCol = column;
        state.sortOrder = 'asc';
    }
    applyCategoryFilterAndSort(category);
}
 
function filterCategoryTable(category) {
    const searchInput = document.getElementById('category-search');
    if (!searchInput) return;
    categoryState[category].query = searchInput.value.toLowerCase();
    applyCategoryFilterAndSort(category);
}
 
function applyCategoryFilterAndSort(category) {
    const state = categoryState[category];
    
    // Filter
    state.filtered = state.data.filter(p => 
        p.p_name.toLowerCase().includes(state.query) || 
        p.p_id.toLowerCase().includes(state.query) || 
        (p.p_disease && p.p_disease.toLowerCase().includes(state.query))
    );
 
    // Sort
    state.filtered.sort((a, b) => {
        let valA = a[state.sortCol] || '';
        let valB = b[state.sortCol] || '';
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
 
        if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
 
    // Re-render
    if (category === 'admission') renderAdmissionTableRows(state.filtered);
    else if (category === 'outpatient') renderOutpatientTableRows(state.filtered);
    else if (category === 'nursing_care') renderNursingCareTableRows(state.filtered);
}

// Initialize Admission Table
async function renderAdmissionTable() {
    admissionTableBody = document.getElementById('patientTableBody');
    if (!admissionTableBody) return;
    admissionTableBody.innerHTML = '';

    const { data: dbPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .eq('p_type', 'admission');
 
    if (error || !dbPatients) return;
    
    categoryState.admission.data = dbPatients;
    applyCategoryFilterAndSort('admission');
}
 
function renderAdmissionTableRows(patients) {
    admissionTableBody = document.getElementById('patientTableBody');
    if (!admissionTableBody) return;
    admissionTableBody.innerHTML = '';
 
    patients.forEach((patient) => {
        let categoryClass = 'tag-unknown';
        if (patient.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.p_category === '廃用') categoryClass = 'tag-disuse';
        else if (patient.p_category === '消炎') categoryClass = 'tag-anti';

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
            <td onclick="event.stopPropagation()">
                <input type="checkbox" ${patient.p_nursing_care ? 'checked' : ''} onchange="toggleNursingCare('${patient.p_id}', this.checked)" style="transform: scale(1.2); cursor: pointer;" title="要介護の切り替え">
            </td>
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
        .eq('p_type', 'nursing_care');
 
    if (error || !dbPatients) return;
 
    categoryState.nursing_care.data = dbPatients;
    applyCategoryFilterAndSort('nursing_care');
}
 
function renderNursingCareTableRows(patients) {
    nursingCareTableBody = document.getElementById('nursingCareTableBody');
    if (!nursingCareTableBody) return;
    nursingCareTableBody.innerHTML = '';
 
    patients.forEach((patient) => {
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
            <td onclick="event.stopPropagation()">
                <input type="checkbox" ${patient.p_nursing_care ? 'checked' : ''} onchange="toggleNursingCare('${patient.p_id}', this.checked)" style="transform: scale(1.2); cursor: pointer;" title="要介護の切り替え">
            </td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteNursingCarePatient('${patient.p_id}')">削除</button>
            </td>
        `;
        nursingCareTableBody.appendChild(tr);
    });
}

// --- Termination Modal Logic ---
function openTerminationModal(dbId, type) {
    let modal = document.getElementById('terminationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'terminationModal';
        modal.className = 'modal';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; padding: 2rem; border-radius: 12px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                <h3 style="margin-top:0; font-size:1.25rem; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; margin-bottom: 1.5rem;" id="termial-modal-title">アーカイブへの移動</h3>
                
                <div style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: #475569;">終了日</label>
                    <input type="date" id="termination-date-input" style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px;">
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <label style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: #475569;">終了理由</label>
                    <select id="termination-reason-input" style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px;">
                        <!-- Options generated dynamically -->
                    </select>
                </div>

                <div style="display:flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.5rem;">
                    <button id="cancel-termination-btn" class="btn secondary" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 600;">キャンセル</button>
                    <button id="confirm-termination-btn" class="btn primary" style="padding: 0.5rem 1rem; border-radius: 6px; background: #ef4444; color: #fff; border: none; font-weight: 600;">移動を実行</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('cancel-termination-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Outside click to close
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // Configure for type
    const titleEl = document.getElementById('termial-modal-title');
    const reasonSelect = document.getElementById('termination-reason-input');
    const dateInput = document.getElementById('termination-date-input');
    const executeBtn = document.getElementById('confirm-termination-btn');

    dateInput.value = formatLocalDate(new Date());
    reasonSelect.innerHTML = '';

    let options = [];
    let archiveType = '';
    let confirmMsg = '';

    if (type === 'admission') {
        titleEl.textContent = '「退院者」としてアーカイブへ移動';
        options = ['死亡退院', '転院', '入所'];
        archiveType = 'archived_admission';
        confirmMsg = '退院処理を実行しますか？';
    } else if (type === 'outpatient') {
        titleEl.textContent = '「外来終了」としてアーカイブへ移動';
        options = ['改善終了', '自己都合', '体調不良', 'その他の項目'];
        archiveType = 'archived_outpatient';
        confirmMsg = '外来終了処理を実行しますか？';
    } else if (type === 'nursing_care') {
        titleEl.textContent = '「介護医療院修了者」としてアーカイブへ移動';
        options = ['死亡退院', '転所', '転院'];
        archiveType = 'archived_nursing_care';
        confirmMsg = '介護医療院の終了処理を実行しますか？';
    }

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        reasonSelect.appendChild(option);
    });

    // Remove old event listener from Execute button and add new one
    const newExecuteBtn = executeBtn.cloneNode(true);
    executeBtn.parentNode.replaceChild(newExecuteBtn, executeBtn);
    
    newExecuteBtn.addEventListener('click', async () => {
        if (!confirm(confirmMsg)) return;

        const termDate = dateInput.value;
        const termReason = reasonSelect.value;
        
        // Fetch patient to update history
        const { data: pData } = await supabaseClient.from('patients').select('p_disease, history').eq('p_id', dbId).single();
        let history = [];
        if (pData && pData.history) {
            history = typeof pData.history === 'string' ? JSON.parse(pData.history) : pData.history;
        }

        history.push({
            date: termDate,
            type: "termination",
            reason: termReason,
            status: "warning",
            note: `[終了処理] 理由: ${termReason}`
        });

        const { error } = await supabaseClient.from('patients').update({
            p_type: archiveType,
            p_termination_date: termDate,
            history: history
        }).eq('p_id', dbId);

        if (error) {
            console.error('Termination error:', error);
            alert('処理に失敗しました: ' + error.message);
            return;
        }

        modal.style.display = 'none';

        if (type === 'admission') {
            if (typeof renderAdmissionTable === 'function') await renderAdmissionTable();
            if (typeof renderDischargedTable === 'function') await renderDischargedTable();
        } else if (type === 'outpatient') {
            if (typeof renderOutpatientTable === 'function') await renderOutpatientTable();
            if (typeof renderTerminatedTable === 'function') await renderTerminatedTable();
        } else if (type === 'nursing_care') {
            if (typeof renderNursingCareTable === 'function') await renderNursingCareTable();
            if (typeof renderNursingCareArchivedTable === 'function') await renderNursingCareArchivedTable();
        }
    });

    modal.style.display = 'flex';
}

// Function to delete an admission patient record (Archive)
async function deleteAdmissionPatient(dbId) {
    openTerminationModal(dbId, 'admission');
}

// Function to delete a nursing care patient record (Archive)
async function deleteNursingCarePatient(dbId) {
    openTerminationModal(dbId, 'nursing_care');
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

    const baseId = dbId.split('-')[0];

    // Fetch all related patient records (e.g. 123, 123-2) to aggregate history
    const { data: relatedPatients, error } = await supabaseClient.from('patients').select('*').like('p_id', `${baseId}%`);
    if (error || !relatedPatients || relatedPatients.length === 0) return;

    const patient = relatedPatients.find(p => p.p_id === dbId) || relatedPatients[0];

    document.getElementById('details-patient-name').textContent = patient.p_name;

    const categoryEl = document.getElementById('details-patient-category');
    if (categoryEl) {
        let categoryClass = 'tag-unknown';
        if (patient.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.p_category === '廃用') categoryClass = 'tag-disuse';
        else if (patient.p_category === '消炎') categoryClass = 'tag-anti';
        categoryEl.innerHTML = `<span class="${categoryClass}">${patient.p_category || '未設定'}</span>`;
    }

    document.getElementById('details-patient-id').textContent = `ID: ${patient.p_id}`;

    // Map and flatten all histories into one combined timeline
    let history = [];
    relatedPatients.forEach(rp => {
        try {
            if (rp.history) {
                let hArray = typeof rp.history === 'string' ? JSON.parse(rp.history) : rp.history;
                // Annotate the disease context so users know which diagnostic line this belongs to
                hArray = hArray.map(item => ({ ...item, _contextDisease: rp.p_disease }));
                history.push(...hArray);
            }
        } catch (e) { }
    });
    
    // Sort descending by date
    history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

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
    if (rateEl) {
        rateEl.textContent = `${cancelRate}%`;
        if (cancelRate >= 30) rateEl.style.color = '#ef4444';
        else if (cancelRate > 0) rateEl.style.color = '#f59e0b';
        else rateEl.style.color = '#10b981';
    }

    const countEl = document.getElementById('details-cancel-count');
    if (countEl) countEl.textContent = `${cancelCount} / ${totalAppointments} 回`;
 
    // Render history table
    const historyBody = document.getElementById('details-history-body');
    if (historyBody) {
        historyBody.innerHTML = '';
 
        if (history.length === 0) {
            historyBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-muted);">履歴はありません</td></tr>`;
        } else {
            history.filter(h => h && h.status !== 'deleted').forEach(h => {
                const tr = document.createElement('tr');
                let statusHtml = '';
                let typeHtml = h.type || '-';
                let timeHtml = h.time || '-';
                let noteHtml = h.cancelReason || h.note || '-';
 
                if (h.type === 'diagnosis_change') {
                    typeHtml = '<span style="color:#2563eb; font-weight:bold;">病名変更</span>';
                    statusHtml = '<span style="background: #eff6ff; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">修正</span>';
                    timeHtml = '-';
                } else {
                    if (h.status === 'arrived') statusHtml = '<span style="background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">来院</span>';
                    else if (h.status === 'completed') statusHtml = '<span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">完了</span>';
                    else if (h.status === 'canceled') statusHtml = '<span style="background: #f3f4f6; color: #6b7280; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">キャンセル</span>';
                    else statusHtml = '<span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">予約中</span>';
                    
                    typeHtml = `${h.type}${h.isWalkIn ? ' <span style="color:#f59e0b; font-weight:bold; font-size:0.75rem;">[予約外]</span>' : ''}`;
                    if (h._contextDisease && h._contextDisease !== patient.p_disease) {
                        typeHtml += ` <span style="font-size:0.7rem; color:#64748b; background:#f1f5f9; padding:1px 4px; border-radius:3px;">${h._contextDisease}への予約</span>`;
                    }
                }
 
                tr.innerHTML = `
                    <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${h.date || '-'}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${timeHtml}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${typeHtml}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${noteHtml}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); text-align: center;">${statusHtml}</td>
                `;
                historyBody.appendChild(tr);
            });
        }
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

window.openPatientEditForm = async function () {
    if (!currentPatientDbId) return;

    // Fetch latest fresh data just to be safe
    const { data: patient, error } = await supabaseClient.from('patients').select('*').eq('p_id', currentPatientDbId).single();
    if (error || !patient) {
        alert('患者データの取得に失敗しました。');
        return;
    }

    // Populate the form fields
    document.getElementById('edit-patient-id').value = patient.p_id || '';
    document.getElementById('edit-patient-name').value = patient.p_name || '';

    const categorySelect = document.getElementById('edit-patient-category');
    if (categorySelect) {
        categorySelect.value = patient.p_category || '';
    }

    document.getElementById('edit-disease-name').value = patient.p_disease || '';
    document.getElementById('edit-diagnosis-date').value = patient.p_diagnosis_date || '';

    const ncCheck = document.getElementById('edit-patient-nursing-care');
    if (ncCheck) {
        ncCheck.checked = !!patient.p_nursing_care;
    }

    // Show the form
    document.getElementById('patient-edit-form').style.display = 'block';
};

window.savePatientBasicInfo = async function () {
    if (!currentPatientDbId) return;

    const p_name = document.getElementById('edit-patient-name').value;
    const p_category = document.getElementById('edit-patient-category') ? document.getElementById('edit-patient-category').value : null;
    const p_disease = document.getElementById('edit-disease-name').value;
    const p_diagnosis_date = document.getElementById('edit-diagnosis-date').value || null;
    const p_nursing_care = document.getElementById('edit-patient-nursing-care') ? document.getElementById('edit-patient-nursing-care').checked : false;

    if (!p_name) {
        alert('氏名は必須です。');
        return;
    }

    const updates = {
        p_name,
        p_disease,
        p_diagnosis_date,
        p_nursing_care
    };

    // If category select exists (admission/outpatient), add to updates
    if (document.getElementById('edit-patient-category')) {
        updates.p_category = p_category;
    }

    try {
        // --- Diagnosis History Tracking ---
        const { data: oldPatient, error: fetchError } = await supabaseClient
            .from('patients')
            .select('p_disease, history')
            .eq('p_id', currentPatientDbId)
            .single();
        
        if (!fetchError && oldPatient) {
            if (oldPatient.p_disease !== p_disease) {
                let history = [];
                if (oldPatient.history) {
                    history = typeof oldPatient.history === 'string' ? JSON.parse(oldPatient.history) : oldPatient.history;
                }
                const changeEntry = {
                    date: formatLocalDate(new Date()),
                    type: "diagnosis_change",
                    old_value: oldPatient.p_disease,
                    new_value: p_disease,
                    status: "info",
                    note: `疾患名を「${oldPatient.p_disease}」から「${p_disease}」に変更`
                };
                history.push(changeEntry);
                updates.history = history;
            }
        }

        const { error } = await supabaseClient
            .from('patients')
            .update(updates)
            .eq('p_id', currentPatientDbId);

        if (error) throw error;

        alert('基本情報を更新しました。');

        // Hide form and refresh modal details
        const editForm = document.getElementById('patient-edit-form');
        if (editForm) editForm.style.display = 'none';
        await openPatientDetails(currentPatientDbId);

        // Refresh the tables in the background based on what page we are on
        if (typeof renderAdmissionTable === 'function' && window.location.pathname.includes('admission.html')) renderAdmissionTable();
        if (typeof renderOutpatientTable === 'function' && window.location.pathname.includes('outpatient.html')) renderOutpatientTable();
        if (typeof renderNursingCareTable === 'function' && window.location.pathname.includes('nursing-care.html')) renderNursingCareTable();

    } catch (err) {
        console.error('Update failed:', err);
        alert('更新に失敗しました: ' + (err.message || err));
    }
}

function calculateDocSubmissionDate(category, nextDate, holidays) {
    if (!nextDate) return null;

    const d = new Date(nextDate);
    
    // Logic for Cerebrovascular (脳血管) or Disuse (廃用)
    if (category.includes('脳血管') || category.includes('廃用')) {
        const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
        if (dayOfWeek <= 2) {
            // Sun, Mon, Tue -> Tuesday of the preceding week
            d.setDate(d.getDate() - dayOfWeek - 5);
        } else {
            // Wed, Thu, Fri, Sat -> Tuesday of the same week
            d.setDate(d.getDate() - dayOfWeek + 2);
        }
    } else {
        // Default logic for others (e.g., Locomotor / 運動器): 2 days before
        d.setDate(d.getDate() - 2);
    }

    let targetDr = null;
    if (category.includes('運動器')) targetDr = 'suzuki';
    else if (category.includes('脳血管') || category.includes('廃用')) targetDr = 'tsukamoto';

    // If no target doctor, return the base calculation (formatted)
    if (!targetDr) return formatLocalDate(d);

    // Check holidays (including Sundays and Japanese Holidays)
    // Go back until we find a work day
    let safetyCounter = 0;
    while (safetyCounter < 30) {
        const dateStr = formatLocalDate(d);
        const isClosed = isNonWorkingDay(dateStr);
        const isDrHoliday = holidays.some(h => h.dr_name === targetDr && h.attendance_date === dateStr);

        if (!isClosed && !isDrHoliday) break;

        d.setDate(d.getDate() - 1);
        safetyCounter++;
    }

    return formatLocalDate(d);
}

async function fetchLatestReserveDate() {
    if (!currentPatientDbId) return;

    const today = formatLocalDate(new Date());

    // Fetch the earliest future reservation that is 'booked'
    const { data: nextRes, error } = await supabaseClient
        .from('reservations')
        .select('res_date')
        .eq('patient_id', currentPatientDbId)
        .eq('status', 'booked')
        .gte('res_date', today)
        .order('res_date', { ascending: true })
        .order('res_time', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Error fetching latest reservation:', error);
        alert('予約情報の取得に失敗しました。');
        return;
    }

    if (nextRes && nextRes.length > 0) {
        const nextDate = nextRes[0].res_date;
        document.getElementById('next-visit-date').value = nextDate;
        alert(`最新の予約日 (${nextDate}) を反映しました。「修正を保存」を押すと確定します。`);
    } else {
        alert('本日以降の有効な予約は見つかりませんでした。');
    }
}

// Function to toggle nursing care status directly from table
async function toggleNursingCare(dbId, isEnabled) {
    const { error } = await supabaseClient.from('patients').update({
        p_nursing_care: isEnabled
    }).eq('p_id', dbId);

    if (error) {
        console.error('Toggle nursing care error:', error);
        alert('要介護の設定変更に失敗しました: ' + error.message);
        await renderAdmissionTable();
        await renderOutpatientTable();
        await renderNursingCareTable();
    }
}

async function saveNextVisit(skipAutoCalc = false) {
    if (!currentPatientDbId) return;
    const nextDate = document.getElementById('next-visit-date').value;
    const nursingCare = document.getElementById('details-nursing-care')?.checked || false;
    const docDateInput = document.getElementById('doc-submission-date');
    const docDate = docDateInput?.value || null;
    const label = document.getElementById('next-visit-label')?.textContent || '次回予定日';

    // Validation
    const validateDate = (dateStr) => {
        if (!dateStr) return true;
        const year = parseInt(dateStr.split('-')[0]);
        return year >= 1900 && year <= 2100;
    };

    if (!validateDate(nextDate) || (docDate && !validateDate(docDate))) {
        alert('入力された日付の年が正しくありません。正しく修正してください。');
        return;
    }

    // Auto-calculate Doc Submission Date if category matches
    const categoryContent = document.getElementById('details-patient-category')?.textContent || '';
    const isMatchingCategory = categoryContent.includes('運動器') || categoryContent.includes('脳血管') || categoryContent.includes('廃用');

    if (!skipAutoCalc && isMatchingCategory && nextDate && !docDate) {
        await fetchDoctorHolidays();
        const autoDate = calculateDocSubmissionDate(categoryContent, nextDate, doctorHolidays);

        if (autoDate && confirm(`カテゴリーに合わせて、書類提出予定日を ${autoDate} に自動設定しますか？`)) {
            document.getElementById('doc-submission-date').value = autoDate;
            saveNextVisit();
            return;
        }
    }

    const { data, error } = await supabaseClient.from('patients').update({
        next_reserve_date: nextDate || null,
        p_nursing_care: nursingCare,
        p_doc_submission_date: docDate || null
    }).eq('p_id', currentPatientDbId);

    if (error) {
        console.error('Save error:', error);
        alert(`保存に失敗しました: ${error.message}`);
        return;
    }

    alert(`${label}および設定を保存しました。`);
    // Refresh tables
    await renderAdmissionTable();
    await renderOutpatientTable();
    await renderNursingCareTable();
    await renderDischargedTable();
    await renderTerminatedTable();
    await renderNursingCareArchivedTable();

    // Refresh calendar if open
    const calendarModal = document.getElementById('calendarModal');
    if (calendarModal && calendarModal.style.display === 'flex') {
        const title = document.getElementById('calendarMonthTitle').textContent;
        if (title.includes('面談予定')) renderMeetingCalendar();
        else if (title.includes('書類提出')) renderDocSubmissionCalendar();
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
        .eq('p_type', 'outpatient');
 
    if (error || !dbPatients) return;
 
    categoryState.outpatient.data = dbPatients;
    applyCategoryFilterAndSort('outpatient');
}
 
function renderOutpatientTableRows(patients) {
    outpatientTableBody = document.getElementById('outpatientTableBody');
    if (!outpatientTableBody) return;
    outpatientTableBody.innerHTML = '';
 
    patients.forEach((op) => {
        let categoryClass = 'tag-unknown';
        if (op.p_category === '運動器') categoryClass = 'tag-locomotor';
        else if (op.p_category === '脳血管') categoryClass = 'tag-cerebro';
        else if (op.p_category === '廃用') categoryClass = 'tag-disuse';
        else if (op.p_category === '消炎') categoryClass = 'tag-anti';

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
            <td onclick="event.stopPropagation()">
                <input type="checkbox" ${op.p_nursing_care ? 'checked' : ''} onchange="toggleNursingCare('${op.p_id}', this.checked)" style="transform: scale(1.2); cursor: pointer;" title="要介護の切り替え">
            </td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteOutpatient('${op.p_id}')">削除</button>
            </td>
        `;
        outpatientTableBody.appendChild(tr);
    });
}

// Function to delete an outpatient record (Archive)
async function deleteOutpatient(dbId) {
    openTerminationModal(dbId, 'outpatient');
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
        else if (p.p_category === '消炎') categoryClass = 'tag-anti';

        const remainingDays = calculateRemainingDays(p.p_diagnosis_date, p.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        let termReason = '-';
        if (p.history) {
            const histArray = typeof p.history === 'string' ? JSON.parse(p.history) : p.history;
            const termEntry = [...histArray].reverse().find(h => h.type === 'termination');
            if (termEntry && termEntry.reason) termReason = termEntry.reason;
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
            <td><span style="background: #fef08a; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #854d0e;">${termReason}</span></td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreAdmission('${p.p_id}')">復元</button>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #b91c1c; margin-left: 0.25rem;" onclick="permanentDeletePatient('${p.p_id}', 'archived_admission')">削除</button>
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
        else if (p.p_category === '消炎') categoryClass = 'tag-anti';

        const remainingDays = calculateRemainingDays(p.p_diagnosis_date, p.p_category);
        let remainingHtml = '<span style="color:var(--text-muted);">-</span>';
        if (remainingDays !== null) {
            const color = remainingDays <= 10 ? '#ef4444' : 'inherit';
            const weight = remainingDays <= 10 ? 'bold' : 'normal';
            remainingHtml = `<span style="color: ${color}; font-weight: ${weight};">${remainingDays}日</span>`;
        }

        let termReason = '-';
        if (p.history) {
            const histArray = typeof p.history === 'string' ? JSON.parse(p.history) : p.history;
            const termEntry = [...histArray].reverse().find(h => h.type === 'termination');
            if (termEntry && termEntry.reason) termReason = termEntry.reason;
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
            <td><span style="background: #fef08a; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #854d0e;">${termReason}</span></td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreOutpatient('${p.p_id}')">復元</button>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #b91c1c; margin-left: 0.25rem;" onclick="permanentDeletePatient('${p.p_id}', 'archived_outpatient')">削除</button>
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
        let termReason = '-';
        if (p.history) {
            const histArray = typeof p.history === 'string' ? JSON.parse(p.history) : p.history;
            const termEntry = [...histArray].reverse().find(h => h.type === 'termination');
            if (termEntry && termEntry.reason) termReason = termEntry.reason;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td><span class="tag-type-admission" style="background:#ede9fe; color:#6d28d9;">介護医療院</span></td>
            <td>${p.p_disease}</td>
            <td>${p.p_diagnosis_date}</td>
            <td>${p.p_nursing_care ? '<span class="tag-nursing-care">あり</span>' : '<span style="color:var(--text-muted);">-</span>'}</td>
            <td>${p.p_termination_date || '-'}</td>
            <td><span style="background: #fef08a; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #854d0e;">${termReason}</span></td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreNursingCare('${p.p_id}')">復元</button>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #fee2e2; color: #b91c1c; margin-left: 0.25rem;" onclick="permanentDeletePatient('${p.p_id}', 'archived_nursing_care')">削除</button>
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

async function permanentDeletePatient(dbId, type) {
    if (!confirm('データを完全に削除しますか？この操作は取り消せません。')) return;

    const { error } = await supabaseClient
        .from('patients')
        .delete()
        .eq('p_id', dbId);

    if (error) {
        console.error('Delete error:', error);
        alert('削除に失敗しました: ' + error.message);
        return;
    }

    if (type === 'archived_admission') await renderDischargedTable();
    else if (type === 'archived_outpatient') await renderTerminatedTable();
    else if (type === 'archived_nursing_care') await renderNursingCareArchivedTable();

    alert('データを完全に削除しました。');
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
    await fetchHolidays();
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
    await renderHomeDashboard();
    await renderAllPatientsPage();

    // Refresh Button Logic
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('rotating');
            await renderAdmissionTable();
            await renderOutpatientTable();
            await renderNursingCareTable();
            await renderDischargedTable();
            await renderTerminatedTable();
            await renderNursingCareArchivedTable();
            await renderHomeDashboard();
            await renderAllPatientsPage();
            setTimeout(() => refreshBtn.classList.remove('rotating'), 500);
            console.log('Patient records refreshed.');
        });
    }

    // Excel Import Logic
    const excelImportInput = document.getElementById('excel-import');
    if (excelImportInput) {
        excelImportInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = async (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        alert('読み込めるデータが見つかりませんでした。');
                        return;
                    }

                    // Determine current page type
                    let currentPageType = 'admission';
                    if (document.getElementById('outpatientTableBody')) currentPageType = 'outpatient';
                    else if (document.getElementById('nursingCareTableBody')) currentPageType = 'nursing_care';
                    else if (document.getElementById('archivedAdmissionTableBody')) currentPageType = 'archived_admission';
                    else if (document.getElementById('archivedOutpatientTableBody')) currentPageType = 'archived_outpatient';
                    else if (document.getElementById('archivedNursingCareTableBody')) currentPageType = 'archived_nursing_care';

                    const patientsToUpsert = jsonData.map(row => {
                        // Find keys by keywords (flexible matching)
                        const findKey = (keywords) => {
                            const keys = Object.keys(row);
                            // 優先度1: 完全一致
                            let found = keys.find(k => keywords.includes(String(k).trim()));
                            if (found) return found;
                            // 優先度2: 部分一致（より具体的なものを優先するため、キーワードリストの順序を考慮）
                            for (const kw of keywords) {
                                let partial = keys.find(k => String(k).includes(kw));
                                if (partial) return partial;
                            }
                            return null;
                        };

                        const idKey = findKey(['ID', '患者ID', '利用者ID']) || 'p_id';
                        const nameKey = findKey(['名前', '氏名', '患者名', '利用者名']) || 'p_name';
                        const categoryKey = findKey(['疾患種別', 'カテゴリ', '種別']) || 'p_category';
                        const diseaseKey = findKey(['疾患名', '病名', '診断名', '疾患']) || 'p_disease';
                        const diagDateKey = findKey(['診断日', '発症日']) || 'p_diagnosis_date';
                        const nursingCareKey = findKey(['要介護', '介護']) || 'p_nursing_care';

                        // Format date if it's a serial number from Excel
                        let diagDate = row[diagDateKey];
                        if (typeof diagDate === 'number') {
                            diagDate = XLSX.SSF.format('yyyy-mm-dd', diagDate);
                        }

                        // Nursing Care boolean check
                        const ncVal = row[nursingCareKey];
                        const isNursingCare = ncVal === 'あり' || ncVal === '有り' || ncVal === true || ncVal === 1 || ncVal === '1';

                        return {
                            p_id: toHalfWidth(String(row[idKey] || '')).trim(),
                            p_name: String(row[nameKey] || '').trim(),
                            p_type: currentPageType,
                            p_category: row[categoryKey] || null,
                            p_disease: row[diseaseKey] || '',
                            p_diagnosis_date: diagDate || null,
                            p_nursing_care: isNursingCare
                        };
                    }).filter(p => p.p_id && p.p_name);

                    if (patientsToUpsert.length === 0) {
                        alert('有効な形式のデータが見つかりませんでした（IDと名前が必須です）。');
                        return;
                    }

                    // --- Smart ID Suffixing for Multiple Diagnoses ---
                    const { data: allDb } = await supabaseClient.from('patients').select('p_id, p_disease, p_nursing_care, history');
                    const dbMap = new Map();
                    if (allDb) allDb.forEach(ep => dbMap.set(ep.p_id, ep));

                    let finalUpsertList = [];
                    let internalMap = new Map();

                    for (let p of patientsToUpsert) {
                        let baseId = String(p.p_id).split('-')[0];
                        let disease = String(p.p_disease || '').trim();
                        
                        let targetId = baseId;
                        let suffixCounter = 2;
                        
                        while(true) {
                            let existing = dbMap.get(targetId) || internalMap.get(targetId);
                            if (!existing) break; // ID is totally free
                            if (String(existing.p_disease || '').trim() === disease) break; // Same ID AND same disease -> overwrite safely
                            // Conflict! Same ID but DIFFERENT disease -> allocate a new suffix pointer
                            targetId = `${baseId}-${suffixCounter}`;
                            suffixCounter++;
                        }
                        
                        p.p_id = targetId;
                        
                        let ep = dbMap.get(targetId);
                        if (ep) {
                            if (ep.p_nursing_care === true) p.p_nursing_care = true;
                            p.history = ep.history; 
                        }
                        
                        internalMap.set(targetId, p);
                        finalUpsertList.push(p);
                    }
                    
                    patientsToUpsert = finalUpsertList;
                    // ----------------------------------------------------------------------------

                    if (confirm(`${patientsToUpsert.length} 件のデータをインポート（新規登録・上書き）しますか？`)) {
                        const { error } = await supabaseClient.from('patients').upsert(patientsToUpsert, { onConflict: 'p_id' });
                        if (error) {
                            console.error('Import error:', error);
                            alert('インポートに失敗しました: ' + error.message);
                        } else {
                            alert('インポートが完了しました。');
                            // Refresh tables
                            if (currentPageType === 'admission') await renderAdmissionTable();
                            else if (currentPageType === 'outpatient') await renderOutpatientTable();
                            else if (currentPageType === 'nursing_care') await renderNursingCareTable();
                            else if (currentPageType === 'archived_admission') await renderDischargedTable();
                            else if (currentPageType === 'archived_outpatient') await renderTerminatedTable();
                            else if (currentPageType === 'archived_nursing_care') await renderNursingCareArchivedTable();
                        }
                    }

                    excelImportInput.value = '';
                } catch (error) {
                    console.error('Error reading Excel file:', error);
                    alert('エラー詳細: ' + (error.stack || error.message || error) + '\n\nExcelファイルの読み込みに失敗しました。対応しているファイル形式（.xlsx, .xls）か確認してください。');
                }
            };

            reader.onerror = () => {
                alert('ファイルの読み込み中にエラーが発生しました。');
            };

            reader.readAsArrayBuffer(file);
        });
    }
} // End of initApp()

// --- Home Dashboard Logic ---
async function renderHomeDashboard() {
    const statsAdmission = document.getElementById('count-admission');
    if (!statsAdmission) return;

    // Fetch all patients for stats and table
    const { data: allPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .order('p_id', { ascending: true });

    if (error) {
        console.error('Home Dashboard Fetch Error:', error);
        return;
    }

    // Update Stats
    const admissionCount = allPatients.filter(p => p.p_type === 'admission').length;
    const outpatientCount = allPatients.filter(p => p.p_type === 'outpatient').length;
    const nursingCount = allPatients.filter(p => p.p_type === 'nursing_care').length;
    
    document.getElementById('count-admission').textContent = admissionCount;
    document.getElementById('count-outpatient').textContent = outpatientCount;
    document.getElementById('count-nursing').textContent = nursingCount;

    // Fetch today's reservations (simplified)
    const todayStr = formatLocalDate(new Date());
    const { count: todayCount } = await supabaseClient
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('res_date', todayStr);
    
    document.getElementById('count-today-res').textContent = todayCount || 0;

    // Render Table
    renderBasicDataTable(allPatients);

    // Global Search Listener
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase();
            const filtered = allPatients.filter(p => 
                p.p_name.toLowerCase().includes(query) || 
                p.p_id.toLowerCase().includes(query) || 
                (p.p_disease && p.p_disease.toLowerCase().includes(query))
            );
            renderBasicDataTable(filtered);
        };
    }
}

async function renderAllPatientsPage() {
    // Only run on all-patients.html
    const tbody = document.getElementById('basicPatientTableBody');
    if (!tbody || window.location.pathname.indexOf('all-patients.html') === -1) return;

    // Fetch all patients
    const { data: allPatients, error } = await supabaseClient
        .from('patients')
        .select('*')
        .order('p_id', { ascending: true });

    if (error) {
        console.error('All Patients Fetch Error:', error);
        return;
    }

    renderBasicDataTable(allPatients);

    // Global Search Listener (Specific to this page)
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.oninput = () => {
            const query = searchInput.value.toLowerCase();
            const filtered = allPatients.filter(p => 
                p.p_name.toLowerCase().includes(query) || 
                p.p_id.toLowerCase().includes(query) || 
                (p.p_disease && p.p_disease.toLowerCase().includes(query))
            );
            renderBasicDataTable(filtered);
        };
    }
}

function renderBasicDataTable(patients) {
    const tbody = document.getElementById('basicPatientTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    patients.forEach(p => {
        let typeBadge = '';
        if (p.p_type === 'admission') typeBadge = '<span class="tag-type-admission">入院</span>';
        else if (p.p_type === 'outpatient') typeBadge = '<span class="tag-type-outpatient">外来</span>';
        else if (p.p_type === 'nursing_care') typeBadge = '<span class="tag-type-admission" style="background:#ede9fe; color:#6d28d9;">介護</span>';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => openPatientDetails(p.p_id);
        tr.innerHTML = `
            <td><strong>${p.p_id}</strong></td>
            <td>${p.p_name}</td>
            <td>${typeBadge}</td>
            <td>${p.p_category || '-'}</td>
            <td><span style="font-size: 0.85rem;">${p.p_disease || '-'}</span></td>
            <td>${p.next_reserve_date || '-'}</td>
            <td>${p.p_doc_submission_date || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleBasicDataTable() {
    const container = document.getElementById('basic-data-container');
    const btn = document.getElementById('toggle-list-btn');
    if (!container || !btn) return;

    if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.textContent = '一覧を閉じる';
        btn.style.backgroundColor = '#64748b'; // secondary style
    } else {
        container.style.display = 'none';
        btn.textContent = '全患者データを表示';
        btn.style.backgroundColor = 'var(--primary-color)'; // primary style
    }
}

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

    // Fill current month's days
    const currentMonthDays = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dayDiv.innerHTML = `<span class="day-number">${d}</span>`;
        dayDiv.dataset.date = dateStr;

        // --- Apply holiday marking ---
        if (isNonWorkingDay(dateStr)) {
            dayDiv.classList.add('is-non-working-day');
        }

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
        .select('p_id, p_name, next_reserve_date, p_category, p_type, history')
        .not('next_reserve_date', 'is', null)
        .neq('p_type', 'outpatient');

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
                meetingsByDate[d].push({
                    id: p.p_id,
                    name: p.p_name,
                    category: p.p_category,
                    type: p.p_type,
                    date: d,
                    history: p.history
                });
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
            meetingsByDate[dateStr].forEach(info => {
                const event = document.createElement('div');
                event.className = 'calendar-event';

                // 色分けクラスの付与
                if (info.type === 'nursing_care') {
                    event.classList.add('event-nursing');
                } else if (info.category === '運動器') {
                    event.classList.add('event-locomotor');
                } else if (info.category === '脳血管') {
                    event.classList.add('event-cerebro');
                } else if (info.category === '廃用') {
                    event.classList.add('event-disuse');
                }

                // 完了状態のチェック
                let historyArr = [];
                try {
                    if (info.history) {
                        historyArr = typeof info.history === 'string' ? JSON.parse(info.history) : info.history;
                    }
                } catch (e) { }

                const isCompleted = historyArr.some(h => h.date === dateStr && h.type === '面談' && h.status === 'completed');

                if (isCompleted) {
                    event.classList.add('event-completed');
                }

                // 名前部分
                const nameSpan = document.createElement('span');
                nameSpan.textContent = info.name;
                nameSpan.style.flex = "1";
                nameSpan.style.overflow = "hidden";
                nameSpan.style.textOverflow = "ellipsis";
                event.appendChild(nameSpan);

                // ボタン制御
                const doneBtn = document.createElement('button');
                doneBtn.className = 'event-complete-btn';

                if (isCompleted) {
                    doneBtn.textContent = '取消';
                    doneBtn.title = '面談の完了を取り消す';
                    doneBtn.onclick = (e) => {
                        e.stopPropagation();
                        revertMeeting(info.id, info.date);
                    };
                } else {
                    doneBtn.textContent = '済';
                    doneBtn.title = '面談を終了して履歴に追加';
                    doneBtn.onclick = (e) => {
                        e.stopPropagation();
                        completeMeeting(info.id, info.date);
                    };
                }
                event.appendChild(doneBtn);

                dayDiv.appendChild(event);
            });
        }
    });

    // Render Doctor Sidebar
    await fetchDoctorHolidays();
    renderDoctorSidebar();
}

/**
 * 面談を終了し、履歴に追加する
 */
async function completeMeeting(patientId, date) {
    if (!confirm('面談を終了し、履歴に追加しますか？')) return;

    try {
        // 現在の履歴を取得
        const { data: patient, error: fetchError } = await supabaseClient
            .from('patients')
            .select('p_name, history')
            .eq('p_id', patientId)
            .single();

        if (fetchError) throw fetchError;

        let history = [];
        if (patient.history) {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : patient.history;
        }

        // 新しい履歴エントリを追加
        const newEntry = {
            date: date,
            time: "面談",
            type: "面談",
            status: "completed",
            note: "面談終了"
        };
        history.push(newEntry);

        // 患者データを更新（履歴追加：日付はクリアせず維持）
        const { error: updateError } = await supabaseClient
            .from('patients')
            .update({
                history: history
            })
            .eq('p_id', patientId);

        if (updateError) throw updateError;

        alert(`${patient.p_name}様の面談を終了し、履歴に追加しました。`);

        // カレンダーを再描画
        await renderMeetingCalendar();
    } catch (err) {
        console.error('Error completing meeting:', err);
        alert('エラーが発生しました: ' + err.message);
    }
}

/**
 * 面談の完了を取り消し、履歴から削除する
 */
async function revertMeeting(patientId, date) {
    if (!confirm('面談の完了を取り消しますか？')) return;

    try {
        // 現在の履歴を取得
        const { data: patient, error: fetchError } = await supabaseClient
            .from('patients')
            .select('p_name, history')
            .eq('p_id', patientId)
            .single();

        if (fetchError) throw fetchError;

        let history = [];
        if (patient.history) {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : patient.history;
        }

        // 該当日の完了履歴を削除
        const newHistory = history.filter(h => !(h.date === date && h.type === '面談' && h.status === 'completed'));

        // 患者データを更新
        const { error: updateError } = await supabaseClient
            .from('patients')
            .update({
                history: newHistory
            })
            .eq('p_id', patientId);

        if (updateError) throw updateError;

        alert(`${patient.p_name}様の面談完了を取り消しました。`);

        // カレンダーを再描画
        await renderMeetingCalendar();
    } catch (err) {
        console.error('Error reverting meeting:', err);
        alert('エラーが発生しました: ' + err.message);
    }
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

        // --- Apply holiday marking ---
        if (isNonWorkingDay(dateStr)) {
            dayDiv.classList.add('is-non-working-day');
        }

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
        .select('p_id, p_name, p_doc_submission_date, p_category, p_type, history')
        .not('p_doc_submission_date', 'is', null)
        .neq('p_type', 'outpatient');

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
                docsByDate[d].push({
                    id: p.p_id,
                    name: p.p_name,
                    category: p.p_category,
                    type: p.p_type,
                    date: d,
                    history: p.history
                });
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
            docsByDate[dateStr].forEach(info => {
                const event = document.createElement('div');
                event.className = 'calendar-event';

                // 色分けクラスの付与
                if (info.type === 'nursing_care') {
                    event.classList.add('event-nursing');
                } else if (info.category === '運動器') {
                    event.classList.add('event-locomotor');
                } else if (info.category === '脳血管') {
                    event.classList.add('event-cerebro');
                } else if (info.category === '廃用') {
                    event.classList.add('event-disuse');
                }

                // 完了状態のチェック
                let historyArr = [];
                try {
                    if (info.history) {
                        historyArr = typeof info.history === 'string' ? JSON.parse(info.history) : info.history;
                    }
                } catch (e) { }

                const isCompleted = historyArr.some(h => h.date === dateStr && h.type === '書類提出' && h.status === 'completed');

                if (isCompleted) {
                    event.classList.add('event-completed');
                }

                // 名前部分
                const nameSpan = document.createElement('span');
                nameSpan.textContent = info.name;
                nameSpan.style.flex = "1";
                nameSpan.style.overflow = "hidden";
                nameSpan.style.textOverflow = "ellipsis";
                event.appendChild(nameSpan);

                // ボタン制御
                const doneBtn = document.createElement('button');
                doneBtn.className = 'event-complete-btn';

                if (isCompleted) {
                    doneBtn.textContent = '取消';
                    doneBtn.title = '書類提出の完了を取り消す';
                    doneBtn.onclick = (e) => {
                        e.stopPropagation();
                        revertDocSubmission(info.id, info.date);
                    };
                } else {
                    doneBtn.textContent = '済';
                    doneBtn.title = '書類提出を終了して履歴に追加';
                    doneBtn.onclick = (e) => {
                        e.stopPropagation();
                        completeDocSubmission(info.id, info.date);
                    };
                }
                event.appendChild(doneBtn);

                dayDiv.appendChild(event);
            });
        }
    });

    // Render Doctor Sidebar
    await fetchDoctorHolidays();
    renderDoctorSidebar();
}

/**
 * 書類提出を終了し、履歴に追加する
 */
async function completeDocSubmission(patientId, date) {
    if (!confirm('書類提出を終了し、履歴に追加しますか？')) return;

    try {
        const { data: patient, error: fetchError } = await supabaseClient
            .from('patients')
            .select('p_name, history')
            .eq('p_id', patientId)
            .single();

        if (fetchError) throw fetchError;

        let history = [];
        if (patient.history) {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : patient.history;
        }

        const newEntry = {
            date: date,
            time: "書類提出",
            type: "書類提出",
            status: "completed",
            note: "書類提出終了"
        };
        history.push(newEntry);

        const { error: updateError } = await supabaseClient
            .from('patients')
            .update({ history: history })
            .eq('p_id', patientId);

        if (updateError) throw updateError;

        alert(`${patient.p_name}様の書類提出を終了し、履歴に追加しました。`);
        await renderDocSubmissionCalendar();
    } catch (err) {
        console.error('Error completing document submission:', err);
        alert('エラーが発生しました: ' + err.message);
    }
}

/**
 * 書類提出の完了を取り消し、履歴から削除する
 */
async function revertDocSubmission(patientId, date) {
    if (!confirm('書類提出の完了を取り消しますか？')) return;

    try {
        const { data: patient, error: fetchError } = await supabaseClient
            .from('patients')
            .select('p_name, history')
            .eq('p_id', patientId)
            .single();

        if (fetchError) throw fetchError;

        let history = [];
        if (patient.history) {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : patient.history;
        }

        const newHistory = history.filter(h => !(h.date === date && h.type === '書類提出' && h.status === 'completed'));

        const { error: updateError } = await supabaseClient
            .from('patients')
            .update({ history: newHistory })
            .eq('p_id', patientId);

        if (updateError) throw updateError;

        alert(`${patient.p_name}様の書類提出完了を取り消しました。`);
        await renderDocSubmissionCalendar();
    } catch (err) {
        console.error('Error reverting document submission:', err);
        alert('エラーが発生しました: ' + err.message);
    }
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

        // Fetch refreshed holidays
        await fetchDoctorHolidays();
        renderDoctorSidebar();

        // --- Auto-sync affected patients' doc submission dates ---
        const affectedCategories = drId === 'suzuki' ? ['運動器'] : ['脳血管', '廃用'];

        // Fetch all patients in affected categories with a next_reserve_date
        const { data: patients, error: pError } = await supabaseClient
            .from('patients')
            .select('p_id, p_category, next_reserve_date, p_doc_submission_date')
            .in('p_category', affectedCategories)
            .not('next_reserve_date', 'is', null);

        if (!pError && patients) {
            for (const p of patients) {
                const newDocDate = calculateDocSubmissionDate(p.p_category, p.next_reserve_date, doctorHolidays);
                if (newDocDate !== p.p_doc_submission_date) {
                    await supabaseClient.from('patients').update({ p_doc_submission_date: newDocDate }).eq('p_id', p.p_id);
                }
            }
            // Refresh tables to show updated dates
            await renderAdmissionTable();
            await renderOutpatientTable();
            await renderNursingCareTable();
        }

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
