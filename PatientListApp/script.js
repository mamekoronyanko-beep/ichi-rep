// サンプルデータ
let patients = [
    { id: '1001', name: '山田 太郎', category: '運動器', careRequired: false, hasTarget: false, interviewDate: '2026-03-01', romDate: '2026-03-05', deadline: '2026-03-10', doctorMonth: '2026-04' },
    { id: '1002', name: '佐藤 花子', category: '脳血管', careRequired: true, hasTarget: true, interviewDate: '2026-02-28', romDate: '2026-03-02', deadline: '2026-03-03', doctorMonth: '2026-03' },
    { id: '1003', name: '鈴木 一郎', category: '運動器', careRequired: false, hasTarget: false, interviewDate: '', romDate: '', deadline: '2026-03-15', doctorMonth: '2026-03' },
    { id: '1004', name: '高橋 美咲', category: '脳血管', careRequired: false, hasTarget: false, interviewDate: '2026-02-20', romDate: '2026-02-25', deadline: '2026-02-28', doctorMonth: '2026-03' }
];

const savedPatients = JSON.parse(localStorage.getItem('patientListApp_patients'));
if (savedPatients && savedPatients.length > 0) {
    patients = savedPatients;
}

const tbody = document.getElementById('patientList');
const searchInput = document.getElementById('searchInput');

// Modal Elements
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const closeModal = document.getElementById('closeModal');
const addForm = document.getElementById('addForm');

// Calendar Elements
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarTitle = document.getElementById('calendarTitle');
const calMonth1 = document.getElementById('calMonth1');
const calMonth2 = document.getElementById('calMonth2');
const calendar1 = document.getElementById('calendar1');
const calendar2 = document.getElementById('calendar2');

// State
let currentSortColumn = '';
let currentSortOrder = 'asc'; // asc or desc
let currentFilter = '';
let currentMonthFilter = 'all'; // 'all' or 'YYYY-MM'
let currentBaseDate = new Date(); // カレンダー表示用ベース
let attendedDates = new Set(JSON.parse(localStorage.getItem('patientListApp_attendedDates')) || []); // localStorageから復元（休診日として扱う）

function saveData() {
    localStorage.setItem('patientListApp_patients', JSON.stringify(patients));
    localStorage.setItem('patientListApp_attendedDates', JSON.stringify(Array.from(attendedDates)));
}

function getStatus(patient) {
    const today = new Date(); // 現在の実際の日付を使用

    // 毎月15日以降で、必須項目（面談日、ROM測定開始日、医師提出期限日）のいずれかが未入力の場合アラート
    if (today.getDate() >= 15) {
        if (!patient.interviewDate || !patient.romDate || !patient.deadline) {
            return '<span class="status-badge status-danger">未入力あり</span>';
        }
    }

    if (!patient.deadline) return '<span class="status-badge" style="background: #e2e8f0; color: #475569;">未設定</span>';

    const target = new Date(patient.deadline);
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return '<span class="status-badge status-danger">期限切れ</span>';
    } else if (diffDays <= 3) {
        return '<span class="status-badge status-warning">間近</span>';
    } else {
        return '<span class="status-badge status-ok">余裕あり</span>';
    }
}

function getCategoryBadge(cat) {
    if (!cat) return '';
    const cls = cat === '運動器' ? 'cat-ortho' : 'cat-cerebro';
    return `<span class="cat-badge ${cls}">${cat}</span>`;
}

// Global functions for inline UI
window.clearField = function (id, field) {
    const p = patients.find(p => p.id === id);
    if (p) {
        p[field] = '';
        saveData();
        renderTable();
    }
};

window.toggleCare = function (id, isChecked) {
    const p = patients.find(p => p.id === id);
    if (p) {
        p.careRequired = isChecked;
        saveData();
    }
};

window.toggleTarget = function (id, isChecked) {
    const p = patients.find(p => p.id === id);
    if (p) {
        p.hasTarget = isChecked;
        saveData();
    }
};

window.updateField = function (id, field, value) {
    const p = patients.find(p => p.id === id);
    if (p) {
        p[field] = value;
        autoCalcDates(p, field);
        saveData();
        renderTable();
    }
};

