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
        const { data, error } = await supabase.from('staff_settings').select('id, attendance').order('id', { ascending: true });
        const attendance = Array(STAFF_COUNT).fill('work');
        if (!error && data && data.length > 0) {
            data.forEach((s, i) => {
                if (i < STAFF_COUNT) attendance[i] = s.attendance || 'work';
            });
        }
        return attendance;
    };

    const saveStaffData = async (names) => {
        for (let i = 0; i < names.length; i++) {
            await supabase.from('staff_settings').upsert({ id: i + 1, name: names[i] });
        }
    };

    const saveStaffAttendance = async (dateStr, attendance) => {
        for (let i = 0; i < attendance.length; i++) {
            await supabase.from('staff_settings').update({ attendance: attendance[i] }).eq('id', i + 1);
        }
    };
    // ----------------------------

    const createSchedule = async () => {
        scheduleBody.innerHTML = '';
        const selectedDate = targetDateInput.value;

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
        antiTd.appendChild(antiInput);
        unitsRow.appendChild(antiTd);

        // キャンセル枠用のプレースホルダ
        const cancelTd = document.createElement('td');
        cancelTd.style.cssText = 'background:#f0fdf4;';
        unitsRow.appendChild(cancelTd);

        scheduleBody.appendChild(unitsRow);

        // --- Fetch from Supabase ---
        const { data: dbReservations, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', selectedDate);

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

        const startTime = new Date();
        startTime.setHours(START_HOUR, 0, 0, 0);

        const endTime = new Date();
        endTime.setHours(END_HOUR, 0, 0, 0);

        let currentTime = new Date(startTime);

        const skipCells = {
            staff: Array(STAFF_COUNT + 1).fill(0),
            anti: Array(ANTI_COUNT + 1).fill(0)
        };

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
                        staffThs[i].style.backgroundColor = '#f3f4f6';
                        staffThs[i].style.color = '#9ca3af';
                        let label = '(休み)';
                        if (attendanceMode === 'morning_off') label = '(午前休)';
                        if (attendanceMode === 'afternoon_off') label = '(午後休)';
                        staffThs[i].innerHTML = `${staffNames[i]}<br><span style="font-size: 0.6rem; color: #ef4444;">${label}</span>`;
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
                    breakTd.colSpan = STAFF_COUNT + ANTI_COUNT + 1;
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
                    if (skipCells.staff[i] > 0) {
                        skipCells.staff[i]--;
                        continue;
                    }
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

                    if (isStaffOff) {
                        td.classList.add('staff-off-cell');
                        td.style.backgroundColor = '#f9fafb';
                        td.innerHTML = `<div style="color: #d1d5db; font-size: 0.65rem;">${offLabel}</div>`;
                    }

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
                        const fullRemarks = data.remarks || '';
                        const isWalkIn = fullRemarks.startsWith('[予約外]');
                        const displayRemarks = isWalkIn ? fullRemarks.replace('[予約外]', '').trim() : fullRemarks;
                        
                        if (isWalkIn) {
                            td.classList.add('is-walk-in');
                        }

                        if (data.is_inpatient_block) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}🏥 入院患者介入枠<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#fdf2f880' : '#fdf2f8';
                            td.style.color = isStaffOff ? '#be185d80' : '#be185d';
                        } else if (data.is_meeting) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}💬 面談: ${data.patient_name || '未指定'}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#ecfdf580' : '#ecfdf5';
                            td.style.color = isStaffOff ? '#065f4680' : '#065f46';
                            td.style.border = isStaffOff ? '2px solid #d1fae580' : '2px solid #10b981';
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}${data.patient_name || '無名'}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        }
                        if (units > 1) { td.rowSpan = units; skipCells.staff[i] = units - 1; }
                    }

                    const staffKey = `reservation_${selectedDate}_${timeString}_staff_${i}`;
                    td.addEventListener('click', () => {
                        if (isStaffOff && !td.classList.contains('booked')) { alert('お休みです'); return; }
                        handleCellClick(staffNames[i - 1], i, timeString, td);
                    });

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
                    if (skipCells.anti[i] > 0) { skipCells.anti[i]--; continue; }
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
                        const fullRemarks = data.remarks || '';
                        const isWalkIn = fullRemarks.startsWith('[予約外]');
                        const displayRemarks = isWalkIn ? fullRemarks.replace('[予約外]', '').trim() : fullRemarks;

                        if (isWalkIn) {
                            td.classList.add('is-walk-in');
                        }

                        if (data.is_inpatient_block) {
                            td.style.backgroundColor = '#fdf2f8'; td.style.color = '#be185d'; td.style.border = '2px solid #f43f5e';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}🏥 入院患者介入枠<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        } else if (data.is_meeting) {
                            td.style.backgroundColor = '#ecfdf5'; td.style.color = '#065f46'; td.style.border = '2px solid #10b981';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}💬 面談: ${data.patient_name || '未指定'}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${isWalkIn ? '<span class="walk-in-badge">予約外</span><br>' : ''}${data.patient_name || '無名'}<br><span style="font-size: 0.6rem;">${displayRemarks}</span></div>`;
                        }
                        if (units > 1) { td.rowSpan = units; skipCells.anti[i] = units - 1; }
                    }
                    const antiKey = `reservation_${selectedDate}_${timeString}_anti_${i}`;
                    td.addEventListener('click', () => handleCellClick('消炎', i, timeString, td));
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
                    td.addEventListener('drop', (e) => {
                        e.preventDefault();
                        td.classList.remove('drag-over', 'anti-cell');
                        const sid = draggedSourceKey || e.dataTransfer.getData('text/plain');
                        if (!sid || sid === (data ? data.id : null)) return;
                        handleDrop(sid, selectedDate, timeString, 'anti', i);
                    });
                    tr.appendChild(td);
                }

                // Cancel Column
                const cancelTd = document.createElement('td');
                cancelTd.style.backgroundColor = '#f9fafb';
                cancelTd.style.borderLeft = '2px solid #e5e7eb';
                timeData.cancel.forEach(d => {
                    const div = document.createElement('div');
                    div.style.cssText = 'background:#f3f4f6; color:#6b7280; border:1px solid #d1d5db; padding:4px; margin-bottom:4px; border-radius:4px; font-size:0.7rem; cursor:pointer; text-align:center;';
                    div.innerHTML = `<strong>${d.patient_name || d.patientName || '無名'}</strong><br><span style="font-size:0.6rem;">${d.units || 1}枠 | ${d.cancelReason || d.cancel_reason || '理由なし'}</span>`;
                    div.addEventListener('click', () => openCancelDetailsModal(d, timeString));
                    cancelTd.appendChild(div);
                });
                tr.appendChild(cancelTd);
                scheduleBody.appendChild(tr);
            }
            currentTime.setMinutes(currentTime.getMinutes() + INTERVAL_MINUTES);
        }

        renderCanceledList(selectedDate);
        updateDailyStats(selectedDate);
        updateInpatientWeeklyUnits();
        updateStaffUnitInputs(dbReservations || []);
    };

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

        for (let i = 1; i <= 6; i++) {
            const input = document.getElementById(`staff-units-${i}`);
            if (input) input.value = staffTotals[i] || 0;
        }
        const antiInput = document.getElementById('anti-units-1');
        if (antiInput) antiInput.value = antiTotal;
    };

    const updateDailyStats = async (dateStr) => {
        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', dateStr);

        if (error || !data) return;

        let staffUnits = 0;
        let staffCases = 0;
        let antiUnits = 0;
        let antiCases = 0;
        let cancelCount = 0;

        let inpatientPlanned = 0;
        let inpatientActual = 0;
        let outpatientPlanned = 0;
        let outpatientActual = 0;

        data.forEach(res => {
            const units = parseInt(res.units) || 1;
            const isInpatient = res.is_inpatient_block === true;
            const isMeeting = res.is_meeting === true;

            if (res.status === 'canceled') {
                cancelCount++;
            } else {
                if (res.res_type === 'staff') {
                    staffUnits += units;
                    staffCases += 1;
                } else if (res.res_type === 'anti') {
                    antiUnits += units;
                    antiCases += 1;
                }

                if (isInpatient || isMeeting) {
                    inpatientPlanned += units;
                    if (res.status === 'arrived') {
                        inpatientActual += units;
                    }
                } else {
                    outpatientPlanned += units;
                    if (res.status === 'arrived') {
                        outpatientActual += units;
                    }
                }
            }
        });

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('total-units-count', staffUnits + antiUnits);
        setVal('total-cases-count', staffCases + antiCases);
        setVal('staff-units-count', staffUnits);
        setVal('staff-cases-count', staffCases);
        setVal('anti-units-count', antiUnits);
        setVal('anti-cases-count', antiCases);
        setVal('total-cancellations-count', cancelCount);

        setVal('inpatient-actual-units', inpatientActual);
        setVal('outpatient-planned-units', outpatientPlanned);
        setVal('outpatient-actual-units', outpatientActual);

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
            } else {
                return; // 廃用などは対象外
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
                <div>
                    <span style="font-weight: 600; color: #111827; margin-right: 1rem;">${item.time}</span>
                    <span style="color: #4b5563; margin-right: 1rem;">${item.patientName}</span>
                    <span style="font-size: 0.8rem; color: #6b7280;">(${item.type} / ${item.units}枠)</span>
                </div>
                <div>
                    <span style="background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${item.reason}</span>
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

        if (idList && nameList) {
            idList.innerHTML = '';
            nameList.innerHTML = '';
            const { data: outpatients } = await supabase.from('patients').select('p_id, p_name').eq('p_type', 'outpatient');
            if (outpatients) {
                outpatients.forEach(patient => {
                    const idOption = document.createElement('option');
                    idOption.value = patient.p_id;
                    idList.appendChild(idOption);

                    const nameOption = document.createElement('option');
                    nameOption.value = patient.p_name;
                    nameList.appendChild(nameOption);
                });
            }
        }

        if (inpatientDatalist) {
            inpatientDatalist.innerHTML = '';
            const { data: admissions } = await supabase.from('patients').select('p_id, p_name').eq('p_type', 'admission');
            if (admissions) {
                admissions.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = `${p.p_id} : ${p.p_name}`;
                    inpatientDatalist.appendChild(opt);
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

    let currentReservationKey = null;

    const handleCellClick = async (typeName, index, time, tdElement) => {
        currentSelectedCell = tdElement;

        const selectedDate = targetDateInput.value;
        // Search in DB instead of localStorage key
        const { data: existing, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('res_date', selectedDate)
            .eq('res_time', time)
            .eq('res_type', tdElement.dataset.type)
            .eq('res_index', index)
            .single();

        // Check if already booked
        if (tdElement.classList.contains('booked') && existing) {
            const data = existing;
            // Fetch patient diagnosis from patients table
            const { data: patient } = await supabase.from('patients').select('p_diagnosis_date').eq('p_id', data.patient_id).single();
            const diagnosisDate = patient ? (patient.p_diagnosis_date || '未登録') : '未登録';

            statusModalSubtitle.textContent = `${data.patient_name} (${data.patient_id})`;
            document.getElementById('status-modal-diagnosis-date').innerHTML = `<strong>診断日:</strong> ${diagnosisDate} | <strong>日時:</strong> ${selectedDate} ${time}`;
            currentReservationId = data.id; // Store DB ID instead of key
            statusModal.classList.add('show');
            return;
        }

        // Setup modal text for new booking
        modalSubtitle.textContent = `予約日時: ${targetDateInput.value} ${time} | ${typeName}枠 ${index}`;

        // Populate autocomplete options
        populateDatalists();

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

    // --- Drag and Drop handleDrop Implementation (Supabase) ---
    const handleDrop = async (sourceId, targetDate, targetTime, targetType, targetIndex) => {
        // sourceId is now the DB ID
        const { data: sourceData, error: fetchError } = await supabase.from('reservations').select('*').eq('id', sourceId).single();
        if (fetchError || !sourceData) return;

        const units = sourceData.units || 1;

        // Check collision for all required units at target
        let currentTime = new Date();
        const [h, m] = targetTime.split(':').map(Number);
        currentTime.setHours(h, m, 0, 0);

        for (let u = 0; u < units; u++) {
            const checkTime = formatTime(currentTime);

            // Check in DB if occupied
            const { data: existing } = await supabase
                .from('reservations')
                .select('id')
                .eq('res_date', targetDate)
                .eq('res_time', checkTime)
                .eq('res_type', targetType)
                .eq('res_index', targetIndex)
                .neq('id', sourceId) // Exclude self
                .single();

            if (existing) {
                alert('移動先に他の予約が入っています。');
                return;
            }

            // Check break time
            const checkH = currentTime.getHours();
            if (checkH >= BREAK_START_HOUR && checkH < BREAK_END_HOUR) {
                alert('休憩時間には移動できません。');
                return;
            }

            // Check end hour
            if (checkH > END_HOUR || (checkH === END_HOUR && checkTime.split(':')[1] !== '00')) {
                alert('終了時間を超える予約は移動できません。');
                return;
            }

            currentTime.setMinutes(currentTime.getMinutes() + INTERVAL_MINUTES);
        }

        // Check staff off
        if (targetType === 'staff') {
            const targetAttendance = await getStaffAttendance(targetDate);
            if (targetAttendance[targetIndex - 1] && targetAttendance[targetIndex - 1] !== 'work') {
                // Need careful check for morning/afternoon off later if needed
                alert('移動先のスタッフはお休みです。');
                // return; // Optional: allowed if user warns? original didn't allow
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

            await saveStaffData(newNames);
            await saveStaffAttendance(selectedDate, newAttendance);

            await createSchedule();
            closeStaffSettingsModal();
            alert('スタッフ設定を保存しました。');
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

    // --- Status Update Handlers ---
    const recordHistoryToDB = async (patientId, date, time, typeName, status, cancelReason = '') => {
        if (!patientId) return;

        // Fetch current patient record
        const { data: patient, error } = await supabase.from('patients').select('history').eq('p_id', patientId).single();
        if (error || !patient) return;

        let history = [];
        try {
            history = typeof patient.history === 'string' ? JSON.parse(patient.history) : (patient.history || []);
        } catch (e) { }

        // Check if history already exists
        const existingIndex = history.findIndex(h => h.date === date && h.time === time);

        if (existingIndex >= 0) {
            if (status === 'delete_history') {
                history.splice(existingIndex, 1);
            } else {
                history[existingIndex].status = status;
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
                cancelReason: status === 'canceled' ? cancelReason : ''
            });
        }

        history.sort((a, b) => {
            if (a.date !== b.date) return a.date > b.date ? -1 : 1;
            return a.time > b.time ? -1 : 1;
        });

        await supabase.from('patients').update({ history: JSON.stringify(history) }).eq('p_id', patientId);
    };

    const updateReservationStatus = async (status, cancelReason = '') => {
        if (!currentReservationId) return;

        // Fetch current data to get patientId etc.
        const { data: resData, error: fetchError } = await supabase.from('reservations').select('*').eq('id', currentReservationId).single();
        if (fetchError || !resData) return;

        if (status === 'canceled') {
            // Update status and store cancel reason in remarks or a dedicated field
            // To keep simple, we update existing row. (Original code moved it to a new key, but DB is better as a status change)
            await supabase.from('reservations').update({
                status: 'canceled',
                remarks: cancelReason || resData.remarks
            }).eq('id', currentReservationId);

            // Record history
            const typeNameStr = resData.res_type === 'staff' ? 'スタッフ' : '消炎';
            await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, status, cancelReason);

        } else {
            // Normal update (e.g. arrived)
            await supabase.from('reservations').update({ status: status }).eq('id', currentReservationId);

            // Record history
            const typeNameStr = resData.res_type === 'staff' ? 'スタッフ' : '消炎';
            await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, status, cancelReason);
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
                if (resData) {
                    const typeNameStr = resData.res_type === 'staff' ? 'スタッフ' : '消炎';
                    await recordHistoryToDB(resData.patient_id, resData.res_date, resData.res_time, typeNameStr, 'deleted');
                }

                await supabase.from('reservations').delete().eq('id', currentReservationId);
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
                    pName = parts[1];
                } else {
                    pName = combinedVal;
                    pId = '';
                }
            } else if (isInpatientBlock) {
                pId = 'INPATIENT';
                pName = '入院患者介入枠';
            }

            // Validation for multi-unit bookings
            if (units === 2) {
                if (selectedTime === '11:40') {
                    alert('11:40からの予約は12:00の休憩時間と重なるため、1枠(20分)しか予約できません。');
                    return;
                }
                const [hStr, mStr] = selectedTime.split(':');
                let h = parseInt(hStr, 10);
                let m = parseInt(mStr, 10);

                // End of day check (18:00 is the hard limit)
                if (h === 17 && m >= 40) {
                    alert('17:40以降の予約は18:00の診療終了時間を超えるため、1枠(20分)しか予約できません。');
                    return;
                }

                m += 20;
                if (m >= 60) { h += 1; m -= 60; }
                const nextTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const { data: existing } = await supabase
                    .from('reservations')
                    .select('id')
                    .eq('res_date', selectedDate)
                    .eq('res_time', nextTime)
                    .eq('res_type', selectedType)
                    .eq('res_index', selectedIndex)
                    .single();

                if (existing) {
                    alert('次の時間枠がすでに予約されているため、2枠の予約ができません。');
                    return;
                }
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

            const { error: insertError } = await supabase.from('reservations').insert([reservationData]);

            if (insertError) {
                console.error("Booking error:", insertError);
                alert("データの保存に失敗しました。SQLが正しく実行されているか確認してください。");
                return;
            }

            // Record to DB history if patient info is available
            if (pId && pId !== 'INPATIENT') {
                const typeName = selectedType === 'staff' ? `スタッフ枠 ${selectedIndex}` : `消炎枠 ${selectedIndex}`;
                await recordHistoryToDB(pId, selectedDate, selectedTime, typeName, 'booked');
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

    // Initialization sequence
    await migrateDataToSupabase();
    initializeDate();
    await createSchedule();

    // Optional: Re-render or handle date change if needed in the future
    targetDateInput.addEventListener('change', async (e) => {
        console.log('Selected date changed to:', e.target.value);
        await createSchedule();
    });
});
