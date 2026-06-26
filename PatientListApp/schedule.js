document.addEventListener('DOMContentLoaded', () => {
    const scheduleBody = document.getElementById('scheduleBody');
    const currentDateDisplay = document.getElementById('currentDateDisplay');
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');

    let currentViewDate = new Date();
    // Initialize data storage if not present
    let scheduleData = JSON.parse(localStorage.getItem('patientListApp_schedule')) || {};

    const START_HOUR = 9;
    const END_HOUR = 18;
    const INTERVAL_MIN = 20;

    function formatTime(h, m) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function generateTimeSlots() {
        const slots = [];
        for (let h = START_HOUR; h < END_HOUR; h++) {
            for (let m = 0; m < 60; m += INTERVAL_MIN) {
                slots.push({
                    hour: h,
                    minute: m,
                    timeStr: formatTime(h, m),
                    isBreak: h === 12 // 12:00 - 13:00 is break
                });
            }
        }
        return slots;
    }

    function getDateKey(dateObj) {
        return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    }

    function formatDateDisplay(dateObj) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 (${days[dateObj.getDay()]})`;
    }

    function renderSchedule() {
        const dateKey = getDateKey(currentViewDate);
        currentDateDisplay.textContent = formatDateDisplay(currentViewDate);

        // Ensure data exists for this date
        if (!scheduleData[dateKey]) {
            scheduleData[dateKey] = {};
        }
        const dayData = scheduleData[dateKey];

        scheduleBody.innerHTML = '';
        const slots = generateTimeSlots();

        slots.forEach(slot => {
            const tr = document.createElement('tr');
            if (slot.isBreak) {
                tr.className = 'break-row';
            }

            // Time Column
            const tdTime = document.createElement('td');
            tdTime.className = 'time-col';
            tdTime.textContent = slot.timeStr;
            tr.appendChild(tdTime);

            // 6 columns: 5 staff + 1 shoen
            for (let i = 1; i <= 6; i++) {
                const td = document.createElement('td');
                if (slot.isBreak) {
                    td.className = 'break-cell';
                    if (i === 3) td.textContent = '休 憩 時 間';
                } else {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'slot-input';

                    const slotKey = `${slot.timeStr}-col${i}`;
                    if (dayData[slotKey]) {
                        input.value = dayData[slotKey];
                        input.classList.add('has-value');
                    }

                    input.addEventListener('input', (e) => {
                        const val = e.target.value.trim();
                        if (val) {
                            dayData[slotKey] = val;
                            e.target.classList.add('has-value');
                        } else {
                            delete dayData[slotKey];
                            e.target.classList.remove('has-value');
                        }
                        saveData();
                    });

                    td.appendChild(input);
                }
                tr.appendChild(td);
            }

            scheduleBody.appendChild(tr);
        });
    }

    function saveData() {
        localStorage.setItem('patientListApp_schedule', JSON.stringify(scheduleData));
    }

    prevDayBtn.addEventListener('click', () => {
        currentViewDate.setDate(currentViewDate.getDate() - 1);
        renderSchedule();
    });

    nextDayBtn.addEventListener('click', () => {
        currentViewDate.setDate(currentViewDate.getDate() + 1);
        renderSchedule();
    });

    // --- Excel Import Logic ---
    const importScheduleBtn = document.getElementById('importScheduleBtn');
    const scheduleExcelInput = document.getElementById('scheduleExcelInput');

    importScheduleBtn.addEventListener('click', () => {
        scheduleExcelInput.click();
    });

    scheduleExcelInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Read sheet as JSON with raw values.
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                const dateKey = getDateKey(currentViewDate);
                if (!scheduleData[dateKey]) scheduleData[dateKey] = {};
                const dayData = scheduleData[dateKey];

                let importCount = 0;

                jsonData.forEach(row => {
                    // Try to extract time representing the row.
                    let timeVal = "";
                    for (let key in row) {
                        if (key.includes('時間') || key.includes('time') || key.match(/^\d{1,2}:\d{2}$/) || typeof row[key] === 'string' && row[key].match(/^\d{1,2}:\d{2}$/)) {
                            // Convert Excel fractional time if needed
                            if (typeof row[key] === 'string' && row[key].match(/^\d{1,2}:\d{2}$/)) {
                                timeVal = row[key].trim();
                            } else if (typeof row[key] === 'number') {
                                // Approximate time formatting if imported as number
                                let totalMinutes = Math.round(row[key] * 24 * 60);
                                let h = Math.floor(totalMinutes / 60);
                                let m = totalMinutes % 60;
                                timeVal = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                            } else if (typeof row[key] === 'string') {
                                // sometimes formatted e.g., '09:00:00'
                                let match = row[key].match(/(\d{1,2}):(\d{2})/);
                                if (match) timeVal = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
                            }
                        }
                    }

                    if (!timeVal) return; // If we can't figure out the time, skip

                    // Check which staff columns we can map
                    // E.g. "スタッフ枠 1" -> col1, "スタッフ枠 2" -> col2, etc. "消炎枠" -> col6
                    for (let key in row) {
                        let colIdx = -1;
                        if (key.includes('スタッフ枠 1') || key === 'スタッフ1') colIdx = 1;
                        else if (key.includes('スタッフ枠 2') || key === 'スタッフ2') colIdx = 2;
                        else if (key.includes('スタッフ枠 3') || key === 'スタッフ3') colIdx = 3;
                        else if (key.includes('スタッフ枠 4') || key === 'スタッフ4') colIdx = 4;
                        else if (key.includes('スタッフ枠 5') || key === 'スタッフ5') colIdx = 5;
                        else if (key.includes('消炎')) colIdx = 6;
                        else if (key.includes('予約1') || key === '枠1') colIdx = 1;
                        else if (key.includes('予約2') || key === '枠2') colIdx = 2;
                        else if (key.includes('予約3') || key === '枠3') colIdx = 3;
                        else if (key.includes('予約4') || key === '枠4') colIdx = 4;
                        else if (key.includes('予約5') || key === '枠5') colIdx = 5;

                        if (colIdx !== -1) {
                            const val = row[key];
                            if (val && String(val).trim() !== '') {
                                const slotKey = `${timeVal}-col${colIdx}`;
                                dayData[slotKey] = String(val).trim();
                                importCount++;
                            }
                        }
                    }
                });

                if (importCount > 0) {
                    saveData();
                    renderSchedule();
                    alert(`${importCount}枠の予約データを読み込みました。`);
                } else {
                    alert('対応するデータ（時間やスタッフ枠情報）が見つかりませんでした。');
                }

            } catch (error) {
                console.error(error);
                alert('ファイルの読み込みに失敗しました。');
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    });

    // Initial render
    renderSchedule();
});
