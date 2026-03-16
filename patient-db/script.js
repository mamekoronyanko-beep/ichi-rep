// Sample initial data for Admission
let admissionPatients = JSON.parse(localStorage.getItem('admissionPatients')) || [
    { id: '1001', name: '山田 太郎', category: '廃用', disease: '肺炎', date: '2026-03-01' },
    { id: '1002', name: '佐藤 花子', category: '運動器', disease: '大腿骨骨折', date: '2026-03-05' },
    { id: '1003', name: '鈴木 一郎', category: '脳血管', disease: '脳梗塞', date: '2026-03-08' }
];

// Sample initial data for Outpatient
let outpatientPatients = JSON.parse(localStorage.getItem('outpatientPatients')) || [
    { id: 'OP-2001', name: '田中 誠', category: '脳血管', disease: '脳出血後遺症', date: '2026-03-02' },
    { id: 'OP-2002', name: '高橋 涼子', category: '運動器', disease: '変形性膝関節症', date: '2026-03-06' }
];

// Archived Data
let dischargedPatients = JSON.parse(localStorage.getItem('dischargedPatients')) || [];
let terminatedOutpatients = JSON.parse(localStorage.getItem('terminatedOutpatients')) || [];

// Utility to convert full-width alphanumeric to half-width
const toHalfWidth = (str) => {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/ー/g, '-');
};

const savePatientDB = () => {
    localStorage.setItem('admissionPatients', JSON.stringify(admissionPatients));
    localStorage.setItem('outpatientPatients', JSON.stringify(outpatientPatients));
    localStorage.setItem('dischargedPatients', JSON.stringify(dischargedPatients));
    localStorage.setItem('terminatedOutpatients', JSON.stringify(terminatedOutpatients));
};

// Migration: Convert all existing IDs to half-width
const migrateIdsToHalfWidth = () => {
    let changed = false;
    admissionPatients.forEach(p => {
        const hId = toHalfWidth(p.id);
        if (p.id !== hId) {
            p.id = hId;
            changed = true;
        }
    });
    outpatientPatients.forEach(p => {
        const hId = toHalfWidth(p.id);
        if (p.id !== hId) {
            p.id = hId;
            changed = true;
        }
    });
    if (changed) {
        savePatientDB();
        console.log('Patient IDs migrated to half-width.');
    }
};

// Initial save and migration
migrateIdsToHalfWidth();
savePatientDB();

const admissionTableBody = document.getElementById('patientTableBody');
const addAdmissionModal = document.getElementById('addModal');
const addAdmissionForm = document.getElementById('addPatientForm');

const outpatientTableBody = document.getElementById('outpatientTableBody');
const addOutpatientModal = document.getElementById('addOutpatientModal');
const addOutpatientForm = document.getElementById('addOutpatientForm');

