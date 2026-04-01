document.addEventListener('DOMContentLoaded', async () => {
    const scheduleBody = document.getElementById('schedule-body');
    const targetDateInput = document.getElementById('target-date');

    // --- Supabase Configuration ---
    const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Configuration
    const START_HOUR = 9;
    const END_HOUR = 18;
    const INTERVAL_MINUTES = 20;
    const BREAK_START_HOUR = 12;
    const BREAK_END_HOUR = 13;
    const STAFF_COUNT = 6;
    const ANTI_COUNT = 1;
    const TIME_SLOTS = [];

    // Global holidays state
    let holidaysData = {};
    let dbHolidaysData = []; // Store custom holidays from doctor_attendance table
    let dbReservations = []; // Make global to be accessible across functions
    let performanceStatsCache = { reservations: [], patientMap: {} }; // For sales calculation

    /**
     * Fetch Japanese holidays from external API
     */
    async function fetchHolidays() {
        try {
            // 1. Fetch public holidays
            const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
            if (response.ok) {
                holidaysData = await response.json();
                console.log('Public holidays loaded:', Object.keys(holidaysData).length);
            }

            // 2. Fetch custom holidays (doctor_attendance table)
            const { data, error } = await supabase.from('doctor_attendance').select('*');
            if (!error && data) {
                dbHolidaysData = data;
                console.log('Custom holidays loaded:', dbHolidaysData.length);
            }
        } catch (error) {
            console.error('Failed to fetch holidays:', error);
        }
    }

    /**
     * Check if a date is a non-working day (Sunday or Holiday)
     */
    function isNonWorkingDay(dateStr) {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        const month = date.getMonth() + 1; // 1-12
        const day = date.getDate();

        // Sunday is 0
        if (date.getDay() === 0) return true;
        
        // Fixed Holidays: Jan 1, 2, 3 and Dec 29, 30, 31
        if (month === 1 && (day === 1 || day === 2 || day === 3)) return true;
        if (month === 12 && (day === 29 || day === 30 || day === 31)) return true;

        // Check if dateStr exists in holidaysData (format YYYY-MM-DD)
        if (holidaysData[dateStr]) return true;

        return false;
    }

    let draggedSourceKey = null; // Global to store key during drag

    // Initialize date selector with today's date
    const initializeDate = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        targetDateInput.value = `${yyyy}-${mm}-${dd}`;
    };

    const formatTime = (dateObj) => {
        const h = String(dateObj.getHours()).padStart(2, '0');
        const m = String(dateObj.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    };

    // --- Mobile Stats Toggle Logic ---
    const toggleStatsBtn = document.getElementById('toggle-stats-btn');
    const statsContainer = document.getElementById('stats-container');
    const tableContainer = document.querySelector('.table-container');

    const updateToggleState = (isCollapsed) => {
        if (isCollapsed) {
            statsContainer.classList.add('collapsed');
            tableContainer.classList.add('stats-collapsed');
            const textSpan = toggleStatsBtn.querySelector('.toggle-text');
            if (textSpan) textSpan.textContent = '集計を表示';
        } else {
            statsContainer.classList.remove('collapsed');
            tableContainer.classList.remove('stats-collapsed');
            const textSpan = toggleStatsBtn.querySelector('.toggle-text');
            if (textSpan) textSpan.textContent = '集計を非表示';
        }
        localStorage.setItem('stats_collapsed', isCollapsed);
    };

    if (toggleStatsBtn) {
        const savedState = localStorage.getItem('stats_collapsed') === 'true';
        updateToggleState(savedState);

        toggleStatsBtn.addEventListener('click', () => {
            const currentlyCollapsed = statsContainer.classList.contains('collapsed');
            updateToggleState(!currentlyCollapsed);
        });
    }

    // --- Staff Management Logic (DB Optimized) ---
    const getStaffData = async () => {
        const { data, error } = await supabase.from('staff_settings').select('*').order('id', { ascending: true });
        const names = Array.from({ length: STAFF_COUNT }, (_, i) => `スタッフ ${i + 1}`);
        if (!error && data && data.length > 0) {
            data.forEach((s, i) => {
                if (i < STAFF_COUNT) names[i] = s.name;
            });
        }
        return names;
    };

    const getStaffAttendance = async (dateStr) => {
        const attendance = Array(STAFF_COUNT).fill('work');

        // デートごとのスタッフ勤怠はreservationsテーブルに特殊キーで保存する
        // patient_id = '_STAFF_{id}_{dateStr}' の形式
        const specialIds = Array.from({ length: STAFF_COUNT }, (_, i) => `_STAFF_${i + 1}_${dateStr}`);

        const { data, error } = await supabase
            .from('reservations')
            .select('patient_id, remarks, created_at')
            .in('patient_id', specialIds)
            .order('created_at', { ascending: true }); // 昇順で取得し、forEachで後勝ち（最新）にする

        if (!error && data) {
            data.forEach(row => {
                const match = row.patient_id.match(/^_STAFF_(\d+)_/);
                if (match) {
                    const idx = parseInt(match[1]) - 1;
                    if (idx >= 0 && idx < STAFF_COUNT) {
                        attendance[idx] = row.remarks || 'work';
                    }
                }
            });
        }
        return attendance;
    };

    const saveStaffData = async (names) => {
        const upsertData = names.map((name, i) => ({ id: i + 1, name: name }));
        const { error } = await supabase.from('staff_settings').upsert(upsertData);
        if (error) throw new Error("スタッフ名の保存に失敗しました: " + error.message);
    };

    const saveStaffAttendance = async (dateStr, attendance) => {
        // 各スタッフの勤怠をreservationsテーブルのupsertで保存
        for (let i = 0; i < attendance.length; i++) {
            const patientId = `_STAFF_${i + 1}_${dateStr}`;
            const status = attendance[i];

            // 既存レコードを確認
            const { data: existing } = await supabase
                .from('reservations')
                .select('id')
                .eq('patient_id', patientId)
                .limit(1);

            if (existing && existing.length > 0) {
                // 更新
                await supabase.from('reservations').update({ remarks: status }).eq('patient_id', patientId);
            } else {
                // 新規挿入
                await supabase.from('reservations').insert([{
                    patient_id: patientId,
                    patient_name: `_staff_attendance_`,
                    res_date: dateStr,
                    res_time: '00:00',
                    res_type: 'staff',
                    res_index: i + 1,
                    status: 'booked',
                    remarks: status
                }]);
            }
        }
    };
    // ----------------------------

    let _scheduleRendering = false;
    let _scheduleDebounceTimer = null;

    const createSchedule = async () => {
        // デバウンス: 連続した呼び出しをまとめて一度だけ実行
        if (_scheduleDebounceTimer) clearTimeout(_scheduleDebounceTimer);
        return new Promise((resolve) => {
            _scheduleDebounceTimer = setTimeout(async () => {
                // 既に実行中なら何もしない（二重実行防止）
                if (_scheduleRendering) { resolve(); return; }
                _scheduleRendering = true;
                try {
                    await _createScheduleInner();
                } finally {
                    _scheduleRendering = false;
                }
                resolve();
            }, 80); // 80ms デバウンス
        });
    };

    const _createScheduleInner = async () => {
        const selectedDate = targetDateInput.value;
        const date = new Date(selectedDate);
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        const isHoliday = isNonWorkingDay(selectedDate);
        
        // Add holiday class if needed
        const container = document.querySelector('.table-container');
        if (isHoliday) {
            container.classList.add('is-non-working-day');
        } else {
            container.classList.remove('is-non-working-day');
        }

        scheduleBody.innerHTML = '';

        // --- 単位数表示行（スタッフ名の下）を動的に追加 ---
        const unitsRow = document.createElement('tr');
        unitsRow.id = 'staff-units-row';
        unitsRow.style.cssText = 'background: #f0fdf4; border-bottom: 2px solid #86efac; position: sticky; top: 0; z-index: 5;';
        
        // 時間列のプレースホルダ
        const timeHeaderTd = document.createElement('td');
        timeHeaderTd.style.cssText = 'font-size: 0.65rem; color: #15803d; font-weight: 700; text-align: center; padding: 0.3rem 0.2rem; white-space: nowrap; background:#dcfce7;';
        timeHeaderTd.textContent = '単位数';
        unitsRow.appendChild(timeHeaderTd);

        // スタッフ枠用の入力欄
        for (let i = 1; i <= STAFF_COUNT; i++) {
            const td = document.createElement('td');
            td.style.cssText = 'background:#f0fdf4; padding:0.2rem;';
            const input = document.createElement('input');
            input.type = 'number';
            input.id = `staff-units-${i}`;
            input.min = '0';
            input.value = '0';
            input.style.cssText = 'width:100%; font-size:0.85rem; font-weight:700; color:#15803d; text-align:center; border:1px solid #86efac; border-radius:4px; padding:0.2rem; background:#f0fdf4;';
            
            // 変更時に自動計算と永続化を行う
            input.addEventListener('input', () => {
                updateManualTotalFromFields();
                syncManualMetricsToSupabase();
            });

            td.appendChild(input);
            unitsRow.appendChild(td);
        }

        // 消炎枠用の入力欄
        const antiTd = document.createElement('td');
        antiTd.style.cssText = 'background:#f0f9ff; padding:0.2rem;';
        const antiInput = document.createElement('input');
        antiInput.type = 'number';
        antiInput.id = 'anti-units-1';
        antiInput.min = '0';
        antiInput.value = '0';
        antiInput.style.cssText = 'width:100%; font-size:0.85rem; font-weight:700; color:#0369a1; text-align:center; border:1px solid #bae6fd; border-radius:4px; padding:0.2rem; background:#f0f9ff;';
        
        antiInput.addEventListener('input', () => {
            syncManualMetricsToSupabase();
        });

        antiTd.appendChild(antiInput);
        unitsRow.appendChild(antiTd);

        scheduleBody.appendChild(unitsRow);

        // --- Fetch from Supabase ---
        const { data: resData, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', selectedDate)
            .neq('patient_id', '_METRICS_')
            .not('patient_name', 'eq', '_staff_attendance_');
        
        dbReservations = resData || [];

        const reservationsByTime = {};
        if (dbReservations) {
            dbReservations.forEach(res => {
                const time = res.res_time;
                const type = res.res_type;
                const index = res.res_index;

                if (!reservationsByTime[time]) {
                    reservationsByTime[time] = { staff: {}, anti: {}, cancel: [] };
                }

                if (type === 'staff') {
                    reservationsByTime[time].staff[index] = res;
                } else if (type === 'anti') {
                    reservationsByTime[time].anti[index] = res;
                } else if (type === 'cancel') {
                    reservationsByTime[time].cancel.push(res);
                }
            });
        }
        // ---------------------------------------------------------------------

        // 固定の基準日を使用してループ比較を安定させる
        const baseDate = new Date(2000, 0, 1); // 固定基準日
        const startTime = new Date(baseDate);
        startTime.setHours(START_HOUR, 0, 0, 0);

        const endTime = new Date(baseDate);
        endTime.setHours(END_HOUR, 0, 0, 0);

        let currentTime = new Date(startTime);

        const staffNames = await getStaffData();
        const staffAttendance = await getStaffAttendance(selectedDate);

        // Update Table Headers
        const subHeaderRow = document.querySelector('.sub-header-row');
        if (subHeaderRow) {
            const staffThs = subHeaderRow.querySelectorAll('th');
            for (let i = 0; i < STAFF_COUNT; i++) {
                if (staffThs[i]) {
                    staffThs[i].textContent = staffNames[i];
                    const attendanceMode = staffAttendance[i];
                    if (attendanceMode !== 'work') {
                        staffThs[i].style.backgroundColor = '#94a3b8'; // より濃いグレー
                        staffThs[i].style.color = '#ffffff';
                        staffThs[i].textContent = staffNames[i];
                    } else {
                        staffThs[i].style.backgroundColor = '';
                        staffThs[i].style.color = '';
                    }
                }
            }
        }

        while (currentTime <= endTime) {
            const h = currentTime.getHours();
            const m = currentTime.getMinutes();
            const timeString = formatTime(currentTime);
            const timeData = reservationsByTime[timeString] || { staff: {}, anti: {}, cancel: [] };

            const tr = document.createElement('tr');
            const isBreakTime = (h >= BREAK_START_HOUR && h < BREAK_END_HOUR);
            if (isBreakTime) tr.classList.add('break-row');

            const timeTd = document.createElement('td');
            timeTd.classList.add('time-col');
            timeTd.textContent = timeString;
            tr.appendChild(timeTd);

            if (isBreakTime) {
                if (h === BREAK_START_HOUR && m === 0) {
                    const breakTd = document.createElement('td');
                    breakTd.classList.add('break-cell');
                    breakTd.colSpan = STAFF_COUNT + ANTI_COUNT;
                    breakTd.rowSpan = 60 / INTERVAL_MINUTES;
                    breakTd.textContent = '休憩時間';
                    tr.appendChild(breakTd);
                    scheduleBody.appendChild(tr);
                } else {
                    // Skip these rows for the break area as it's handled by rowSpan
                    // But we still need the tr to exist for consistency
                    scheduleBody.appendChild(tr);
                }
            } else {
                // Staff Slots
                for (let i = 1; i <= STAFF_COUNT; i++) {
                    const td = document.createElement('td');
                    td.dataset.time = timeString;
                    td.dataset.type = 'staff';
                    td.dataset.index = i;

                    const attendanceMode = staffAttendance[i - 1];
                    let isStaffOff = false;
                    let offLabel = '休み';
                    if (attendanceMode === 'off') isStaffOff = true;
                    else if (attendanceMode === 'morning_off' && h < 12) { isStaffOff = true; offLabel = '午前休'; }
                    else if (attendanceMode === 'afternoon_off' && h >= 13) { isStaffOff = true; offLabel = '午後休'; }

                    const data = timeData.staff[i];
                    if (data) {
                        td.classList.add('booked');
                        if (data.status === 'arrived') td.classList.add('status-arrived');
                        else if (data.status === 'canceled') td.classList.add('status-canceled');
                        else {
                            td.style.backgroundColor = isStaffOff ? '#f3f4f6' : '#e0f2fe';
                            td.style.color = isStaffOff ? '#9ca3af' : '#0369a1';
                            td.style.border = isStaffOff ? '2px solid #e5e7eb' : '2px solid #38bdf8';
                        }
                        const units = data.units || 1;
                        td.dataset.resStart = data.res_time;
                        td.dataset.resId = data.id;

                        const fullRemarks = data.remarks || '';
                        const isWalkIn = fullRemarks.startsWith('[予約外]');
                        const displayRemarks = isWalkIn ? fullRemarks.replace('[予約外]', '').trim() : fullRemarks;
                        
                        if (isWalkIn) td.classList.add('is-walk-in');

                        const unitsLabel = units > 1 ? ` <span style="color:#6366f1; font-weight:800; font-size:0.65rem;">(${units}単位)</span>` : '';

                        if (data.is_inpatient_block) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}🏥 入院患者介入枠${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#fdf2f880' : '#fdf2f8';
                            td.style.color = isStaffOff ? '#be185d80' : '#be185d';
                        } else if (data.is_meeting) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}💬 面談: ${data.patient_name || '未指定'}${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#ecfdf580' : '#ecfdf5';
                            td.style.color = isStaffOff ? '#065f4680' : '#065f46';
                            td.style.border = isStaffOff ? '2px solid #d1fae580' : '2px solid #10b981';
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}${data.patient_name || '無名'}${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        }

                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => {
                            draggedSourceKey = data.id;
                            td.classList.add('dragging');
                            e.dataTransfer.setData('text/plain', data.id);
                        });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });

                    } else if (isStaffOff) {
                        td.classList.add('staff-off-cell');
                        td.style.backgroundColor = '#e2e8f0'; // 色変更のみ（ラベルなし）
                    }

                    const staffKey = `reservation_${selectedDate}_${timeString}_staff_${i}`;
                    td.addEventListener('click', (e) => handleCellClick(e, staffNames[i - 1], i, timeString, td));

                    if (td.classList.contains('booked')) {
                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => {
                            draggedSourceKey = data.id; // Use DB ID
                            td.classList.add('dragging');
                            e.dataTransfer.setData('text/plain', data.id);
                        });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });
                    }
                    td.addEventListener('dragover', (e) => { if (td.classList.contains('booked') && data && data.id !== draggedSourceKey) return; if (isStaffOff) return; e.preventDefault(); td.classList.add('drag-over'); });
                    td.addEventListener('dragleave', () => td.classList.remove('drag-over'));
                    td.addEventListener('drop', (e) => {
                        e.preventDefault();
                        td.classList.remove('drag-over');
                        const sid = draggedSourceKey || e.dataTransfer.getData('text/plain');
                        if (!sid || sid === (data ? data.id : null)) return;
                        handleDrop(sid, selectedDate, timeString, 'staff', i);
                    });
                    tr.appendChild(td);
                }

                // Anti Slots
                for (let i = 1; i <= ANTI_COUNT; i++) {
                    const td = document.createElement('td');
                    td.dataset.time = timeString;
                    td.dataset.type = 'anti';
                    td.dataset.index = i;

                    const data = timeData.anti[i];
                    if (data) {
                        td.classList.add('booked');
                        if (data.status === 'arrived') td.classList.add('status-arrived');
                        else if (data.status === 'canceled') td.classList.add('status-canceled');
                        else { td.style.backgroundColor = '#e0f2fe'; td.style.color = '#0369a1'; td.style.border = '2px solid #38bdf8'; }

                        const units = data.units || 1;
                        td.dataset.resStart = data.res_time;
                        td.dataset.resId = data.id;

                        const fullRemarks = data.remarks || '';
                        const isWalkIn = fullRemarks.startsWith('[予約外]');
                        const displayRemarks = isWalkIn ? fullRemarks.replace('[予約外]', '').trim() : fullRemarks;

                        if (isWalkIn) td.classList.add('is-walk-in');

                        const unitsLabel = units > 1 ? ` <span style="color:#6366f1; font-weight:800; font-size:0.65rem;">(${units}単位)</span>` : '';

                        if (data.is_inpatient_block) {
                            td.style.backgroundColor = '#fdf2f8'; td.style.color = '#be185d'; td.style.border = '2px solid #f43f5e';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}🏥 入院患者介入枠${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        } else if (data.is_meeting) {
                            td.style.backgroundColor = '#ecfdf5'; td.style.color = '#065f46'; td.style.border = '2px solid #10b981';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}💬 面談: ${data.patient_name || '未指定'}${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}${data.patient_name || '無名'}${unitsLabel}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        }

                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => {
                            draggedSourceKey = data.id;
                            td.classList.add('dragging');
                            e.dataTransfer.setData('text/plain', data.id);
                        });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });

                    }
                    const antiKey = `reservation_${selectedDate}_${timeString}_anti_${i}`;
                    td.addEventListener('click', (e) => handleCellClick(e, '消炎', i, timeString, td));
                    if (td.classList.contains('booked')) {
                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => {
                            draggedSourceKey = data.id;
                            td.classList.add('dragging');
                            e.dataTransfer.setData('text/plain', data.id);
                        });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });
                    }
                    td.addEventListener('dragover', (e) => { if (td.classList.contains('booked') && data && data.id !== draggedSourceKey) return; e.preventDefault(); td.classList.add('drag-over', 'anti-cell'); });
                    td.addEventListener('dragleave', () => td.classList.remove('drag-over', 'anti-cell'));
                    td.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        td.classList.remove('drag-over', 'anti-cell');
                        const sid = draggedSourceKey || e.dataTransfer.getData('text/plain');
                        if (!sid || sid === (data ? data.id : null)) return;
                        handleDrop(sid, selectedDate, timeString, 'anti', i);
                    });
                    tr.appendChild(td);
                }
                scheduleBody.appendChild(tr);
            }
            currentTime.setMinutes(currentTime.getMinutes() + INTERVAL_MINUTES);
        }

        renderCanceledList(selectedDate);
        updateDailyStats(selectedDate);
        updateInpatientWeeklyUnits();
        updateStaffUnitInputs(dbReservations || []);
    };

    // 🏥 入院介入実施（内訳入力）の永続化と連動
    const INPATIENT_CATEGORIES = ['locomotor', 'cerebro', 'disuse'];
    const INPATIENT_SUB_CATEGORIES = {
        locomotor: ['150', 'deduction'],
        cerebro: ['180', 'deduction'],
        disuse: ['120', 'deduction']
    };

    const updateInpatientManualStats = () => {
        const selectedDate = targetDateInput.value;
        let totalUnits = 0;
        let totalCases = 0;

        INPATIENT_CATEGORIES.forEach(cat => {
            const casesInput = document.getElementById(`inpatient-${cat}-cases`);
            const unitsInput = document.getElementById(`inpatient-${cat}-units`);

            if (casesInput && unitsInput) {
                totalUnits += parseFloat(unitsInput.value) || 0;
                totalCases += parseInt(casesInput.value) || 0;
            }

            // Sub-categories (threshold, deduction)
            const subs = INPATIENT_SUB_CATEGORIES[cat] || [];
            subs.forEach(sub => {
                const sCasesInput = document.getElementById(`inpatient-${cat}-${sub}-cases`);
                const sUnitsInput = document.getElementById(`inpatient-${cat}-${sub}-units`);
                // Sub-category units are NOT added to the main total again
            });
        });

        const actualUnitsEl = document.getElementById('inpatient-actual-units');
        if (actualUnitsEl) actualUnitsEl.textContent = totalUnits;
        
        const actualCasesEl = document.getElementById('inpatient-actual-cases');
        if (actualCasesEl) actualCasesEl.textContent = totalCases;
    };

    // 🏢 介護医療院介入実施（内訳入力）の永続化と連動
    const updateNursingManualStats = () => {
        const casesInput = document.getElementById('nursing-manual-cases');
        const unitsInput = document.getElementById('nursing-manual-units');
        const dCasesInput = document.getElementById('nursing-manual-deduction-cases');
        const dUnitsInput = document.getElementById('nursing-manual-deduction-units');

        let totalUnits = 0;
        let totalCases = 0;

        if (unitsInput) totalUnits = parseFloat(unitsInput.value) || 0;
        if (casesInput) totalCases = parseInt(casesInput.value) || 0;

        const actualUnitsEl = document.getElementById('nursing-actual-units');
        if (actualUnitsEl) actualUnitsEl.textContent = totalUnits;
        
        const actualCasesEl = document.getElementById('nursing-actual-cases');
        if (actualCasesEl) actualCasesEl.textContent = totalCases;
    };

        INPATIENT_CATEGORIES.forEach(cat => {
            const setupInput = (id) => {
                const input = document.getElementById(id);
                if (!input) return;
                input.addEventListener('input', () => {
                    input._manuallyUpdated = true;
                    
                    // For main units, also sync with cases if needed
                    if (id.endsWith('-units') && !id.includes('-150-') && !id.includes('-180-') && !id.includes('-120-') && !id.includes('-deduction-')) {
                        const cId = id.replace('-units', '-cases');
                        const cInput = document.getElementById(cId);
                        if (cInput) {
                            cInput.value = input.value;
                        }
                    }
                    
                    updateInpatientManualStats();
                    syncManualMetricsToSupabase(); // Supabaseへ同期
                    setTimeout(() => { input._manuallyUpdated = false; }, 100);
                });
            };

            setupInput(`inpatient-${cat}-cases`);
            setupInput(`inpatient-${cat}-units`);

            const subs = INPATIENT_SUB_CATEGORIES[cat] || [];
            subs.forEach(sub => {
                setupInput(`inpatient-${cat}-${sub}-cases`);
                setupInput(`inpatient-${cat}-${sub}-units`);
            });
        });

        // 介護内訳用
        const setupNursingInput = (id) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('input', () => {
                input._manuallyUpdated = true;
                updateNursingManualStats();
                syncManualMetricsToSupabase();
                setTimeout(() => { input._manuallyUpdated = false; }, 100);
            });
        };
        setupNursingInput('nursing-manual-cases');
        setupNursingInput('nursing-manual-units');
        setupNursingInput('nursing-manual-deduction-cases');
        setupNursingInput('nursing-manual-deduction-units');

    // --- スタッフ別・消炎別の単位数を入力欄に自動セット ---
    const updateStaffUnitInputs = (reservations) => {
        const staffTotals = {};
        let antiTotal = 0;

        reservations.forEach(res => {
            if (res.status === 'canceled') return;
            const units = parseInt(res.units) || 1;
            if (res.res_type === 'staff') {
                const idx = res.res_index;
                staffTotals[idx] = (staffTotals[idx] || 0) + units;
            } else if (res.res_type === 'anti') {
                antiTotal += units;
            }
        });

        for (let i = 1; i <= STAFF_COUNT; i++) {
            const input = document.getElementById(`staff-units-${i}`);
            if (input) {
                const selectedDate = targetDateInput.value;
                const manualVal = localStorage.getItem(`manual_staff_units_${selectedDate}_${i}`);
                input.value = manualVal !== null ? manualVal : (staffTotals[i] || 0);
            }
        }

        const antiInput = document.getElementById('anti-units-1');
        if (antiInput) {
            const selectedDate = targetDateInput.value;
            const manualAnti = localStorage.getItem(`manual_anti_units_${selectedDate}_1`);
            antiInput.value = manualAnti !== null ? manualAnti : antiTotal;
        }

        // 入院介入の入力値を復元
        updateInpatientManualStats();

        // スタッフ枠の合計値を「1日必要単位数」へ反映
        updateManualTotalFromFields();
    };

    // 入力欄の値から合計を計算して「1日必要単位数」を更新する
    const updateManualTotalFromFields = () => {
        let total = 0;
        for (let i = 1; i <= STAFF_COUNT; i++) {
            const input = document.getElementById(`staff-units-${i}`);
            if (input) {
                total += parseInt(input.value) || 0;
            }
        }
        const manualTotalInput = document.getElementById('manual-total-units');
        if (manualTotalInput) {
            manualTotalInput.value = total;
        }
    };

    const updateDailyStats = async (dateStr) => {
        // --- 手動入力項目をSupabaseから同期 ---
        const loadManualMetricsFromSupabase = async (dStr) => {
            const { data, error } = await supabase
                .from('reservations')
                .select('remarks')
                .eq('res_date', dStr)
                .eq('patient_id', '_METRICS_')
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0 && data[0].remarks) {
                try {
                    const metrics = JSON.parse(data[0].remarks);
                    // 1日必要単位数
                    const ritualUnits = document.getElementById('manual-total-units');
                    if (ritualUnits && metrics.manual_total_units !== undefined) {
                        ritualUnits.value = metrics.manual_total_units;
                    }
                    // スタッフ別・消炎単位数
                    for (let i = 1; i <= STAFF_COUNT; i++) {
                        const input = document.getElementById(`staff-units-${i}`);
                        if (input && metrics[`staff_units_${i}`] !== undefined) {
                            input.value = metrics[`staff_units_${i}`];
                        }
                    }
                    const antiInput = document.getElementById('anti-units-1');
                    if (antiInput && metrics.manual_anti_units_1 !== undefined) {
                        antiInput.value = metrics.manual_anti_units_1;
                    }
                    // 入院内訳
                    INPATIENT_CATEGORIES.forEach(cat => {
                        const keys = [`inpatient-${cat}-cases`, `inpatient-${cat}-units`];
                        const subs = INPATIENT_SUB_CATEGORIES[cat] || [];
                        subs.forEach(sub => {
                            keys.push(`inpatient-${cat}-${sub}-cases`);
                            keys.push(`inpatient-${cat}-${sub}-units`);
                        });
                        
                        keys.forEach(key => {
                            const el = document.getElementById(key);
                            if (el && metrics[key] !== undefined) {
                                el.value = metrics[key];
                            }
                        });
                    });
                    
                    // 介護内訳
                    const nursingKeys = ['nursing-manual-cases', 'nursing-manual-units', 'nursing-manual-deduction-cases', 'nursing-manual-deduction-units'];
                    nursingKeys.forEach(key => {
                        const el = document.getElementById(key);
                        if (el && metrics[key] !== undefined) {
                            el.value = metrics[key];
                        }
                    });
                } catch (e) {
                    console.error("Manual metrics parse error:", e);
                }
            }
        };

        await loadManualMetricsFromSupabase(dateStr);

        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', dateStr)
            .neq('patient_id', '_METRICS_') // 集計からは除外
            .not('patient_name', 'eq', '_staff_attendance_'); // 出勤設定レコードを除外

        if (error || !data) return;

        const patientIds = [...new Set(data.map(r => r.patient_id).filter(id => id && id !== 'INPATIENT'))];
        const { data: pData } = await supabase.from('patients').select('p_id, p_type, p_nursing_care').in('p_id', patientIds);
        const patientMap = {};
        if (pData) pData.forEach(p => patientMap[p.p_id] = p);

        let staffUnits = 0;
        let staffCases = 0;
        let antiUnits = 0;
        let antiCases = 0;
        let cancelCount = 0;

        let inpatientPlannedUnits = 0;
        let inpatientPlannedCases = 0;
        let inpatientActualUnits = 0;
        let inpatientActualCases = 0;
        
        let outpatientPlannedUnits = 0;
        let outpatientPlannedCases = 0;
        let outpatientActualUnits = 0;
        let outpatientActualCases = 0;
        
        let nursingActualUnits = 0;
        let nursingActualCases = 0;
        
        let inpatientMeetingCases = 0;
        let nursingMeetingCases = 0;

        // 枠ごとの重複を排除（同じ時間・タイプ・インデックスの重複があれば、arrivedを最優先、次にbookedを優先）
        const deduplicatedMap = {};
        data.forEach(res => {
            const key = `${res.res_time}_${res.res_type}_${res.res_index}`;
            const existing = deduplicatedMap[key];
            if (!existing) {
                deduplicatedMap[key] = res;
            } else {
                // 優先度: arrived > booked > その他 (canceledなど)
                const priority = (s) => (s === 'arrived' ? 3 : s === 'booked' ? 2 : 1);
                if (priority(res.status) > priority(existing.status)) {
                    deduplicatedMap[key] = res;
                }
            }
        });

        Object.values(deduplicatedMap).forEach(res => {
            const units = parseInt(res.units) || 1;
            const isInpatient = res.is_inpatient_block === true;
            const isMeeting = res.is_meeting === true;

            if (res.status === 'canceled') {
                cancelCount++;
            } else {
                if (!isMeeting) {
                    if (res.res_type === 'staff') {
                        staffUnits += units;
                        staffCases += 1;
                    } else if (res.res_type === 'anti') {
                        antiUnits += units;
                        antiCases += 1;
                    }
                }

                if (isMeeting) {
                    const p = patientMap[res.patient_id];
                    // 介護医療院の患者かどうかを正確に判定
                    // patients テーブルでは p_type='admission' かつ p_nursing_care=true が介護
                    const isNursingCarePatient = p && (
                        p.p_type === 'nursing_care' ||             // 旧形式
                        (p.p_type === 'admission' && p.p_nursing_care === true) // 現行形式
                    );
                    if (isNursingCarePatient) {
                        nursingMeetingCases += 1;
                    } else {
                        inpatientMeetingCases += 1;
                    }
                } else if (isInpatient) {
                    inpatientPlannedUnits += units;
                    inpatientPlannedCases += 1;
                    if (res.status === 'arrived') {
                        inpatientActualUnits += units;
                        inpatientActualCases += 1;
                    }
                } else {
                    const p = patientMap[res.patient_id];
                    // 介護医療院の判定: p_type='admission' かつ p_nursing_care=true が必須条件
                    // 外来患者 (p_type='outpatient') は p_nursing_care が true でも外来としてカウント
                    const isNursingCarePatient = p && (
                        p.p_type === 'nursing_care' ||   // 旧形式
                        (p.p_type === 'admission' && p.p_nursing_care === true)  // 現行形式
                    );
                    if (isNursingCarePatient) {
                        // 介護の計画数は現状管理していないが、実績は'arrived'のみをカウント
                        if (res.status === 'arrived') {
                            nursingActualUnits += units;
                            nursingActualCases += 1;
                        }
                    } else {
                        outpatientPlannedUnits += units;
                        outpatientPlannedCases += 1;
                        if (res.status === 'arrived') {
                            outpatientActualUnits += units;
                            outpatientActualCases += 1;
                        }
                    }
                }
            }
        });

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('total-units-count', staffUnits);
        setVal('total-cases-count', staffCases);
        setVal('staff-units-count', staffUnits);
        setVal('staff-cases-count', staffCases);
        setVal('anti-units-count', antiUnits);
        setVal('anti-cases-count', antiCases);
        setVal('total-cancellations-count', cancelCount);

        setVal('inpatient-planned-units', inpatientPlannedUnits);
        setVal('inpatient-planned-cases', inpatientPlannedCases);
        setVal('inpatient-actual-units', inpatientActualUnits);
        setVal('inpatient-actual-cases', inpatientActualCases);
        setVal('inpatient-meeting-cases', inpatientMeetingCases);
        
        setVal('outpatient-planned-units', outpatientPlannedUnits);
        setVal('outpatient-planned-cases', outpatientPlannedCases);
        setVal('outpatient-actual-units', outpatientActualUnits);
        setVal('outpatient-actual-cases', outpatientActualCases);
        
        setVal('nursingActualUnits', nursingActualUnits);
        setVal('nursing-actual-units', nursingActualUnits);
        setVal('nursing-actual-cases', nursingActualCases);
        setVal('nursing-meeting-cases', nursingMeetingCases);

        // 全体実績合計の計算 (入院+外来のみ)
        const updateGrandTotalActual = () => {
            const iActual = parseInt(document.getElementById('inpatient-actual-units').textContent) || 0;
            const oActual = parseInt(document.getElementById('outpatient-actual-units').textContent) || 0;
            const grandTotal = iActual + oActual; // 介護は含めない
            setVal('total-overall-actual-units', grandTotal);
        };

        // 各内訳入力がある場合は、その合計値で上書きする
        updateInpatientManualStats();
        updateNursingManualStats();
        
        // 全体の最終的な実績合計を表示
        updateGrandTotalActual();

        // 1日必要単位数にスタッフ枠の合計を自動反映（手動入力がある場合はそれを優先）
        updateManualTotalFromFields();

        // 自動入力ボタンの設定（1回だけイベントを付ける）
        const syncBtn = document.getElementById('sync-units-btn');
        if (syncBtn && !syncBtn._listenerAdded) {
            syncBtn._listenerAdded = true;
            syncBtn.addEventListener('click', () => {
                const input = document.getElementById('manual-total-units');
                if (input) {
                    input.value = staffUnits;
                    input.style.borderColor = '#22c55e';
                    setTimeout(() => { input.style.borderColor = '#86efac'; }, 1000);
                }
            });
        }
    };

    // --- 入院週間予定単位数の計算 ---
    const updateInpatientWeeklyUnits = async () => {
        const { data: patients, error } = await supabase
            .from('patients')
            .select('p_id, p_name, p_category, p_diagnosis_date, p_nursing_care')
            .eq('p_type', 'admission');

        if (error || !patients) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalWeeklyUnits = 0;
        const details = [];

        patients.forEach(p => {
            if (!p.p_diagnosis_date || !p.p_category) return;

            const diagDate = new Date(p.p_diagnosis_date);
            diagDate.setHours(0, 0, 0, 0);
            const elapsedDays = Math.floor((today - diagDate) / (1000 * 60 * 60 * 24));
            const hasNursingCare = !!p.p_nursing_care;

            let threshold = 0;
            let weeklyUnits = 0;
            let rule = '';

            if (p.p_category === '運動器') {
                threshold = 150;
            } else if (p.p_category === '脳血管') {
                threshold = 180;
            } else if (p.p_category === '廃用') {
                threshold = 120;
            } else {
                return; // その他は対象外
            }

            if (elapsedDays <= threshold) {
                weeklyUnits = 3;
                rule = `${threshold}日以内 → 週3単位`;
            } else if (hasNursingCare) {
                weeklyUnits = 1;
                rule = `${threshold}日超 / 要介護あり → 週1単位`;
            } else {
                weeklyUnits = 2;
                rule = `${threshold}日超 / 要介護なし → 週2単位`;
            }

            totalWeeklyUnits += weeklyUnits;
            details.push({ name: p.p_name, category: p.p_category, weeklyUnits, rule, elapsedDays });
        });

        const weeklyEl = document.getElementById('inpatient-weekly-units');
        const countEl = document.getElementById('inpatient-weekly-count');
        const detailEl = document.getElementById('inpatient-weekly-detail');

        if (weeklyEl) weeklyEl.textContent = totalWeeklyUnits;
        if (countEl) countEl.textContent = details.length;
        if (detailEl) {
            detailEl.innerHTML = details.map(d =>
                `<span style="display:flex; justify-content:space-between; gap:0.5rem;">
                    <span><strong>${d.name}</strong> (${d.category}・${d.elapsedDays}日)</span>
                    <span style="font-weight:700; color:#581c87;">週${d.weeklyUnits}</span>
                </span>`
            ).join('');
        }
    };

    const renderCanceledList = async (dateStr) => {
        const container = document.getElementById('canceled-list-container');
        if (!container) return;

        const { data: dbCanceled, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', dateStr)
            .eq('status', 'canceled');

        if (error || !dbCanceled) return;

        const canceledItems = dbCanceled.map(d => {
            const typeNameStr = d.res_type === 'staff' ? 'スタッフ' : '消炎';
            return {
                id: d.id,
                time: d.res_time,
                type: `${typeNameStr}枠 ${d.res_index}`,
                units: d.units || 1,
                patientName: d.patient_name,
                patientId: d.patient_id,
                reason: d.remarks || '理由なし',
                fullData: d
            };
        });

        // Sort by time
        canceledItems.sort((a, b) => a.time.localeCompare(b.time));

        container.innerHTML = '';
        if (canceledItems.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">現在、該当するキャンセルデータはありません。</p>`;
            return;
        }

        canceledItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'canceled-item-row';
            div.style.padding = '0.75rem';
            div.style.backgroundColor = '#f9fafb';
            div.style.border = '1px solid #e5e7eb';
            div.style.borderRadius = 'var(--border-radius-sm)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.marginBottom = '0.5rem';
            div.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.1rem; font-weight: 800; color: #ef4444; border: 1px solid #fee2e2; background: #fff1f2; padding: 2px 6px; border-radius: 4px;">${item.time}</span>
                        <span style="font-weight: 700; color: #111827; font-size: 1rem;">${item.patientName || '無名'}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #6b7280; display: flex; gap: 0.5rem; align-items: center;">
                        <span style="background: #f3f4f6; padding: 1px 6px; border-radius: 4px;">${item.type}</span>
                        <span>/</span>
                        <span>${item.units}枠分</span>
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; border: 1px solid #fecaca;">${item.reason}</span>
                </div>
            `;
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => openCancelDetailsModal(item.fullData, item.time));
            container.appendChild(div);
        });
    };

    // Modal Logic
    const bookingModal = document.getElementById('booking-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const bookingForm = document.getElementById('booking-form');
    const modalSubtitle = document.getElementById('modal-subtitle');
    let currentSelectedCell = null;

    // --- Auto-fill from Patient DB (Supabase Optimized) ---
    const populateDatalists = async () => {
        const idList = document.getElementById('patient-id-list');
        const nameList = document.getElementById('patient-name-list');
        const inpatientDatalist = document.getElementById('inpatient-list');

        // Helper to normalize strings for comparison
        const normalize = (str) => {
            if (!str) return '';
            return str.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (s) => {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            }).replace(/ー/g, '-').trim();
        };

        if (idList && nameList) {
            idList.innerHTML = '';
            nameList.innerHTML = '';
            const { data: outpatients } = await supabase.from('patients').select('p_id, p_name').eq('p_type', 'outpatient');
            
            if (outpatients) {
                const uniqueIds = new Set();
                const uniqueNames = new Set();
                
                outpatients.forEach(patient => {
                    const normId = normalize(patient.p_id);
                    const normName = patient.p_name ? patient.p_name.trim() : '';

                    if (normId && !uniqueIds.has(normId)) {
                        const idOption = document.createElement('option');
                        idOption.value = normId; // Store normalized ID
                        idList.appendChild(idOption);
                        uniqueIds.add(normId);
                    }

                    if (normName && !uniqueNames.has(normName)) {
                        const nameOption = document.createElement('option');
                        nameOption.value = normName;
                        nameList.appendChild(nameOption);
                        uniqueNames.add(normName);
                    }
                });
            }
        }

        if (inpatientDatalist) {
            inpatientDatalist.innerHTML = '';
            // 入院と介護の両方を取得
            const { data: nonOutpatients } = await supabase
                .from('patients')
                .select('p_id, p_name, p_type, p_nursing_care')
                .neq('p_type', 'outpatient');

            if (nonOutpatients) {
                const uniqueInpatientEntries = new Set();
                nonOutpatients.forEach(p => {
                    const normId = normalize(p.p_id);
                    const normName = p.p_name ? p.p_name.trim() : '';
                    
                    // タイプ判定
                    const isNursing = (p.p_type === 'nursing_care' || (p.p_type === 'admission' && p.p_nursing_care === true));
                    const typeLabel = isNursing ? '(介護)' : '(入院)';
                    
                    const entryValue = `${normId} : ${normName} ${typeLabel}`;
                    
                    if (!uniqueInpatientEntries.has(entryValue)) {
                        const opt = document.createElement('option');
                        opt.value = entryValue;
                        inpatientDatalist.appendChild(opt);
                        uniqueInpatientEntries.add(entryValue);
                    }
                });
            }
        }
    };

    const patientIdInput = document.getElementById('patient-id');
    const patientNameInput = document.getElementById('patient-name');
    const treatmentDetailsInput = document.getElementById('treatment-details');

    if (patientIdInput && patientNameInput) {
        // Utility for half-width conversion
        const toHalfWidth = (str) => {
            return str.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (s) => {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            }).replace(/ー/g, '-');
        };

        // Auto-fill when ID is entered
        patientIdInput.addEventListener('change', async (e) => {
            const val = toHalfWidth(e.target.value);
            e.target.value = val;

            if (!val) return;
            const { data: found } = await supabase.from('patients').select('p_name, p_disease').eq('p_id', val).eq('p_type', 'outpatient').single();
            if (found) {
                patientNameInput.value = found.p_name;
                if (treatmentDetailsInput) treatmentDetailsInput.value = found.p_disease || '';
            }
        });

        // Auto-fill when Name is entered
        patientNameInput.addEventListener('change', async (e) => {
            const val = e.target.value.trim();
            if (!val) return;
            const { data: matched } = await supabase.from('patients').select('p_id, p_disease').eq('p_name', val).eq('p_type', 'outpatient');
            const found = matched && matched.length > 0 ? matched[0] : null;
            if (found) {
                patientIdInput.value = found.p_id;
                if (treatmentDetailsInput) treatmentDetailsInput.value = found.p_disease || '';
            }
        });
    }

    // --- Inpatient / Meeting / Outpatient Field Logic ---
    const bookingTypeRadios = document.querySelectorAll('input[name="booking-type"]');
    const outpatientFields = document.getElementById('outpatient-fields');
    const inpatientSelectionFields = document.getElementById('inpatient-selection-fields');
    const inpatientIdInput = document.getElementById('inpatient-id');

    if (bookingTypeRadios.length > 0 && outpatientFields && inpatientSelectionFields) {
        bookingTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'outpatient') {
                    outpatientFields.style.display = 'block';
                    inpatientSelectionFields.style.display = 'none';
                    patientNameInput.setAttribute('required', 'true');
                    inpatientIdInput.removeAttribute('required');
                } else if (val === 'inpatient') {
                    outpatientFields.style.display = 'none';
                    inpatientSelectionFields.style.display = 'none';
                    patientIdInput.removeAttribute('required');
                    patientNameInput.removeAttribute('required');
                    inpatientIdInput.removeAttribute('required');
                } else if (val === 'meeting') {
                    outpatientFields.style.display = 'none';
                    inpatientSelectionFields.style.display = 'block';
                    patientIdInput.removeAttribute('required');
                    patientNameInput.removeAttribute('required');
                    inpatientIdInput.setAttribute('required', 'true');
                }
            });
        });
    }

    // ---------------------------------

    const statusModal = document.getElementById('status-modal');
    const closeStatusModalBtn = document.getElementById('close-status-modal-btn');
    const statusModalSubtitle = document.getElementById('status-modal-subtitle');
    const btnStatusArrived = document.getElementById('btn-status-arrived');
    const btnStatusCanceled = document.getElementById('btn-status-canceled');
    const btnStatusDelete = document.getElementById('btn-status-delete');

    let currentReservationId = null;
    let currentReservationKey = null;

    const handleCellClick = async (e, typeName, index, time, tdElement) => {
        const dateStr = targetDateInput.value;
        const isHoliday = isNonWorkingDay(dateStr);
        const isExisting = tdElement.classList.contains('booked') || tdElement.classList.contains('continued-slot');

        currentSelectedCell = tdElement;

        const resId = tdElement.dataset.resId;
        let existing = null;
        if (resId) {
            const { data, error } = await supabase.from('reservations').select('*').eq('id', resId).single();
            if (!error) existing = data;
        }

        // Check if already booked
        if (isExisting && existing) {
            const data = existing;
            // Fetch patient diagnosis from patients table
            const { data: patient } = await supabase.from('patients').select('p_diagnosis_date').eq('p_id', data.patient_id).single();
            const diagnosisDate = patient ? (patient.p_diagnosis_date || '未登録') : '未登録';

            statusModalSubtitle.textContent = `${data.patient_name} (${data.patient_id})`;
            document.getElementById('status-modal-diagnosis-date').innerHTML = `<strong>診断日:</strong> ${diagnosisDate} | <strong>日時:</strong> ${dateStr} ${time}`;
            currentReservationId = data.id; // Store DB ID instead of key
            statusModal.classList.add('show');
            return;
        }

        // Setup modal text for new booking
        modalSubtitle.textContent = `予約日時: ${targetDateInput.value} ${time} | ${typeName}枠 ${index}`;

        // Reset booking type to default (outpatient)
        const defaultRadio = document.querySelector('input[name="booking-type"][value="outpatient"]');
        if (defaultRadio) {
            defaultRadio.checked = true;
            defaultRadio.dispatchEvent(new Event('change'));
        }

        // Populate datalists from DB
        await populateDatalists();

        // Show booking modal
        bookingModal.classList.add('show');
    };

    const closeBookingModal = () => {
        bookingModal.classList.remove('show');
        bookingForm.reset();
        currentSelectedCell = null;
    };

    const closeStatusModal = () => {
        statusModal.classList.remove('show');
        currentReservationKey = null;
    };

    // --- Cancel Details Modal Logic ---
    const cancelDetailsModal = document.getElementById('cancel-details-modal');
    const closeCancelDetailsBtn = document.getElementById('close-cancel-details-btn');
    const cancelDetailsContent = document.getElementById('cancel-details-content');
    const btnDeleteCanceled = document.getElementById('btn-delete-canceled');
    let currentCanceledKey = null;
    let currentCanceledData = null; // Store full data for deletion sync
    let currentCanceledTime = null;

    const openCancelDetailsModal = async (data, timeStr) => {
        currentCanceledKey = data.key;
        currentCanceledData = data;
        currentCanceledTime = timeStr;

        let originalTypeStr = data.originalType || '不明';

        const currentDate = document.getElementById('target-date').value;

        const { data: patient } = await supabase.from('patients').select('p_diagnosis_date').eq('p_id', data.patient_id).single();
        const diagnosisDate = patient ? (patient.p_diagnosis_date || '未登録') : '未登録';

        const pName = data.patient_name || data.patientName || '無名';
        const pId = data.patient_id || data.patientId || '不明';
        const cancelReason = data.cancel_reason || data.cancelReason || '理由なし';

        cancelDetailsContent.innerHTML = `
            <div style="padding: 0.5rem; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 0.5rem;">
                <p style="margin: 0.25rem 0;"><strong>患者名:</strong> ${pName} (${pId})</p>
                <p style="margin: 0.25rem 0;"><strong>診断日:</strong> ${diagnosisDate}</p>
                <p style="margin: 0.25rem 0;"><strong>日時:</strong> ${currentDate} ${timeStr}</p>
                <p style="margin: 0.25rem 0;"><strong>元の予約:</strong> ${originalTypeStr}</p>
                <p style="margin: 0.25rem 0;"><strong>単位数:</strong> ${data.units || 1}枠 (${(data.units || 1) * 20}分)</p>
                <p style="margin: 0.25rem 0;"><strong>備考:</strong> ${data.remarks || 'なし'}</p>
            </div>
            <div style="padding: 0.5rem; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca; color: #b91c1c;">
                <p style="margin: 0.25rem 0;"><strong>キャンセル理由:</strong> ${cancelReason}</p>
            </div>
        `;

        cancelDetailsModal.classList.add('show');
    };

    const closeCancelDetailsModal = () => {
        cancelDetailsModal.classList.remove('show');
        currentCanceledKey = null;
    };

    if (closeCancelDetailsBtn) {
        closeCancelDetailsBtn.addEventListener('click', closeCancelDetailsModal);
    }

    if (btnDeleteCanceled) {
        btnDeleteCanceled.addEventListener('click', async () => {
            if (!currentCanceledData) return;
            if (confirm('このキャンセル履歴を完全に削除しますか？\n（患者データの履歴からも消去されます）')) {
                // Remove from patient history DB
                await recordHistoryToDB(currentCanceledData.patient_id, currentCanceledData.res_date, currentCanceledData.res_time, '', 'delete_history');

                // Remove from schedule DB
                await supabase.from('reservations').delete().eq('id', currentCanceledData.id);

                await createSchedule();
                closeCancelDetailsModal();
            }
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeBookingModal);
    }

    // Close when clicking outside of modal content
    window.addEventListener('click', (e) => {
        if (e.target === bookingModal) {
            closeBookingModal();
        }
        if (e.target === statusModal) {
            closeStatusModal();
        }
        if (e.target === cancelDetailsModal) {
            closeCancelDetailsModal();
        }
    });

    // --- Drag and Drop handleDrop Implementation (Supabase) ---
    const handleDrop = async (sourceId, targetDate, targetTime, targetType, targetIndex) => {

        // Check in DB if target slot is occupied
        const { data: existing } = await supabase
            .from('reservations')
            .select('id')
            .eq('res_date', targetDate)
            .eq('res_time', targetTime)
            .eq('res_type', targetType)
            .eq('res_index', targetIndex)
            .neq('id', sourceId) // Exclude self
            .single();

        if (existing) {
            alert('移動先に他の予約が入っています。');
            return;
        }

        // Check staff off
        if (targetType === 'staff') {
            const targetAttendance = await getStaffAttendance(targetDate);
            if (targetAttendance[targetIndex - 1] && targetAttendance[targetIndex - 1] !== 'work') {
                alert('移動先のスタッフはお休みです。');
            }
        }

        // Perform move
        await supabase.from('reservations').update({
            res_date: targetDate,
            res_time: targetTime,
            res_type: targetType,
            res_index: parseInt(targetIndex)
        }).eq('id', sourceId);

        await createSchedule();
    };

    // --- Staff Settings Modal Logic ---
    const staffSettingsBtn = document.getElementById('staff-settings-btn');
    const staffSettingsModal = document.getElementById('staff-settings-modal');
    const closeStaffSettingsBtn = document.getElementById('close-staff-settings-btn');
    const staffSettingsForm = document.getElementById('staff-settings-form');
    const staffInputsContainer = document.getElementById('staff-inputs-container');
    const staffSettingsDateLabel = document.getElementById('staff-settings-date-label');

    const openStaffSettingsModal = async () => {
        const selectedDate = targetDateInput.value;
        staffSettingsDateLabel.textContent = `対象日: ${selectedDate}`;

        const names = await getStaffData();
        const attendance = await getStaffAttendance(selectedDate);

        staffInputsContainer.innerHTML = '';
        names.forEach((name, i) => {
            const div = document.createElement('div');
            div.style.display = 'grid';
            div.style.gridTemplateColumns = '1fr auto';
            div.style.alignItems = 'center';
            div.style.gap = '1rem';
            div.style.padding = '0.5rem';
            div.style.background = '#f9fafb';
            div.style.borderRadius = '6px';
            div.style.border = '1px solid #e5e7eb';

            div.innerHTML = `
                <div>
                    <label style="display: block; font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">スタッフ ${i + 1} の名前</label>
                    <input type="text" class="staff-name-input" data-index="${i}" value="${name}" style="width: 100%; padding: 0.4rem; border: 1px solid #d1d5db; border-radius: 4px;">
                </div>
                <div style="text-align: right;">
                    <label style="display: block; font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">出勤設定</label>
                    <select class="staff-attendance-select" data-index="${i}" style="padding: 0.4rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; cursor: pointer;">
                        <option value="work" ${attendance[i] === 'work' || !attendance[i] ? 'selected' : ''}>出勤</option>
                        <option value="off" ${attendance[i] === 'off' || attendance[i] === true ? 'selected' : ''}>全日休み</option>
                        <option value="morning_off" ${attendance[i] === 'morning_off' ? 'selected' : ''}>午前休み</option>
                        <option value="afternoon_off" ${attendance[i] === 'afternoon_off' ? 'selected' : ''}>午後休み</option>
                    </select>
                </div>
            `;
            staffInputsContainer.appendChild(div);
        });

        staffSettingsModal.classList.add('show');
    };

    const closeStaffSettingsModal = () => {
        staffSettingsModal.classList.remove('show');
    };

    if (staffSettingsBtn) {
        staffSettingsBtn.addEventListener('click', openStaffSettingsModal);
    }

    if (closeStaffSettingsBtn) {
        closeStaffSettingsBtn.addEventListener('click', closeStaffSettingsModal);
    }

    if (staffSettingsForm) {
        staffSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedDate = targetDateInput.value;

            const nameInputs = document.querySelectorAll('.staff-name-input');
            const attendanceSelects = document.querySelectorAll('.staff-attendance-select');

            const newNames = [];
            const newAttendance = [];

            nameInputs.forEach((input, i) => {
                newNames.push(input.value || `スタッフ ${i + 1}`);
            });

            attendanceSelects.forEach((select) => {
                newAttendance.push(select.value);
            });

            try {
                await saveStaffData(newNames);
                await saveStaffAttendance(selectedDate, newAttendance);

                await createSchedule();
                closeStaffSettingsModal();
                alert('スタッフ設定を保存しました。');
            } catch (err) {
                console.error(err);
                alert("エラーが発生しました: " + err.message);
            }
        });
    }

    if (closeStatusModalBtn) {
        closeStatusModalBtn.addEventListener('click', closeStatusModal);
    }

    // Close when clicking outside of modal content
    window.addEventListener('click', (e) => {
        if (e.target === bookingModal) {
            closeBookingModal();
        }
        if (e.target === statusModal) {
            closeStatusModal();
        }
        if (e.target === cancelDetailsModal) {
            closeCancelDetailsModal();
        }
    });

    const calculateDocSubmissionDate = (category, nextDate, holidays) => {
        if (!nextDate) return null;
        const d = new Date(nextDate);
        d.setDate(d.getDate() - 2);

        let targetDr = null;
        if (category.includes('運動器')) targetDr = 'suzuki';
        else if (category.includes('脳血管') || category.includes('廃用')) targetDr = 'tsukamoto';

        if (!targetDr) return d.toISOString().split('T')[0];

        let safetyCounter = 0;
        while (safetyCounter < 30) {
            const dateStr = d.toISOString().split('T')[0];
            // 日本の祝日と日曜日の判定を追加
            const isGeneralHoliday = isNonWorkingDay(dateStr);
            const isDoctorHoliday = holidays.some(h => h.dr_name === targetDr && h.attendance_date === dateStr);

            if (!isGeneralHoliday && !isDoctorHoliday) break;
            d.setDate(d.getDate() - 1);
            safetyCounter++;
        }
        return d.toISOString().split('T')[0];
    };

    const updateNextReserveDate = async (patientId) => {
        if (!patientId || patientId === 'INPATIENT') return;

        const today = new Date().toISOString().split('T')[0];

        // Fetch the earliest future reservation that is 'booked' (not arrived, not canceled)
        const { data: nextRes } = await supabase
            .from('reservations')
            .select('res_date')
            .eq('patient_id', patientId.trim())
            .eq('status', 'booked')
            .gte('res_date', today)
            .order('res_date', { ascending: true })
            .order('res_time', { ascending: true })
            .limit(1);

        let nextDate = null;
        if (nextRes && nextRes.length > 0) {
            nextDate = nextRes[0].res_date;
        }

        // Fetch patient category to calculate doc submission date
        const { data: patient } = await supabase.from('patients').select('p_category').eq('p_id', patientId.trim()).single();
        
        let updateData = { next_reserve_date: nextDate };

        if (nextDate && patient && patient.p_category) {
            // Fetch doctor holidays
            const { data: holidays } = await supabase.from('doctor_attendance').select('*');
            const docDate = calculateDocSubmissionDate(patient.p_category, nextDate, holidays || []);
            updateData.p_doc_submission_date = docDate;
        }

        // Update the patient record
        await supabase.from('patients').update(updateData).eq('p_id', patientId.trim());
    };

    // --- Status Update Handlers ---
    const recordHistoryToDB = async (patientId, date, time, typeName, status, cancelReason = '', isWalkIn = false) => {
        if (!patientId) return;

        try {
            // Fetch current patient record
            const { data: patient, error } = await supabase.from('patients').select('history').eq('p_id', patientId.trim()).single();
            if (error || !patient) {
                console.warn(`Patient ${patientId} not found in database. History not recorded.`);
                return;
            }

            let history = [];
            try {
                history = typeof patient.history === 'string' ? JSON.parse(patient.history) : (patient.history || []);
            } catch (e) {
                console.error("Error parsing history JSON:", e);
                history = [];
            }

            // Check if history already exists
            const existingIndex = history.findIndex(h => h.date === date && h.time === time);

            if (existingIndex >= 0) {
                if (status === 'delete_history') {
                    history.splice(existingIndex, 1);
                } else if (status === 'deleted') {
                    history[existingIndex].status = 'deleted';
                } else {
                    history[existingIndex].status = status;
                    // Preserve or update isWalkIn
                    if (isWalkIn) {
                        history[existingIndex].isWalkIn = true;
                    }
                    if (status === 'canceled' && cancelReason) {
                        history[existingIndex].cancelReason = cancelReason;
                    }
                }
            } else if (status !== 'delete_history' && status !== 'deleted') {
                history.push({
                    date,
                    time,
                    type: typeName,
                    status,
                    cancelReason: status === 'canceled' ? cancelReason : '',
                    isWalkIn: isWalkIn
                });
            }

            // Sort by date and time descending
            history.sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                return b.time.localeCompare(a.time);
            });

            await supabase.from('patients').update({ history: JSON.stringify(history) }).eq('p_id', patientId.trim());

            // --- Auto-sync Next Reserve Date ---
            await updateNextReserveDate(patientId);

        } catch (err) {
            console.error("Critical error in recordHistoryToDB:", err);
        }
    };

    const updateReservationStatus = async (status, cancelReason = '') => {
        if (!currentReservationId) return;

        // Fetch current data to get patientId etc.
        const { data: resData, error: fetchError } = await supabase.from('reservations').select('*').eq('id', currentReservationId).single();
        if (fetchError || !resData) return;

        const isWalkIn = resData.remarks?.includes('[予約外]') || false;
        const typeNameStr = resData.res_type === 'staff' ? 'スタッフ' : '消炎';

        if (status === 'canceled') {
            // Update status and store cancel reason in remarks or a dedicated field
            await supabase.from('reservations').update({
                status: 'canceled',
                remarks: cancelReason || resData.remarks
            }).eq('id', currentReservationId);

            // Record history
            await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, status, cancelReason, isWalkIn);

        } else {
            // Normal update (e.g. arrived)
            await supabase.from('reservations').update({ status: status }).eq('id', currentReservationId);

            // Record history
            await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, status, cancelReason, isWalkIn);
        }

        await createSchedule();
        closeStatusModal();
    };

    if (btnStatusArrived) {
        btnStatusArrived.addEventListener('click', async () => await updateReservationStatus('arrived'));
    }

    if (btnStatusCanceled) {
        btnStatusCanceled.addEventListener('click', async () => {
            const reasonSelect = document.getElementById('cancel-reason');
            const reason = reasonSelect ? reasonSelect.value : '';

            if (!reason) {
                alert('キャンセル理由を選択してください。');
                return;
            }

            if (confirm('この予約をキャンセルしますか？患者データにキャンセル履歴が記録されます。')) {
                await updateReservationStatus('canceled', reason);
            }
        });
    }

    if (btnStatusDelete) {
        btnStatusDelete.addEventListener('click', async () => {
            if (confirm('この予約枠を完全に削除して空き枠に戻しますか？')) {
                // Fetch to get patient info
                const { data: resData } = await supabase.from('reservations').select('*').eq('id', currentReservationId).single();
                if (resData && resData.patient_id) {
                    const typeNameStr = resData.res_type === 'staff' ? 'スタッフ' : '消炎';
                    await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, 'deleted');
                    
                    await supabase.from('reservations').delete().eq('id', currentReservationId);
                    
                    // Recalculate after deletion is complete
                    await updateNextReserveDate(resData.patient_id);
                } else {
                    await supabase.from('reservations').delete().eq('id', currentReservationId);
                }

                await createSchedule();
                closeStatusModal();
            }
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentSelectedCell) return;

            const selectedDate = targetDateInput.value;
            const selectedTime = currentSelectedCell.dataset.time;
            const selectedType = currentSelectedCell.dataset.type;
            const selectedIndex = currentSelectedCell.dataset.index;

            const bookingTypeRadio = document.querySelector('input[name="booking-type"]:checked');
            const bookingType = bookingTypeRadio ? bookingTypeRadio.value : 'outpatient';

            const isInpatientBlock = (bookingType === 'inpatient');
            const isMeeting = (bookingType === 'meeting');

            const unitsChecked = document.querySelector('input[name="booking-units"]:checked');
            const units = unitsChecked ? parseInt(unitsChecked.value, 10) : 2;
            const isWalkIn = document.getElementById('is-walk-in')?.checked || false;
            let remarks = document.getElementById('remarks').value;

            if (isWalkIn) {
                remarks = `[予約外] ${remarks}`;
            }

            let pId = document.getElementById('patient-id').value;
            let pName = document.getElementById('patient-name').value;

            if (isMeeting) {
                const combinedVal = document.getElementById('inpatient-id').value;
                if (combinedVal.includes(' : ')) {
                    const parts = combinedVal.split(' : ');
                    pId = parts[0];
                    // "(入院)" や "(介護)" などのラベルを除去して名前を抽出
                    pName = parts[1].replace(/\s*\([\u4E00-\u9FFF]+\)\s*$/, '').trim();
                } else {
                    pName = combinedVal;
                    pId = '';
                }
            } else if (isInpatientBlock) {
                pId = 'INPATIENT';
                pName = '入院患者介入枠';
            }


            const reservationData = {
                res_date: selectedDate,
                res_time: selectedTime,
                res_type: selectedType,
                res_index: parseInt(selectedIndex),
                patient_id: pId,
                patient_name: pName,
                remarks: remarks,
                units: units,
                is_inpatient_block: isInpatientBlock,
                is_meeting: isMeeting,
                status: 'booked'
            };

            // 重複チェック (念のため)
            const { data: existingCheck } = await supabase
                .from('reservations')
                .select('id')
                .eq('res_date', selectedDate)
                .eq('res_time', selectedTime)
                .eq('res_type', selectedType)
                .eq('res_index', parseInt(selectedIndex))
                .neq('status', 'canceled')
                .limit(1);

            if (existingCheck && existingCheck.length > 0) {
                alert("この枠には既に予約が入っています。再読み込みして確認してください。");
                return;
            }

            const { error: insertError } = await supabase.from('reservations').insert([reservationData]);

            if (insertError) {
                console.error("Booking error:", insertError);
                alert("データの保存に失敗しました。SQLが正しく実行されているか確認してください。");
                return;
            }

            // Record to DB history if patient info is available
            if (pId && pId !== 'INPATIENT') {
                const typeName = selectedType === 'staff' ? `スタッフ枠 ${selectedIndex}` : `消炎枠 ${selectedIndex}`;
                await recordHistoryToDB(pId, selectedDate, selectedTime, typeName, 'booked', '', isWalkIn);
            }

            await createSchedule();
            closeBookingModal();
        });
    }

    // Date Navigation Logic
    const prevDateBtn = document.getElementById('prev-date');
    const nextDateBtn = document.getElementById('next-date');

    const updateDateByDays = (days) => {
        const currentDateStr = targetDateInput.value;
        if (!currentDateStr) return;

        const date = new Date(currentDateStr);
        date.setDate(date.getDate() + days);

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        targetDateInput.value = `${yyyy}-${mm}-${dd}`;

        // Trigger change event to notify any listeners
        targetDateInput.dispatchEvent(new Event('change'));
    };

    if (prevDateBtn) prevDateBtn.addEventListener('click', () => updateDateByDays(-1));
    if (nextDateBtn) nextDateBtn.addEventListener('click', () => updateDateByDays(1));
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('rotating'); // オプション：回転アニメーション
        await createSchedule();
        setTimeout(() => refreshBtn.classList.remove('rotating'), 500);
        console.log('Schedule refreshed.');
    });

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

                    // Assume data is in the first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    console.log('Imported Excel Data:', jsonData);
                    alert(`Excelファイルの読み込みに成功しました。\n${jsonData.length} 行のデータを取得しました。\n※ここのデータを使って予約表に反映させる処理を今後実装します。`);

                    // Reset input so the same file can be selected again if needed
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

    // --- Migration Logic: localStorage to Supabase ---
    const migrateDataToSupabase = async () => {
        const isMigrated = localStorage.getItem('supabase_migrated_v6');
        if (isMigrated) return;

        console.log("Starting data migration to Supabase...");

        // Migrate Staff Names
        const staffNames = JSON.parse(localStorage.getItem('staffNames'));
        if (staffNames) {
            await saveStaffData(staffNames);
        }

        // Migrate Reservations
        const reservationsToMigrate = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('reservation_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const parts = key.split('_');
                    if (parts.length < 5) continue;

                    reservationsToMigrate.push({
                        res_date: parts[1],
                        res_time: parts[2],
                        res_type: parts[3],
                        res_index: parseInt(parts[4]),
                        patient_id: data.patientId || data.patient_id,
                        patient_name: data.patientName || data.patient_name,
                        remarks: data.remarks || data.cancelReason || '',
                        units: data.units || 1,
                        is_inpatient_block: data.isInpatientBlock || data.is_inpatient_block || false,
                        is_meeting: data.isMeeting || data.is_meeting || false,
                        status: data.status || 'booked'
                    });
                } catch (e) { }
            }
        }

        if (reservationsToMigrate.length > 0) {
            const { error: resError } = await supabase.from('reservations').insert(reservationsToMigrate);
            if (resError) console.error('Reservation migration error:', resError);
        }

        // Migrate Patients (History is included)
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
            p_diagnosis_date: p.date ? p.date : null,
            p_category: p.category,
            next_reserve_date: p.next_reserve_date ? p.next_reserve_date : null,
            history: p.history || []
        }));

        if (patientsToMigrate.length > 0) {
            const { error } = await supabase.from('patients').upsert(patientsToMigrate);
            if (error) console.error('Patient migration error:', error);
        }

        localStorage.setItem('supabase_migrated_v6', 'true');
        console.log("Migration complete.");
    };

    // --- Monthly Performance Statistics Logic ---
    let performanceDate = new Date();

    const openPerformanceModal = async () => {
        const modal = document.getElementById('performance-modal');
        if (modal) {
            modal.style.display = 'flex';
            await updatePerformanceStats();
        }
    };

    const closePerformanceModal = () => {
        const modal = document.getElementById('performance-modal');
        if (modal) modal.style.display = 'none';
    };

    const updatePerformanceStats = async () => {
        const year = performanceDate.getFullYear();
        const month = performanceDate.getMonth();
        const currentMonthEl = document.getElementById('perf-current-month');
        if (currentMonthEl) currentMonthEl.textContent = `${year}年${month + 1}月`;

        // Calculate start and end of month
        const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

        // Fetch reservations for the month
        const { data: reservations, error } = await supabase
            .from('reservations')
            .select('*')
            .gte('res_date', startOfMonth)
            .lte('res_date', endOfMonth);

        if (error) {
            console.error("Error fetching monthly reservations:", error);
            return;
        }

        // Fetch patient categories and care status to map stats and sales
        const { data: patients, error: pError } = await supabase
            .from('patients')
            .select('p_id, p_category, p_nursing_care');
        const patientCategoryMap = {};
        const patientNursingCareMap = {};
        if (patients) {
            patients.forEach(p => {
                patientCategoryMap[p.p_id] = p.p_category;
                patientNursingCareMap[p.p_id] = p.p_nursing_care;
            });
        }

        // Cache for sales calculation
        performanceStatsCache = {
            reservations: reservations || [],
            patientCategoryMap: patientCategoryMap,
            patientNursingCareMap: patientNursingCareMap
        };

        // Stats calculation
        const stats = {
            inpatient: { patients: new Set(), cases: 0, units: 0 },
            outpatient: { 
                total: { patients: new Set(), cases: 0, units: 0 },
                locomotor: { patients: new Set(), cases: 0, units: 0 },
                cerebro: { patients: new Set(), cases: 0, units: 0 },
                anti: { patients: new Set(), cases: 0, units: 0 },
                other: { patients: new Set(), cases: 0, units: 0 }
            },
            nursing: { patients: new Set() }
        };

        const cancellations = [];
        const cancelReasons = {};

        reservations.forEach(res => {
            const isCanceled = res.status === 'canceled';
            const isArrived = res.status === 'arrived';
            const units = parseInt(res.units) || 1;
            const pId = res.patient_id;

            if (res.is_inpatient_block) {
                if (!isCanceled) {
                    stats.inpatient.patients.add(pId);
                }
            } else if (res.is_meeting) {
                stats.nursing.patients.add(pId);
            } else {
                // Outpatient
                if (isCanceled) {
                    cancellations.push(res);
                    const reason = res.remarks || '理由なし';
                    cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
                } else {
                    stats.outpatient.total.patients.add(pId);
                    if (isArrived) {
                        stats.outpatient.total.cases += 1;
                        stats.outpatient.total.units += units;

                        const cat = patientCategoryMap[pId];
                        if (cat === '運動器') {
                            stats.outpatient.locomotor.patients.add(pId);
                            stats.outpatient.locomotor.cases += 1;
                            stats.outpatient.locomotor.units += units;
                        } else if (cat === '脳血管') {
                            stats.outpatient.cerebro.patients.add(pId);
                            stats.outpatient.cerebro.cases += 1;
                            stats.outpatient.cerebro.units += units;
                        } else if (cat === '消炎') {
                            stats.outpatient.anti.patients.add(pId);
                            stats.outpatient.anti.cases += 1;
                            stats.outpatient.anti.units += units;
                        } else {
                            stats.outpatient.other.patients.add(pId);
                            stats.outpatient.other.cases += 1;
                            stats.outpatient.other.units += units;
                        }
                    }
                }
            }
        });

        // Add manual Inpatient Intervention stats from localStorage with categories
        const manualInpatient = {
            total: { cases: 0, units: 0 },
            locomotor: { cases: 0, units: 0, sub150: { cases: 0, units: 0 }, deduction: { cases: 0, units: 0 } },
            cerebro: { cases: 0, units: 0, sub150: { cases: 0, units: 0 }, deduction: { cases: 0, units: 0 } },
            disuse: { cases: 0, units: 0, sub150: { cases: 0, units: 0 }, deduction: { cases: 0, units: 0 } }
        };

        const lastDay = new Date(year, month + 1, 0).getDate();
        let totalMonthlyWorkdays = 0;
        let workdaysToDate = 0;
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        for (let d = 1; d <= lastDay; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const date = new Date(dateStr);
            
            // Calculate workday value: Sat=0.5, Weekday=1, Sun/Hol=0
            let dayValue = 0;
            if (isNonWorkingDay(dateStr)) {
                dayValue = 0;
            } else if (date.getDay() === 6) { // Saturday
                dayValue = 0.5;
            } else if (date.getDay() !== 0) { // Monday-Friday (and not holiday)
                dayValue = 1.0;
            }
            
            totalMonthlyWorkdays += dayValue;
            
            // Calculate workdays up to today
            if (dateStr <= todayStr) {
                workdaysToDate += dayValue;
            }
            ['locomotor', 'cerebro', 'disuse'].forEach(cat => {
                const c = parseInt(localStorage.getItem(`manual_inpatient_${cat}_cases_${dateStr}`)) || 0;
                const u = parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${dateStr}`)) || 0;
                manualInpatient[cat].cases += c;
                manualInpatient[cat].units += u;
                manualInpatient.total.cases += c;
                manualInpatient.total.units += u;

                const c150 = parseInt(localStorage.getItem(`manual_inpatient_${cat}_150_cases_${dateStr}`)) || 0;
                const u150 = parseFloat(localStorage.getItem(`manual_inpatient_${cat}_150_units_${dateStr}`)) || 0;
                manualInpatient[cat].sub150.cases += c150;
                manualInpatient[cat].sub150.units += u150;

                const cDed = parseInt(localStorage.getItem(`manual_inpatient_${cat}_deduction_cases_${dateStr}`)) || 0;
                const uDed = parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${dateStr}`)) || 0;
                manualInpatient[cat].deduction.cases += cDed;
                manualInpatient[cat].deduction.units += uDed;
            });
        }

        // Helper to format rows
        const createRow = (label, patients, cases, units, isSub = false) => `
            <tr style="border-bottom: 1px solid #f1f5f9; ${isSub ? 'background: #fbfcfe;' : ''}">
                <td style="padding: ${isSub ? '0.5rem 1rem 0.5rem 2rem' : '1rem'}; font-weight: ${isSub ? 'normal' : '600'}; color: ${isSub ? '#64748b' : '#1e293b'};">
                    ${isSub ? '└ ' : ''}${label}
                </td>
                <td style="padding: 0.5rem 1rem; text-align: right; font-size: ${isSub ? '0.85rem' : '1rem'};">${patients !== null ? patients + ' 名' : '-'}</td>
                <td style="padding: 0.5rem 1rem; text-align: right; font-size: ${isSub ? '0.85rem' : '1rem'};">${cases} 件</td>
                <td style="padding: 0.5rem 1rem; text-align: right; font-weight: ${isSub ? '600' : '700'}; color: ${isSub ? '#475569' : '#0f172a'}; font-size: ${isSub ? '0.85rem' : '1rem'};">${units} 単位</td>
            </tr>
        `;

        // Render Summary Table
        const summaryBody = document.getElementById('performance-summary-body');
        if (summaryBody) {
            summaryBody.innerHTML = `
                ${createRow('🏥 入院実績（介入合計）', stats.inpatient.patients.size, manualInpatient.total.cases, manualInpatient.total.units)}
                ${createRow(`運動器 <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(150日: ${manualInpatient.locomotor.sub150.cases}件/${manualInpatient.locomotor.sub150.units}単, 減算: ${manualInpatient.locomotor.deduction.cases}件/${manualInpatient.locomotor.deduction.units}単)</span>`, null, manualInpatient.locomotor.cases, manualInpatient.locomotor.units, true)}
                ${createRow(`脳血管 <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(150日: ${manualInpatient.cerebro.sub150.cases}件/${manualInpatient.cerebro.sub150.units}単, 減算: ${manualInpatient.cerebro.deduction.cases}件/${manualInpatient.cerebro.deduction.units}単)</span>`, null, manualInpatient.cerebro.cases, manualInpatient.cerebro.units, true)}
                ${createRow(`廃用 <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(150日: ${manualInpatient.disuse.sub150.cases}件/${manualInpatient.disuse.sub150.units}単, 減算: ${manualInpatient.disuse.deduction.cases}件/${manualInpatient.disuse.deduction.units}単)</span>`, null, manualInpatient.disuse.cases, manualInpatient.disuse.units, true)}

                ${createRow('🏥 外来実績（来院合計）', stats.outpatient.total.patients.size, stats.outpatient.total.cases, stats.outpatient.total.units)}
                ${createRow('運動器', stats.outpatient.locomotor.patients.size, stats.outpatient.locomotor.cases, stats.outpatient.locomotor.units, true)}
                ${createRow('脳血管', stats.outpatient.cerebro.patients.size, stats.outpatient.cerebro.cases, stats.outpatient.cerebro.units, true)}
                ${createRow('消炎', stats.outpatient.anti.patients.size, stats.outpatient.anti.cases, stats.outpatient.anti.units, true)}
                ${stats.outpatient.other.cases > 0 ? createRow('その他', stats.outpatient.other.patients.size, stats.outpatient.other.cases, stats.outpatient.other.units, true) : ''}

                ${createRow('🏢 介護医療院', stats.nursing.patients.size, '-', '-')}
                ${(() => {
                    const isAfterJune2026 = (year > 2026) || (year === 2026 && month >= 5);
                    const labels = isAfterJune2026 
                        ? ['計画評価1(初回)', '計画評価1(2回目以降)', '計画評価2(初回)', '計画評価2(2回目以降)']
                        : ['計画評価1', '計画評価2', '目標1', '目標2'];
                    
                    return labels.map(label => {
                        const storageKey = `manual_nursing_${year}_${month}_${label}`;
                        const val = localStorage.getItem(storageKey) || 0;
                        return `
                            <tr style="border-bottom: 1px dashed #f1f5f9; background: #fffcf0;">
                                <td style="padding: 0.5rem 1rem 0.5rem 2rem; color: #b45309; font-size: 0.85rem;">└ ${label}</td>
                                <td colspan="3" style="padding: 0.5rem 1rem; text-align: right;">
                                    <input type="number" class="perf-nursing-input" data-key="${storageKey}" value="${val}" 
                                           style="width: 70px; text-align: right; border: 1px solid #fbbf24; border-radius: 4px; padding: 2px 5px; font-size: 0.85rem;">
                                    <span style="font-size: 0.8rem; color: #b45309; margin-left: 0.4rem;">件</span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                })()}
            `;

            // Update Outpatient Summary Stats
            const monthlyWorkdaysEl = document.getElementById('perf-monthly-workdays');
            const workdaysToDateEl = document.getElementById('perf-workdays-to-date');
            const averageUnitsEl = document.getElementById('perf-average-units');
            
            if (monthlyWorkdaysEl) monthlyWorkdaysEl.textContent = totalMonthlyWorkdays.toFixed(1);
            if (workdaysToDateEl) workdaysToDateEl.textContent = workdaysToDate.toFixed(1);
            
            if (averageUnitsEl) {
                const avg = workdaysToDate > 0 ? (stats.outpatient.total.units / workdaysToDate).toFixed(1) : '0.0';
                averageUnitsEl.textContent = avg;
            }

            // Add input listeners for nursing stats
            document.querySelectorAll('.perf-nursing-input').forEach(input => {
                input.addEventListener('change', (e) => {
                    localStorage.setItem(e.target.dataset.key, e.target.value);
                });
            });
        }

        // Cancellation stats
        const totalOutpatient = stats.outpatient.cases + cancellations.length;
        const cancelRate = totalOutpatient > 0 ? Math.round((cancellations.length / totalOutpatient) * 100) : 0;
        const rateEl = document.getElementById('perf-outpatient-cancel-rate');
        const countEl = document.getElementById('perf-outpatient-cancel-count');
        const totalEl = document.getElementById('perf-outpatient-total-res');
        if (rateEl) rateEl.textContent = `${cancelRate}%`;
        if (countEl) countEl.textContent = cancellations.length;
        if (totalEl) totalEl.textContent = totalOutpatient;

        // Cancel reasons list
        const reasonChart = document.getElementById('perf-cancel-reason-chart');
        if (reasonChart) {
            reasonChart.innerHTML = Object.entries(cancelReasons)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding: 0.25rem 0;">
                        <span>${reason}</span>
                        <span style="background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${count}</span>
                    </div>
                `).join('') || '<p style="color: #94a3b8; text-align: center;">キャンセル記録なし</p>';
        }

        // Detailed Cancellation List
        const detailList = document.getElementById('perf-cancel-details-list');
        if (detailList) {
            detailList.innerHTML = cancellations
                .sort((a, b) => b.res_date.localeCompare(a.res_date))
                .map(c => `
                    <div style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: 700; color: #1e293b;">${c.patient_name}</div>
                            <div style="font-size: 0.75rem; color: #64748b;">${c.res_date} ${c.res_time}</div>
                        </div>
                        <div style="font-size: 0.75rem; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px;">
                            ${c.remarks || '理由未選択'}
                        </div>
                    </div>
                `).join('') || '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">該当データなし</p>';
        }
    };

    // Performance Listeners
    document.getElementById('performance-btn')?.addEventListener('click', openPerformanceModal);
    document.getElementById('close-performance-modal-btn')?.addEventListener('click', closePerformanceModal);
    document.getElementById('perf-prev-month')?.addEventListener('click', async () => {
        performanceDate.setMonth(performanceDate.getMonth() - 1);
        await updatePerformanceStats();
    });
    document.getElementById('perf-next-month')?.addEventListener('click', async () => {
        performanceDate.setMonth(performanceDate.getMonth() + 1);
        await updatePerformanceStats();
    });

    document.getElementById('perf-sales-btn')?.addEventListener('click', () => {
        const year = performanceDate.getFullYear();
        const month = performanceDate.getMonth() + 1;
        const isBeforeJune2026 = (year < 2026) || (year === 2026 && month < 6);

        if (isBeforeJune2026) {
            // ==========================================
            // PRE-JUNE 2026 LOGIC 
            // ==========================================
            const prices = {
                locomotor: 1850,
                locomotor_deduction: 1110,
                cerebro: 2000,
                cerebro_deduction: 1200,
                disuse: 1460, 
                disuse_deduction: 880,
                anti: 350,
                re_exam: 770 / 2, // 385 yen
                nursing: {
                    '計画評価1': 3000,
                    '計画評価1(初回)': 3000,
                    '計画評価1(2回目以降)': 3000,
                    '計画評価2': 2400,
                    '計画評価2(初回)': 2400,
                    '計画評価2(2回目以降)': 2400,
                    '目標1': 2500,
                    '目標2': 1000
                }
            };

            const { reservations: pReservations, patientCategoryMap, patientNursingCareMap } = performanceStatsCache;
            if (!pReservations || !patientCategoryMap) {
                alert('統計データが読み込まれていません。一度実績ページを閉じて開き直してください。');
                return;
            }

            // --- Inpatient Sales ---
            let inpatientSales = 0;
            ['locomotor', 'cerebro', 'disuse'].forEach(cat => {
                let totalUnits = 0;
                let deductionUnits = 0;
                const lastDay = new Date(year, month, 0).getDate();
                for (let d = 1; d <= lastDay; d++) {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    totalUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${dateStr}`)) || 0;
                    deductionUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${dateStr}`)) || 0;
                }
                
                if (cat === 'locomotor') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.locomotor + (deductionUnits * prices.locomotor_deduction);
                } else if (cat === 'cerebro') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.cerebro + (deductionUnits * prices.cerebro_deduction);
                } else if (cat === 'disuse') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.disuse + (deductionUnits * prices.disuse_deduction);
                }
            });

            // --- Outpatient & Nursing Base Sales ---
            let outpatientUnitsSales = 0;
            let outpatientReExamSales = 0;
            const nursingVisits = { withCare: 0, withoutCare: 0 };
            
            const filtered = pReservations.filter(res => {
                if (res.status === 'canceled') return false;
                const d = new Date(res.res_date);
                return d.getFullYear() === year && d.getMonth() + 1 === month;
            });
            
            filtered.forEach(res => {
                const units = parseInt(res.units) || 1;
                const pId = res.patient_id;
                const cat = patientCategoryMap[pId] || 'その他';

                if (res.is_meeting) {
                    return; 
                }

                if (res.is_inpatient_block) return; 

                if (cat === '運動器') {
                    outpatientUnitsSales += units * prices.locomotor;
                    outpatientReExamSales += prices.re_exam;
                } else if (cat === '脳血管') {
                    outpatientUnitsSales += units * prices.cerebro;
                    outpatientReExamSales += prices.re_exam;
                } else if (cat === '消炎') {
                    outpatientUnitsSales += units * prices.anti;
                    outpatientReExamSales += prices.re_exam;
                } else {
                    outpatientUnitsSales += units * 2000; 
                }
            });

            // --- Nursing Care & Plan Evaluation & Goals Sales ---
            let nursingCareBaseSales = (nursingVisits.withoutCare * 1230) + (nursingVisits.withCare * 860);
            let planEvalAndGoalSales = 0;
            
            const inOutMetrics = [
                '計画評価1', '計画評価1(初回)', '計画評価1(2回目以降)', 
                '計画評価2', '計画評価2(初回)', '計画評価2(2回目以降)',
                '目標1', '目標2'
            ];

            inOutMetrics.forEach(label => {
                const storageKey = `manual_nursing_${year}_${month - 1}_${label}`;
                const count = parseInt(localStorage.getItem(storageKey)) || 0;
                planEvalAndGoalSales += count * (prices.nursing[label] || 0);
            });

            const combinedInOutSales = inpatientSales + outpatientUnitsSales + outpatientReExamSales + planEvalAndGoalSales;
            const totalTotal = combinedInOutSales + nursingCareBaseSales;

            alert(`💰 ${year}年${month}月 売上概算レポート\n` +
                  `----------------------------------\n` +
                  `🏥 入院売上: ${inpatientSales.toLocaleString()} 円\n` +
                  `👤 外来売上: ${(outpatientUnitsSales + outpatientReExamSales).toLocaleString()} 円\n` +
                  `📝 評価・目標: ${planEvalAndGoalSales.toLocaleString()} 円 (入外合算)\n` +
                  `🏢 介護医療院: ${nursingCareBaseSales.toLocaleString()} 円\n` +
                  `----------------------------------\n` +
                  `合計概算:  ${totalTotal.toLocaleString()} 円\n\n` +
                  `※介護: 要介護なし1230円 / あり860円 で算出しています。\n` +
                  `※2026年5月までの料金体系を適用しています。`);

        } else {
            // ==========================================
            // POST-JUNE 2026 LOGIC 
            // ==========================================
            const prices = {
                // 入院
                in_locomotor: 1850,
                in_locomotor_deduction: 1680,
                in_cerebro: 2000,
                in_cerebro_deduction: 1800,
                in_disuse: 1460, 
                in_disuse_deduction: 1320,
                // 外来
                out_locomotor: 1850,
                out_cerebro: 2000,
                out_anti: 350,
                out_other: 2000,
                
                re_exam: 410,
                
                // 介護
                nursing: {
                    '計画評価1': 3000,
                    '計画評価1(初回)': 3000,
                    '計画評価1(2回目以降)': 3000,
                    '計画評価2': 2400,
                    '計画評価2(初回)': 2400,
                    '計画評価2(2回目以降)': 2400,
                    '目標1': 2500,
                    '目標2': 1000
                }
            };

            const { reservations: pReservations, patientCategoryMap, patientNursingCareMap } = performanceStatsCache;
            if (!pReservations || !patientCategoryMap) {
                alert('統計データが読み込まれていません。一度実績ページを閉じて開き直してください。');
                return;
            }

            // --- Inpatient Sales ---
            let inpatientSales = 0;
            ['locomotor', 'cerebro', 'disuse'].forEach(cat => {
                let totalUnits = 0;
                let deductionUnits = 0;
                const lastDay = new Date(year, month, 0).getDate();
                for (let d = 1; d <= lastDay; d++) {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    totalUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${dateStr}`)) || 0;
                    deductionUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${dateStr}`)) || 0;
                }
                
                if (cat === 'locomotor') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.in_locomotor + (deductionUnits * prices.in_locomotor_deduction);
                } else if (cat === 'cerebro') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.in_cerebro + (deductionUnits * prices.in_cerebro_deduction);
                } else if (cat === 'disuse') {
                    inpatientSales += (totalUnits - deductionUnits) * prices.in_disuse + (deductionUnits * prices.in_disuse_deduction);
                }
            });

            // --- Outpatient & Nursing Base Sales ---
            let outpatientUnitsSales = 0;
            let outpatientReExamSales = 0;
            const nursingVisits = { withCare: 0, withoutCare: 0 };
            
            const filtered = pReservations.filter(res => {
                if (res.status === 'canceled') return false;
                const d = new Date(res.res_date);
                return d.getFullYear() === year && d.getMonth() + 1 === month;
            });
            
            filtered.forEach(res => {
                const units = parseInt(res.units) || 1;
                const pId = res.patient_id;
                const cat = patientCategoryMap[pId] || 'その他';

                if (res.is_meeting) {
                    if (patientNursingCareMap[pId]) nursingVisits.withCare++;
                    else nursingVisits.withoutCare++;
                    return; 
                }

                if (res.is_inpatient_block) return; 

                // Outpatient Sales
                if (cat === '運動器') {
                    outpatientUnitsSales += units * prices.out_locomotor;
                    outpatientReExamSales += prices.re_exam; // 再診料は外来運動器、脳血管、消炎を参照
                } else if (cat === '脳血管') {
                    outpatientUnitsSales += units * prices.out_cerebro;
                    outpatientReExamSales += prices.re_exam;
                } else if (cat === '消炎') {
                    outpatientUnitsSales += units * prices.out_anti;
                    outpatientReExamSales += prices.re_exam;
                } else {
                    outpatientUnitsSales += units * prices.out_other; 
                }
            });

            // --- Nursing Care & Plan Evaluation & Goals Sales ---
            let nursingCareBaseSales = (nursingVisits.withoutCare * 1230) + (nursingVisits.withCare * 860);
            let planEvalAndGoalSales = 0;
            
            const inOutMetrics = [
                '計画評価1', '計画評価1(初回)', '計画評価1(2回目以降)', 
                '計画評価2', '計画評価2(初回)', '計画評価2(2回目以降)',
                '目標1', '目標2'
            ];

            inOutMetrics.forEach(label => {
                const storageKey = `manual_nursing_${year}_${month - 1}_${label}`;
                const count = parseInt(localStorage.getItem(storageKey)) || 0;
                planEvalAndGoalSales += count * (prices.nursing[label] || 0);
            });

            const combinedInOutSales = inpatientSales + outpatientUnitsSales + outpatientReExamSales + planEvalAndGoalSales;
            const totalTotal = combinedInOutSales + nursingCareBaseSales;

            alert(`💰 ${year}年${month}月 売上概算レポート\n` +
                  `----------------------------------\n` +
                  `🏥 入院売上: ${inpatientSales.toLocaleString()} 円\n` +
                  `👤 外来売上: ${(outpatientUnitsSales + outpatientReExamSales).toLocaleString()} 円\n` +
                  `📝 評価・目標: ${planEvalAndGoalSales.toLocaleString()} 円 (入外合算)\n` +
                  `🏢 介護医療院: ${nursingCareBaseSales.toLocaleString()} 円\n` +
                  `----------------------------------\n` +
                  `合計概算:  ${totalTotal.toLocaleString()} 円\n\n` +
                  `※介護: 要介護なし1230円 / あり860円 で算出しています。\n` +
                  `※2026年6月以降の改定料金体系を適用しています。`);
        }
    });

    // Close performance modal on outside click
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('performance-modal');
        if (e.target === modal) closePerformanceModal();
    });

    // --- Realtime Sync Logic (Enhanced) ---
    const flashSyncIndicator = () => {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) {
            indicator.classList.remove('sync-flash');
            void indicator.offsetWidth; // Trigger reflow
            indicator.classList.add('sync-flash');
        }
    };

    const setupRealtimeSubscription = () => {
        console.log("Setting up Realtime Subscriptions...");
        
        // 1. Reservations Table
        supabase
            .channel('public:reservations-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reservations' },
                (payload) => {
                    console.log('Realtime change (reservations):', payload);
                    const currentDate = targetDateInput.value;
                    const newRes = payload.new;
                    const oldRes = payload.old;

                    // Refresh if change is relevant to the current date or if we can't tell (e.g. DELETE)
                    const isRelevant = !newRes || !newRes.res_date || newRes.res_date === currentDate || 
                                       (oldRes && oldRes.res_date === currentDate);
                    
                    if (isRelevant) {
                        flashSyncIndicator();
                        createSchedule();
                    }
                }
            )
            .subscribe();

        // 2. Staff Settings Table (Names, Global Attendance)
        supabase
            .channel('public:staff-settings-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'staff_settings' },
                () => {
                    flashSyncIndicator();
                    createSchedule();
                }
            )
            .subscribe();

        // 3. Doctor Attendance Table (Holidays)
        supabase
            .channel('public:doctor-attendance-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'doctor_attendance' },
                async () => {
                    flashSyncIndicator();
                    await fetchHolidays(); // Refresh holiday cache
                    createSchedule();
                }
            )
            .subscribe();

        // 4. Staff Attendance Table (Daily Attendance)
        supabase
            .channel('public:staff-attendance-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'staff_attendance' },
                () => {
                    flashSyncIndicator();
                    createSchedule();
                }
            )
            .subscribe();
    };

    // --- 手動入力をSupabaseへ同期保存する関数 ---
    let syncTimeout = null;
    const syncManualMetricsToSupabase = async () => {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(async () => {
            const dateStr = targetDateInput.value;
            const metrics = {};
            
            // 1日必要単位数
            const ritualUnits = document.getElementById('manual-total-units');
            if (ritualUnits) metrics.manual_total_units = ritualUnits.value;
            
            // スタッフ別・消炎単位数
            for (let i = 1; i <= STAFF_COUNT; i++) {
                const input = document.getElementById(`staff-units-${i}`);
                if (input) metrics[`staff_units_${i}`] = input.value;
            }
            const antiInput = document.getElementById('anti-units-1');
            if (antiInput) metrics.manual_anti_units_1 = antiInput.value;
            
            // 入院内訳
            INPATIENT_CATEGORIES.forEach(cat => {
                const keys = [`inpatient-${cat}-cases`, `inpatient-${cat}-units`];
                const subs = INPATIENT_SUB_CATEGORIES[cat] || [];
                subs.forEach(sub => {
                    keys.push(`inpatient-${cat}-${sub}-cases`);
                    keys.push(`inpatient-${cat}-${sub}-units`);
                });
                
                keys.forEach(key => {
                    const el = document.getElementById(key);
                    if (el) metrics[key] = el.value;
                });
            });

            // 介護内訳
            const nursingKeys = ['nursing-manual-cases', 'nursing-manual-units', 'nursing-manual-deduction-cases', 'nursing-manual-deduction-units'];
            nursingKeys.forEach(key => {
                const el = document.getElementById(key);
                if (el) metrics[key] = el.value;
            });

            // 保存処理 (Unique制約がない場合があるため、明示的に存在チェックしてから更新または挿入)
            const { data: existing } = await supabase
                .from('reservations')
                .select('id')
                .eq('res_date', dateStr)
                .eq('patient_id', '_METRICS_')
                .limit(1);

            if (existing && existing.length > 0) {
                const { error } = await supabase
                    .from('reservations')
                    .update({ remarks: JSON.stringify(metrics) })
                    .eq('id', existing[0].id);
                if (error) console.error("Metrics update error:", error);
            } else {
                const { error } = await supabase
                    .from('reservations')
                    .insert([{
                        res_date: dateStr,
                        res_time: '00:00',
                        res_type: 'manual_stats',
                        res_index: 0,
                        patient_id: '_METRICS_',
                        patient_name: 'システム集計データ',
                        remarks: JSON.stringify(metrics),
                        status: 'booked'
                    }]);
                if (error) console.error("Metrics insert error:", error);
            }
        }, 1000); // 1秒デバウンス
    };

    // 手動入力フィールドにイベントリスナーを追加
    const attachManualSyncListeners = () => {
        const ids = ['manual-total-units', 'anti-units-1'];
        
        INPATIENT_CATEGORIES.forEach(cat => {
            ids.push(`inpatient-${cat}-cases`);
            ids.push(`inpatient-${cat}-units`);
            const subs = INPATIENT_SUB_CATEGORIES[cat] || [];
            subs.forEach(sub => {
                ids.push(`inpatient-${cat}-${sub}-cases`);
                ids.push(`inpatient-${cat}-${sub}-units`);
            });
        });
        
        const nursingKeys = ['nursing-manual-cases', 'nursing-manual-units', 'nursing-manual-deduction-cases', 'nursing-manual-deduction-units'];
        nursingKeys.forEach(key => ids.push(key));
        
        for (let i = 1; i <= STAFF_COUNT; i++) ids.push(`staff-units-${i}`);

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', syncManualMetricsToSupabase);
            }
        });
    };

    // Initialization sequence
    async function init() {
        await migrateDataToSupabase();
        initializeDate();
        await fetchHolidays(); // Load holidays first
        await createSchedule();
        populateDatalists();
        setupRealtimeSubscription();
        attachManualSyncListeners(); // 同期リスナーの開始
    }
    init();

    // Re-render schedule if user changes the date manually
    targetDateInput.addEventListener('change', async (e) => {
        console.log('Selected date changed to:', e.target.value);
        await createSchedule();
    });
});