function autoCalcDates(patient, trigger) {
    if (!patient.interviewDate) return;

    // 面談日が変更された、または新規登録時はROM測定開始日を自動入力（面談日の10日前）
    if (trigger === 'interviewDate' || trigger === 'init') {
        const invDate = new Date(patient.interviewDate);
        const rom = new Date(invDate);
        rom.setDate(rom.getDate() - 10);
        patient.romDate = rom.getFullYear() + '-' + String(rom.getMonth() + 1).padStart(2, '0') + '-' + String(rom.getDate()).padStart(2, '0');
    }

    // 医師出勤カレンダーが更新された、面談日が変更された時は期限日（2営業日前）を自動計算
    if (trigger === 'interviewDate' || trigger === 'calendar' || trigger === 'init') {
        const interviewD = new Date(patient.interviewDate);
        let daysToSubtract = 2; // 2出勤日戻る必要がある
        let currentDate = new Date(interviewD);

        // 面談日から1日ずつさかのぼり、出勤日（カレンダーでチェックされていない日）を2日分カウントする
        while (daysToSubtract > 0) {
            currentDate.setDate(currentDate.getDate() - 1); // 1日戻る

            // 戻った日付の文字列 (YYYY-MM-DD)
            const dateStr = currentDate.getFullYear() + '-' +
                String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
                String(currentDate.getDate()).padStart(2, '0');

            // もしカレンダーにチェックが「入っていない」なら、その日は出勤日
            if (!attendedDates.has(dateStr)) {
                daysToSubtract--; // 1出勤日確保した
            }
        }

        patient.deadline = currentDate.getFullYear() + '-' +
            String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
            String(currentDate.getDate()).padStart(2, '0');
    }
}

window.deleteRecord = function (id) {
    if (confirm('本当にこの患者データを削除しますか？')) {
        patients = patients.filter(p => p.id !== id);
        saveData();
        renderTable();
    }
};