// Initialize Admission Table
function renderAdmissionTable() {
    if (!admissionTableBody) return;

    // Filter to ensure only admission data is shown (even if mixed)
    const filteredAdmission = admissionPatients.filter(p => !p.type || p.type === 'admission');

    filteredAdmission.forEach((patient, index) => {
        let categoryClass = 'tag-unknown';
        if (patient.category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.category === '廃用') categoryClass = 'tag-disuse';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails(${index}, 'admission')"><strong>${patient.id}</strong></td>
            <td onclick="openPatientDetails(${index}, 'admission')">${patient.name}</td>
            <td onclick="openPatientDetails(${index}, 'admission')"><span class="tag-type-admission">入院</span></td>
            <td onclick="openPatientDetails(${index}, 'admission')"><span class="${categoryClass}">${patient.category || '未設定'}</span></td>
            <td onclick="openPatientDetails(${index}, 'admission')"><span style="background: #e1f5fe; color: #0277bd; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${patient.disease}</span></td>
            <td onclick="openPatientDetails(${index}, 'admission')">${patient.date}</td>
            <td onclick="openPatientDetails(${index}, 'admission')">${patient.nextVisit || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteAdmissionPatient(${index})">削除</button>
            </td>
        `;
        admissionTableBody.appendChild(tr);
    });
}

// Function to delete an admission patient record
function deleteAdmissionPatient(index) {
    if (confirm('この患者データを「退院者」としてアーカイブへ移動しますか？')) {
        const archivedPatient = admissionPatients.splice(index, 1)[0];
        archivedPatient.dischargeDate = new Date().toLocaleDateString('ja-JP');
        dischargedPatients.push(archivedPatient);
        savePatientDB(); // Ensure persistence
        renderAdmissionTable();
    }
}

// Function to open patient details modal
let currentPatientIndex = -1;
let currentPatientType = ''; // 'admission' or 'outpatient'

function openPatientDetails(index, type) {
    const modal = document.getElementById('patientDetailsModal');
    if (!modal) return;

    currentPatientIndex = index;
    currentPatientType = type;

    const patient = type === 'admission' ? admissionPatients[index] : outpatientPatients[index];

    document.getElementById('details-patient-name').textContent = patient.name;
    
    const categoryEl = document.getElementById('details-patient-category');
    if (categoryEl) {
        let categoryClass = 'tag-unknown';
        if (patient.category === '運動器') categoryClass = 'tag-locomotor';
        else if (patient.category === '脳血管') categoryClass = 'tag-cerebro';
        else if (patient.category === '廃用') categoryClass = 'tag-disuse';
        categoryEl.innerHTML = `<span class="${categoryClass}">${patient.category || '未設定'}</span>`;
    }
    
    document.getElementById('details-patient-id').textContent = `ID: ${patient.id}`;

    // Parse history
    let history = [];
    try {
        if (patient.history) {
            history = JSON.parse(patient.history);
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

    // Color coding based on cancel rate
    if (cancelRate >= 30) {
        rateEl.style.color = '#ef4444'; // Red for high cancel rate
    } else if (cancelRate > 0) {
        rateEl.style.color = '#f59e0b'; // Amber
    } else {
        rateEl.style.color = '#10b981'; // Green for 0%
    }

    document.getElementById('details-cancel-count').textContent = `${cancelCount} / ${totalAppointments} 回`;

    // Render history table
    const historyBody = document.getElementById('details-history-body');
    historyBody.innerHTML = '';

    if (history.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-muted);">履歴はありません</td></tr>`;
    } else {
        // Filter out deleted from view if preferred, or show them
        const visibleHistory = history.filter(h => h.status !== 'deleted');

        visibleHistory.forEach(h => {
            const tr = document.createElement('tr');

            let statusHtml = '';
            if (h.status === 'arrived') {
                statusHtml = '<span style="background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">来院</span>';
            } else if (h.status === 'canceled') {
                statusHtml = '<span style="background: #f3f4f6; color: #6b7280; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">キャンセル</span>';
            } else {
                statusHtml = '<span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">予約中</span>';
            }

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

    // Set next visit date if it was saved
    document.getElementById('next-visit-date').value = patient.nextVisit || '';

    modal.style.display = 'flex';
}

function saveNextVisit() {
    if (currentPatientIndex < 0) return;

    const nextDate = document.getElementById('next-visit-date').value;

    if (currentPatientType === 'admission') {
        admissionPatients[currentPatientIndex].nextVisit = nextDate;
        savePatientDB(); // Ensure persistence
        renderAdmissionTable();
    } else {
        outpatientPatients[currentPatientIndex].nextVisit = nextDate;
        savePatientDB(); // Ensure persistence
        renderOutpatientTable();
    }

    alert('次回リハ予約日を保存しました。');
}

// Initialize Outpatient Table
function renderOutpatientTable() {
    if (!outpatientTableBody) return;

    outpatientTableBody.innerHTML = '';

    // Filter to ensure only outpatient data is shown
    const filteredOutpatient = outpatientPatients.filter(p => !p.type || p.type === 'outpatient');

    filteredOutpatient.forEach((op, index) => {
        let categoryClass = 'tag-unknown';
        if (op.category === '運動器') categoryClass = 'tag-locomotor';
        else if (op.category === '脳血管') categoryClass = 'tag-cerebro';
        else if (op.category === '廃用') categoryClass = 'tag-disuse';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td onclick="openPatientDetails(${index}, 'outpatient')"><strong>${op.id}</strong></td>
            <td onclick="openPatientDetails(${index}, 'outpatient')">${op.name}</td>
            <td onclick="openPatientDetails(${index}, 'outpatient')"><span class="tag-type-outpatient">外来</span></td>
            <td onclick="openPatientDetails(${index}, 'outpatient')"><span class="${categoryClass}">${op.category || '未設定'}</span></td>
            <td onclick="openPatientDetails(${index}, 'outpatient')"><span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 12px; font-size: 0.85rem; display: inline-block;">${op.disease}</span></td>
            <td onclick="openPatientDetails(${index}, 'outpatient')">${op.date}</td>
            <td onclick="openPatientDetails(${index}, 'outpatient')">${op.nextVisit || '<span style="color:var(--text-muted);font-size:0.85rem;">未定</span>'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin: 0; background: #ffebee; color: #c62828;" onclick="event.stopPropagation(); deleteOutpatient(${index})">削除</button>
            </td>
        `;
        outpatientTableBody.appendChild(tr);
    });
}

// Function to delete an outpatient record
function deleteOutpatient(index) {
    if (confirm('この外来データを「外来終了」としてアーカイブへ移動しますか？')) {
        const archivedPatient = outpatientPatients.splice(index, 1)[0];
        archivedPatient.terminationDate = new Date().toLocaleDateString('ja-JP');
        terminatedOutpatients.push(archivedPatient);
        savePatientDB(); // Ensure persistence
        renderOutpatientTable();
    }
}


// Handle form submission to add new admission patient
if (addAdmissionForm) {
    addAdmissionForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const newPatient = {
            id: toHalfWidth(document.getElementById('patientId').value),
            name: document.getElementById('patientName').value,
            type: 'admission',
            category: document.getElementById('patientCategory').value,
            disease: document.getElementById('diseaseName').value,
            date: document.getElementById('diagnosisDate').value
        };

        admissionPatients.push(newPatient);
        savePatientDB(); // Ensure persistence
        renderAdmissionTable();

        addAdmissionForm.reset();
        addAdmissionModal.style.display = 'none';
    });
}

// Handle form submission to add new outpatient
if (addOutpatientForm) {
    addOutpatientForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const newOp = {
            id: toHalfWidth(document.getElementById('opPatientId').value),
            name: document.getElementById('opPatientName').value,
            type: 'outpatient',
            category: document.getElementById('opPatientCategory').value,
            disease: document.getElementById('opDiseaseName').value,
            date: document.getElementById('opVisitDate').value
        };

        outpatientPatients.push(newOp);
        savePatientDB(); // Ensure persistence
        renderOutpatientTable();

        addOutpatientForm.reset();
        addOutpatientModal.style.display = 'none';
    });
}

// Archive Table Rendering
function renderDischargedTable() {
    const tableBody = document.getElementById('archivedAdmissionTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    dischargedPatients.forEach((p, index) => {
        let categoryClass = 'tag-unknown';
        if (p.category === '運動器') categoryClass = 'tag-locomotor';
        else if (p.category === '脳血管') categoryClass = 'tag-cerebro';
        else if (p.category === '廃用') categoryClass = 'tag-disuse';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.id}</strong></td>
            <td>${p.name}</td>
            <td><span class="tag-type-admission">入院</span></td>
            <td><span class="${categoryClass}">${p.category || '未設定'}</span></td>
            <td>${p.disease}</td>
            <td>${p.date}</td>
            <td>${p.dischargeDate || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreAdmission(${index})">復元</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderTerminatedTable() {
    const tableBody = document.getElementById('archivedOutpatientTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    terminatedOutpatients.forEach((p, index) => {
        let categoryClass = 'tag-unknown';
        if (p.category === '運動器') categoryClass = 'tag-locomotor';
        else if (p.category === '脳血管') categoryClass = 'tag-cerebro';
        else if (p.category === '廃用') categoryClass = 'tag-disuse';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.id}</strong></td>
            <td>${p.name}</td>
            <td><span class="tag-type-outpatient">外来</span></td>
            <td><span class="${categoryClass}">${p.category || '未設定'}</span></td>
            <td>${p.disease}</td>
            <td>${p.date}</td>
            <td>${p.terminationDate || '-'}</td>
            <td>
                <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; background: #e0f2fe; color: #0369a1;" onclick="restoreOutpatient(${index})">復元</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function restoreAdmission(index) {
    const p = dischargedPatients.splice(index, 1)[0];
    delete p.dischargeDate;
    admissionPatients.push(p);
    savePatientDB();
    renderDischargedTable();
    alert('入院患者リストに復元しました。');
}

function restoreOutpatient(index) {
    const p = terminatedOutpatients.splice(index, 1)[0];
    delete p.terminationDate;
    outpatientPatients.push(p);
    savePatientDB();
    renderTerminatedTable();
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
document.addEventListener('DOMContentLoaded', () => {
    renderAdmissionTable();
    renderOutpatientTable();
    renderDischargedTable();
    renderTerminatedTable();

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