function renderTable() {
    let data = [...patients];

    // Filter by Month Tab (using interviewDate as the base for "month")
    if (currentMonthFilter !== 'all') {
        data = data.filter(p => {
            if (!p.interviewDate) return false;
            return p.interviewDate.startsWith(currentMonthFilter);
        });
    }

    // Sort
    if (currentSortColumn) {
        data.sort((a, b) => {
            let valA = a[currentSortColumn] || '';
            let valB = b[currentSortColumn] || '';

            // Handle sorting for status mapping to deadline
            if (currentSortColumn === 'status') {
                valA = a.deadline || '9999-12-31';
                valB = b.deadline || '9999-12-31';
            } else if (currentSortColumn === 'careRequired') {
                valA = a.careRequired ? 1 : 0;
                valB = b.careRequired ? 1 : 0;
            } else if (currentSortColumn === 'hasTarget') {
                valA = a.hasTarget ? 1 : 0;
                valB = b.hasTarget ? 1 : 0;
            } else if (['interviewDate', 'romDate', 'deadline', 'doctorMonth'].includes(currentSortColumn)) {
                // To keep empty dates at the bottom when sorting ascending
                valA = valA || '9999-12-31';
                valB = valB || '9999-12-31';
            }

            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Filter
    if (currentFilter) {
        const term = currentFilter.toLowerCase();
        data = data.filter(p => p.name.toLowerCase().includes(term) || p.id.includes(term));
    }

    tbody.innerHTML = '';
    data.forEach((p, index) => {
        const tr = document.createElement('tr');
        tr.style.animation = `fadeIn 0.3s ease forwards ${index * 0.05}s`;
        tr.style.opacity = '0';

        const renderDateCell = (field, value) => `
            <div class="date-cell">
                <input type="date" class="inline-input" value="${value || ''}" onchange="updateField('${p.id}', '${field}', this.value)">
                ${value ? `<button class="clear-btn" onclick="clearField('${p.id}', '${field}')" title="クリア">×</button>` : ''}
            </div>
        `;

        tr.innerHTML = `
            <td><strong>${p.id}</strong></td>
            <td>${p.name} ${getCategoryBadge(p.category)}</td>
            <td style="text-align: center;"><input type="checkbox" style="width: 1.2rem; height: 1.2rem; cursor: pointer;" ${p.careRequired ? 'checked' : ''} onchange="toggleCare('${p.id}', this.checked)"></td>
            <td style="text-align: center;"><input type="checkbox" style="width: 1.2rem; height: 1.2rem; cursor: pointer;" ${p.hasTarget ? 'checked' : ''} onchange="toggleTarget('${p.id}', this.checked)"></td>
            <td>${renderDateCell('interviewDate', p.interviewDate)}</td>
            <td>${renderDateCell('romDate', p.romDate)}</td>
            <td>${renderDateCell('deadline', p.deadline)}</td>
            <td><input type="month" class="inline-input" value="${p.doctorMonth || ''}" onchange="updateField('${p.id}', 'doctorMonth', this.value)"></td>
            <td>${getStatus(p)}</td>
            <td><button class="delete-btn" onclick="deleteRecord('${p.id}')">削 除</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Month Tabs Logic ---
const monthTabsContainer = document.getElementById('monthTabs');

function renderMonthTabs() {
    // 存在する面談日から月の一覧（YYYY-MM）を抽出してソート
    const months = new Set();
    patients.forEach(p => {
        if (p.interviewDate) {
            months.add(p.interviewDate.substring(0, 7));
        }
    });
    const sortedMonths = Array.from(months).sort();

    monthTabsContainer.innerHTML = '';

    // 「すべて」タブ
    const allTab = document.createElement('div');
    allTab.className = `month-tab ${currentMonthFilter === 'all' ? 'active' : ''}`;
    allTab.textContent = 'すべて表示';
    allTab.addEventListener('click', () => {
        currentMonthFilter = 'all';
        renderMonthTabs();
        renderTable();
    });
    monthTabsContainer.appendChild(allTab);

    // 月ごとのタブ
    sortedMonths.forEach(m => {
        const [year, month] = m.split('-');
        const tab = document.createElement('div');
        tab.className = `month-tab ${currentMonthFilter === m ? 'active' : ''}`;
        tab.textContent = `${year}年${parseInt(month)}月`;
        tab.addEventListener('click', () => {
            currentMonthFilter = m;
            renderMonthTabs();
            renderTable();
        });
        monthTabsContainer.appendChild(tab);
    });
}

searchInput.addEventListener('input', (e) => {
    currentFilter = e.target.value;
    renderTable();
});

// Sort logic
document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (currentSortColumn === col) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = col;
            currentSortOrder = 'asc';
        }

        // Update icons
        document.querySelectorAll('th.sortable').forEach(t => {
            t.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(currentSortOrder === 'asc' ? 'sort-asc' : 'sort-desc');

        renderTable();
    });
});

// --- Modal Logic ---
addBtn.addEventListener('click', () => {
    addModal.classList.add('show');
});

closeModal.addEventListener('click', () => {
    addModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === addModal) {
        addModal.classList.remove('show');
    }
});

addForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const catRadio = document.querySelector('input[name="category"]:checked');
    const newPatient = {
        id: document.getElementById('newId').value,
        name: document.getElementById('newName').value,
        category: catRadio ? catRadio.value : '',
        careRequired: document.getElementById('newCareRequired').checked,
        hasTarget: document.getElementById('newHasTarget').checked,
        interviewDate: document.getElementById('newInterviewDate').value,
        romDate: document.getElementById('newRomDate').value,
        deadline: document.getElementById('newDeadline').value,
        doctorMonth: document.getElementById('newDoctorMonth').value
    };

    autoCalcDates(newPatient, 'init');
    patients.push(newPatient); // 配列に追加
    saveData();
    renderTable();     // テーブルを再描画

    addForm.reset();           // フォームをリセット
    addModal.classList.remove('show'); // モーダルを閉じる
});

// 行表示時のアニメーション用
const style = document.createElement('style');
style.innerHTML = `
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
`;
document.head.appendChild(style);

// 初回レンダリング
renderMonthTabs();
renderTable();


// --- Calendar Logic ---
const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

function renderCalendar(container, year, month) {
    container.innerHTML = '';

    // ヘッダー（曜日）
    dayNames.forEach((d, i) => {
        const div = document.createElement('div');
        div.className = 'cal-header';
        if (i === 0) div.classList.add('cal-sun');
        if (i === 6) div.classList.add('cal-sat');
        div.textContent = d;
        container.appendChild(div);
    });

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    // 空のセル（月初め）
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day cal-empty';
        container.appendChild(div);
    }

    // 日付セル
    for (let day = 1; day <= daysInMonth; day++) {
        const div = document.createElement('div');
        div.className = 'cal-day';

        const currentWeekday = (firstDay + day - 1) % 7;
        if (currentWeekday === 0) div.classList.add('cal-sun');
        if (currentWeekday === 6) div.classList.add('cal-sat');

        div.textContent = day;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (attendedDates.has(dateStr)) {
            div.classList.add('cal-checked');
        }

        div.addEventListener('click', () => {
            if (attendedDates.has(dateStr)) {
                attendedDates.delete(dateStr);
                div.classList.remove('cal-checked');
            } else {
                attendedDates.add(dateStr);
                div.classList.add('cal-checked');
            }

            // カレンダー更新時に全患者の期限を再計算
            patients.forEach(p => autoCalcDates(p, 'calendar'));
            saveData();
            renderTable();
        });

        container.appendChild(div);
    }
}

function updateCalendars() {
    const y1 = currentBaseDate.getFullYear();
    const m1 = currentBaseDate.getMonth() + 1; // 1-12

    const nextDate = new Date(y1, m1, 1);
    const y2 = nextDate.getFullYear();
    const m2 = nextDate.getMonth() + 1;

    calMonth1.textContent = `${y1}年 ${m1}月`;
    calMonth2.textContent = `${y2}年 ${m2}月`;
    calendarTitle.textContent = `${y1}年${m1}月 - ${y2}年${m2}月`;

    renderCalendar(calendar1, y1, m1);
    renderCalendar(calendar2, y2, m2);
}

prevMonthBtn.addEventListener('click', () => {
    currentBaseDate.setMonth(currentBaseDate.getMonth() - 1);
    updateCalendars();
});

nextMonthBtn.addEventListener('click', () => {
    currentBaseDate.setMonth(currentBaseDate.getMonth() + 1);
    updateCalendars();
});

// カレンダー初期化
updateCalendars();

// --- Excel Import Logic ---
const importExcelBtn = document.getElementById('importExcelBtn');
const excelFileInput = document.getElementById('excelFileInput');

importExcelBtn.addEventListener('click', () => {
    excelFileInput.click();
});

excelFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // raw: false converts dates to strings based on Excel formatting
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

            let importCount = 0;

            jsonData.forEach(row => {
                // Helper to format Excel date string (e.g. "2026/03/01") into "YYYY-MM-DD"
                const formatDateStr = (str) => {
                    if (!str) return '';
                    let s = str.toString().trim().replace(/\//g, '-');
                    const parts = s.split('-');
                    if (parts.length === 3) {
                        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    }
                    return s;
                };

                // キー名の表記揺れを吸収するヘルパー関数
                const getVal = (keywords) => {
                    for (let key in row) {
                        // 空白を削除し、完全に小文字・半角にする大雑把な正規化
                        const cleanKey = key.replace(/[\s　]/g, '').toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
                            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
                        });
                        for (let kw of keywords) {
                            if (cleanKey.includes(kw)) {
                                return row[key];
                            }
                        }
                    }
                    return '';
                };

                const newId = getVal(['id', '番号', '患者番号', 'id(番号)']);
                if (!newId) return;

                const newPatient = {
                    id: String(newId).trim(),
                    name: getVal(['氏名', '名前', 'name', '患者様']),
                    category: getVal(['疾患', 'カテ', '分類', '種別']),
                    careRequired: [true, 'あり', '有', 'yes', '要', 'true'].includes(String(getVal(['要介護', '介護', 'ケア', 'care'])).toLowerCase()),
                    hasTarget: [true, 'あり', '有', 'yes', '要', 'true'].includes(String(getVal(['目標', 'ゴール', 'target', 'goal'])).toLowerCase()),
                    interviewDate: formatDateStr(getVal(['面談日', '面談', 'interview'])),
                    romDate: formatDateStr(getVal(['rom', 'rom測定', '測定開始'])),
                    deadline: formatDateStr(getVal(['提出', '期限', 'deadline'])),
                    doctorMonth: String(getVal(['予定月', '月', 'doctor'])).trim()
                };

                // 自動計算処理
                if (newPatient.interviewDate) {
                    autoCalcDates(newPatient, 'init');
                }

                // すでにあるIDなら上書き、無ければ追加
                const existingIndex = patients.findIndex(p => p.id === newPatient.id);
                if (existingIndex >= 0) {
                    // もともと入っているデータ（面談日など）がExcelで空欄だった場合、元のデータを消さずに引き継ぐ
                    const existingPatient = patients[existingIndex];
                    patients[existingIndex] = {
                        id: newPatient.id,
                        name: newPatient.name || existingPatient.name,
                        category: newPatient.category || existingPatient.category,
                        careRequired: newPatient.careRequired || existingPatient.careRequired, // Excelに無い場合は元のチェックを引き継ぐ
                        hasTarget: newPatient.hasTarget || existingPatient.hasTarget,
                        interviewDate: newPatient.interviewDate || existingPatient.interviewDate,
                        romDate: newPatient.romDate || existingPatient.romDate,
                        deadline: newPatient.deadline || existingPatient.deadline,
                        doctorMonth: newPatient.doctorMonth || existingPatient.doctorMonth
                    };

                    // もし既存データを引き継いだ状態でもう一度自動計算できるならする
                    if (patients[existingIndex].interviewDate) {
                        autoCalcDates(patients[existingIndex], 'init');
                    }
                } else {
                    patients.push(newPatient);
                }
                importCount++;
            });

            if (importCount > 0) {
                saveData();
                renderTable();
                alert(`${importCount}件の患者データをインポートしました。`);
            } else {
                alert('読み込めるデータが見つかりませんでした。');
            }
        } catch (error) {
            console.error(error);
            alert('ファイルの読み込みに失敗しました。');
        }
    };
    reader.readAsArrayBuffer(file);
    // 連続して同じファイルを選択できるようにリセット
    e.target.value = '';
});
