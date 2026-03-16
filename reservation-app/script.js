document.addEventListener('DOMContentLoaded', () => {
    const scheduleBody = document.getElementById('schedule-body');
    const targetDateInput = document.getElementById('target-date');

    // Configuration
    const START_HOUR = 9;
    const END_HOUR = 18;
    const INTERVAL_MINUTES = 20;
    const BREAK_START_HOUR = 12;
    const BREAK_END_HOUR = 13;
    const STAFF_COUNT = 5;
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

    // --- Staff Management Logic ---
    const getStaffData = () => {
        const defaultNames = Array.from({ length: STAFF_COUNT }, (_, i) => `スタッフ ${i + 1}`);
        return JSON.parse(localStorage.getItem('staffNames')) || defaultNames;
    };

    const getStaffAttendance = (dateStr) => {
        // Returns an array of strings ['work', 'off', 'morning_off', 'afternoon_off']
        // Default is 'work' for all staff
        return JSON.parse(localStorage.getItem(`staffAttendance_${dateStr}`)) || Array(STAFF_COUNT).fill('work');
    };

    const saveStaffData = (names) => {
        localStorage.setItem('staffNames', JSON.stringify(names));
    };

    const saveStaffAttendance = (dateStr, attendance) => {
        localStorage.setItem(`staffAttendance_${dateStr}`, JSON.stringify(attendance));
    };
    // ----------------------------

    const createSchedule = () => {
        scheduleBody.innerHTML = '';
        const selectedDate = targetDateInput.value;

        // --- Optimization: Pre-fetch and group all reservations for this date ---
        const reservationsByTime = {}; // { "09:00": { staff: { 1: data }, anti: { 1: data }, cancel: [data] } }
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`reservation_${selectedDate}_`)) {
                try {
                    const parts = key.split('_');
                    if (parts.length < 4) continue;
                    
                    const time = parts[2];
                    const type = parts[3];
                    const index = parts[4];
                    const data = JSON.parse(localStorage.getItem(key));
                    
                    if (!reservationsByTime[time]) {
                        reservationsByTime[time] = { staff: {}, anti: {}, cancel: [] };
                    }
                    
                    if (type === 'staff') {
                        reservationsByTime[time].staff[index] = data;
                    } else if (type === 'anti') {
                        reservationsByTime[time].anti[index] = data;
                    } else if (type === 'cancel') {
                        data.key = key;
                        reservationsByTime[time].cancel.push(data);
                    }
                } catch (e) { }
            }
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

        const staffNames = getStaffData();
        const staffAttendance = getStaffAttendance(selectedDate);

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
                        if (data.isInpatientBlock) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">🏥 入院患者介入枠<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#fdf2f880' : '#fdf2f8';
                            td.style.color = isStaffOff ? '#be185d80' : '#be185d';
                        } else if (data.isMeeting) {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">💬 面談: ${data.patientName || '未指定'}<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                            td.style.backgroundColor = isStaffOff ? '#ecfdf580' : '#ecfdf5';
                            td.style.color = isStaffOff ? '#065f4680' : '#065f46';
                            td.style.border = isStaffOff ? '2px solid #d1fae580' : '2px solid #10b981';
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${data.patientName || '無名'}<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                        }
                        const units = data.units || 1;
                        if (units > 1) { td.rowSpan = units; skipCells.staff[i] = units - 1; }
                    }

                    const staffKey = `reservation_${selectedDate}_${timeString}_staff_${i}`;
                    td.addEventListener('click', () => {
                        if (isStaffOff && !td.classList.contains('booked')) { alert('お休みです'); return; }
                        handleCellClick(staffNames[i - 1], i, timeString, td);
                    });

                    if (td.classList.contains('booked')) {
                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => { draggedSourceKey = staffKey; td.classList.add('dragging'); e.dataTransfer.setData('text/plain', staffKey); });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });
                    }
                    td.addEventListener('dragover', (e) => { if (td.classList.contains('booked') && staffKey !== draggedSourceKey) return; if (isStaffOff) return; e.preventDefault(); td.classList.add('drag-over'); });
                    td.addEventListener('dragleave', () => td.classList.remove('drag-over'));
                    td.addEventListener('drop', (e) => { e.preventDefault(); td.classList.remove('drag-over'); const sk = draggedSourceKey || e.dataTransfer.getData('text/plain'); if (!sk || sk === staffKey) return; handleDrop(sk, selectedDate, timeString, 'staff', i); });
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
                        if (data.isInpatientBlock) {
                            td.style.backgroundColor = '#fdf2f8'; td.style.color = '#be185d'; td.style.border = '2px solid #f43f5e';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">🏥 入院患者介入枠<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                        } else if (data.isMeeting) {
                            td.style.backgroundColor = '#ecfdf5'; td.style.color = '#065f46'; td.style.border = '2px solid #10b981';
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">💬 面談: ${data.patientName || '未指定'}<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                        } else {
                            td.innerHTML = `<div class="status-text" style="font-size: 0.7rem;">${data.patientName || '無名'}<br><span style="font-size: 0.6rem;">${data.remarks || ''}</span></div>`;
                        }
                        const units = data.units || 1;
                        if (units > 1) { td.rowSpan = units; skipCells.anti[i] = units - 1; }
                    }
                    const antiKey = `reservation_${selectedDate}_${timeString}_anti_${i}`;
                    td.addEventListener('click', () => handleCellClick('消炎', i, timeString, td));
                    if (td.classList.contains('booked')) {
                        td.draggable = true;
                        td.addEventListener('dragstart', (e) => { draggedSourceKey = antiKey; td.classList.add('dragging'); e.dataTransfer.setData('text/plain', antiKey); });
                        td.addEventListener('dragend', () => { td.classList.remove('dragging'); draggedSourceKey = null; });
                    }
                    td.addEventListener('dragover', (e) => { if (td.classList.contains('booked') && antiKey !== draggedSourceKey) return; e.preventDefault(); td.classList.add('drag-over', 'anti-cell'); });
                    td.addEventListener('dragleave', () => td.classList.remove('drag-over', 'anti-cell'));
                    td.addEventListener('drop', (e) => { e.preventDefault(); td.classList.remove('drag-over', 'anti-cell'); const sk = draggedSourceKey || e.dataTransfer.getData('text/plain'); if (!sk || sk === antiKey) return; handleDrop(sk, selectedDate, timeString, 'anti', i); });
                    tr.appendChild(td);
                }

                // Cancel Column
                const cancelTd = document.createElement('td');
                cancelTd.style.backgroundColor = '#f9fafb';
                cancelTd.style.borderLeft = '2px solid #e5e7eb';
                timeData.cancel.forEach(d => {
                    const div = document.createElement('div');
                    div.style.cssText = 'background:#f3f4f6; color:#6b7280; border:1px solid #d1d5db; padding:4px; margin-bottom:4px; border-radius:4px; font-size:0.7rem; cursor:pointer; text-align:center;';
                    div.innerHTML = `<strong>${d.patientName || '無名'}</strong><br><span style="font-size:0.6rem;">${d.units || 1}枠 | ${d.cancelReason || '理由なし'}</span>`;
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
    };

    const updateDailyStats = (dateStr) => {
        let staffUnits = 0;
        let antiUnits = 0;
        let cancelCount = 0;

        let inpatientPlanned = 0;
        let inpatientActual = 0;
        let outpatientPlanned = 0;
        let outpatientActual = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`reservation_${dateStr}`)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const units = parseInt(data.units) || 1;
                    const isInpatient = data.isInpatientBlock === true;
                    const isMeeting = data.isMeeting === true;

                    if (data.status === 'canceled') {
                        cancelCount++;
                    } else {
                        // Base units
                        if (key.includes('_staff_')) {
                            staffUnits += units;
                        } else if (key.includes('_anti_')) {
                            antiUnits += units;
                        }

                        // Detailed breakdown
                        if (isInpatient || isMeeting) {
                            inpatientPlanned += units;
                            if (data.status === 'arrived') {
                                inpatientActual += units;
                            }
                        } else {
                            outpatientPlanned += units;
                            if (data.status === 'arrived') {
                                outpatientActual += units;
                            }
                        }
                    }
                } catch (e) { }
            }
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('total-units-count', staffUnits + antiUnits);
        setVal('staff-units-count', staffUnits);
        setVal('anti-units-count', antiUnits);
        setVal('total-cancellations-count', cancelCount);

        setVal('inpatient-planned-units', inpatientPlanned);
        setVal('inpatient-actual-units', inpatientActual);
        setVal('outpatient-planned-units', outpatientPlanned);
        setVal('outpatient-actual-units', outpatientActual);
    };

    const renderCanceledList = (dateStr) => {
        const container = document.getElementById('canceled-list-container');
        if (!container) return;

        const canceledItems = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`reservation_${dateStr}`)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data.status === 'canceled') {
                        const [_, resDate, resTime, resType, resIndex] = key.split('_');
                        const typeNameStr = resType === 'staff' ? 'スタッフ' : '消炎';
                        const allPatients = [...(JSON.parse(localStorage.getItem('admissionPatients')) || []), ...(JSON.parse(localStorage.getItem('outpatientPatients')) || [])];
                        const patient = allPatients.find(p => p.id === data.patientId);

                        canceledItems.push({
                            time: resTime,
                            type: `${typeNameStr}枠 ${resIndex}`,
                            units: data.units || 1,
                            patientName: data.patientName,
                            patientId: data.patientId,
                            diagnosisDate: patient ? (patient.date || '-') : '-',
                            reason: data.cancelReason || '理由なし'
                        });
                    }
                } catch (e) { }
            }
        }

        // Sort by time
        canceledItems.sort((a, b) => a.time.localeCompare(b.time));

        container.innerHTML = '';
        if (canceledItems.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">現在、該当するキャンセルデータはありません。</p>`;
            return;
        }

        canceledItems.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = '0.75rem';
            div.style.backgroundColor = '#f9fafb';
            div.style.border = '1px solid #e5e7eb';
            div.style.borderRadius = 'var(--border-radius-sm)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <div>
                    <span style="font-weight: 600; color: #111827; margin-right: 1rem;">${item.time}</span>
                    <span style="color: #4b5563; margin-right: 1rem;">${item.patientName}</span>
                    <span style="font-size: 0.8rem; color: #6b7280; margin-right: 1rem;">(診断日: ${item.diagnosisDate})</span>
                    <span style="font-size: 0.8rem; color: #6b7280;">(${item.type} / ${item.units}枠)</span>
                </div>
                <div>
                    <span style="background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${item.reason}</span>
                </div>
            `;
            container.appendChild(div);
        });
    };

    // Modal Logic
    const bookingModal = document.getElementById('booking-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const bookingForm = document.getElementById('booking-form');
    const modalSubtitle = document.getElementById('modal-subtitle');
    let currentSelectedCell = null;

    // --- Auto-fill from Patient DB ---
    const getPatientDB = (outpatientOnly = false) => {
        let db = [];
        try {
            const admission = JSON.parse(localStorage.getItem('admissionPatients')) || [];
            const outpatient = JSON.parse(localStorage.getItem('outpatientPatients')) || [];
            db = outpatientOnly ? [...outpatient] : [...admission, ...outpatient];
        } catch (e) {
            console.error("Local DB parse error", e);
        }
        return db;
    };

    const populateDatalists = () => {
        const db = getPatientDB(true); // Only fetch outpatient data for autocomplete
        const idList = document.getElementById('patient-id-list');
        const nameList = document.getElementById('patient-name-list');

        if (idList && nameList) {
            idList.innerHTML = '';
            nameList.innerHTML = '';

            db.forEach(patient => {
                const idOption = document.createElement('option');
                idOption.value = patient.id;
                idList.appendChild(idOption);

                const nameOption = document.createElement('option');
                nameOption.value = patient.name;
                nameList.appendChild(nameOption);
            });
        }

        // Populate Inpatient list
        const inpatientDatalist = document.getElementById('inpatient-list');
        if (inpatientDatalist) {
            inpatientDatalist.innerHTML = '';
            const admissions = JSON.parse(localStorage.getItem('admissionPatients')) || [];
            admissions.forEach(p => {
                const opt = document.createElement('option');
                opt.value = `${p.id} : ${p.name}`;
                inpatientDatalist.appendChild(opt);
            });
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
        patientIdInput.addEventListener('input', (e) => {
            const val = toHalfWidth(e.target.value);
            e.target.value = val; // Force half-width in UI
            
            const db = getPatientDB(true); // Outpatient only
            const found = db.find(p => p.id === val);
            if (found) {
                patientNameInput.value = found.name;
                if (treatmentDetailsInput) treatmentDetailsInput.value = found.disease || '';
            }
        });

        // Auto-fill when Name is entered
        patientNameInput.addEventListener('input', (e) => {
            const db = getPatientDB(true); // Outpatient only
            const val = e.target.value.trim();
            const found = db.find(p => p.name === val);
            if (found) {
                patientIdInput.value = found.id;
                if (treatmentDetailsInput) treatmentDetailsInput.value = found.disease || '';
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

    const handleCellClick = (typeName, index, time, tdElement) => {
        currentSelectedCell = tdElement;

        const selectedDate = targetDateInput.value;
        currentReservationKey = `reservation_${selectedDate}_${time}_${tdElement.dataset.type}_${index}`;

        // Check if already booked
        if (tdElement.classList.contains('booked')) {
            const savedData = localStorage.getItem(currentReservationKey);
            if (savedData) {
                const data = JSON.parse(savedData);
                const allPatients = [...(JSON.parse(localStorage.getItem('admissionPatients')) || []), ...(JSON.parse(localStorage.getItem('outpatientPatients')) || [])];
                const patient = allPatients.find(p => p.id === data.patientId);
                const diagnosisDate = patient ? (patient.date || '未登録') : '未登録';

                statusModalSubtitle.textContent = `${data.patientName} (${data.patientId})`;
                document.getElementById('status-modal-diagnosis-date').innerHTML = `<strong>診断日:</strong> ${diagnosisDate} | <strong>日時:</strong> ${selectedDate} ${time}`;
                statusModal.classList.add('show');
            }
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

    const openCancelDetailsModal = (data, timeStr) => {
        currentCanceledKey = data.key;
        currentCanceledData = data;
        currentCanceledTime = timeStr;

        let originalTypeStr = data.originalType || '不明';

        const currentDate = document.getElementById('target-date').value;

        const allPatients = [...(JSON.parse(localStorage.getItem('admissionPatients')) || []), ...(JSON.parse(localStorage.getItem('outpatientPatients')) || [])];
        const patient = allPatients.find(p => p.id === data.patientId);
        const diagnosisDate = patient ? (patient.date || '未登録') : '未登録';

        cancelDetailsContent.innerHTML = `
            <div style="padding: 0.5rem; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 0.5rem;">
                <p style="margin: 0.25rem 0;"><strong>患者名:</strong> ${data.patientName} (${data.patientId})</p>
                <p style="margin: 0.25rem 0;"><strong>診断日:</strong> ${diagnosisDate}</p>
                <p style="margin: 0.25rem 0;"><strong>日時:</strong> ${currentDate} ${timeStr}</p>
                <p style="margin: 0.25rem 0;"><strong>元の予約:</strong> ${originalTypeStr}</p>
                <p style="margin: 0.25rem 0;"><strong>単位数:</strong> ${data.units || 1}枠 (${(data.units || 1) * 20}分)</p>
                <p style="margin: 0.25rem 0;"><strong>備考:</strong> ${data.remarks || 'なし'}</p>
            </div>
            <div style="padding: 0.5rem; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca; color: #b91c1c;">
                <p style="margin: 0.25rem 0;"><strong>キャンセル理由:</strong> ${data.cancelReason || '理由なし'}</p>
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
        btnDeleteCanceled.addEventListener('click', () => {
            if (!currentCanceledKey || !currentCanceledData) return;
            if (confirm('このキャンセル履歴を完全に削除しますか？\n（患者データの履歴からも消去されます）')) {
                // Remove from patient history DB
                const [_, resDate, resTime] = currentCanceledKey.split('_');
                recordHistoryToDB(currentCanceledData.patientId, resDate, currentCanceledTime, '', 'delete_history');

                // Remove from schedule localStorage
                localStorage.removeItem(currentCanceledKey);
                
                createSchedule();
                closeCancelDetailsModal();
            }
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeBookingModal);
    }

    // --- Drag and Drop handleDrop Implementation ---
    const handleDrop = (sourceKey, targetDate, targetTime, targetType, targetIndex) => {
        const sourceDataStr = localStorage.getItem(sourceKey);
        if (!sourceDataStr) return;

        const sourceData = JSON.parse(sourceDataStr);
        const units = sourceData.units || 1;

        // Check if destination is available
        // (For simplicity, we assume source and target dates are the same as selectedDate)
        const targetBaseKey = `reservation_${targetDate}_${targetTime}_${targetType}_${targetIndex}`;
        
        // If dropping onto self, do nothing
        if (sourceKey === targetBaseKey) return;

        // Check collision for all required units at target
        let currentTime = new Date();
        const [h, m] = targetTime.split(':').map(Number);
        currentTime.setHours(h, m, 0, 0);

        for (let u = 0; u < units; u++) {
            const checkTime = formatTime(currentTime);
            const checkKey = `reservation_${targetDate}_${checkTime}_${targetType}_${targetIndex}`;
            
            // It's occupied IF it's booked AND NOT the source being moved
            const existing = localStorage.getItem(checkKey);
            if (existing && checkKey !== sourceKey) {
                // Check if it's the SAME reservation (multi-unit source)
                const existingData = JSON.parse(existing);
                // We should check if we are dropping into the same reservation we started from
                // But generally, if it's booked, skip.
                alert('移動先に他の予約が入っています。');
                return;
            }
            
            // Check if it's break time
            const checkH = currentTime.getHours();
            if (checkH >= BREAK_START_HOUR && checkH < BREAK_END_HOUR) {
                alert('休憩時間には移動できません。');
                return;
            }

            // Check if it's past END_HOUR
            if (checkH > END_HOUR || (checkH === END_HOUR && checkTime.split(':')[1] !== '00')) {
                alert('終了時間を超える予約は移動できません。');
                return;
            }

            currentTime.setMinutes(currentTime.getMinutes() + INTERVAL_MINUTES);
        }

        // Check if target staff is off
        if (targetType === 'staff') {
            const targetAttendance = getStaffAttendance(targetDate);
            if (targetAttendance[targetIndex - 1]) {
                alert('移動先のスタッフは当日お休みです。');
                return;
            }
        }

        // Perform move
        // 1. Delete old key(s)
        // Note: For multi-unit source, the data is only stored in the TOP key anyway.
        localStorage.removeItem(sourceKey);

        // 2. Save to new key
        localStorage.setItem(targetBaseKey, JSON.stringify(sourceData));

        // 3. Refresh schedule
        createSchedule();
    };

    // --- Staff Settings Modal Logic ---
    const staffSettingsBtn = document.getElementById('staff-settings-btn');
    const staffSettingsModal = document.getElementById('staff-settings-modal');
    const closeStaffSettingsBtn = document.getElementById('close-staff-settings-btn');
    const staffSettingsForm = document.getElementById('staff-settings-form');
    const staffInputsContainer = document.getElementById('staff-inputs-container');
    const staffSettingsDateLabel = document.getElementById('staff-settings-date-label');

    const openStaffSettingsModal = () => {
        const selectedDate = targetDateInput.value;
        staffSettingsDateLabel.textContent = `対象日: ${selectedDate}`;
        
        const names = getStaffData();
        const attendance = getStaffAttendance(selectedDate);
        
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
        staffSettingsForm.addEventListener('submit', (e) => {
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
            
            saveStaffData(newNames);
            saveStaffAttendance(selectedDate, newAttendance);
            
            createSchedule();
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
    const recordHistoryToDB = (patientId, date, time, typeName, status, cancelReason = '') => {
        if (!patientId) return;

        let admissionPatients = JSON.parse(localStorage.getItem('admissionPatients')) || [];
        let outpatientPatients = JSON.parse(localStorage.getItem('outpatientPatients')) || [];
        let updated = false;

        const updatePatientHistory = (patient) => {
            if (patient.id === patientId) {
                updated = true;
                const historyStr = patient.history || '[]';
                let history = [];
                try {
                    history = JSON.parse(historyStr);
                } catch (e) { }

                // Check if history already exists for this exact appointment
                const existingIndex = history.findIndex(h => h.date === date && h.time === time);

                if (existingIndex >= 0) {
                    if (status === 'delete_history') {
                        // Physically remove from history array
                        history.splice(existingIndex, 1);
                    } else {
                        // Update status
                        history[existingIndex].status = status;
                        if (status === 'canceled' && cancelReason) {
                            history[existingIndex].cancelReason = cancelReason;
                        }
                    }
                } else if (status !== 'delete_history') {
                    // Add new history entry
                    history.push({
                        date,
                        time,
                        type: typeName,
                        status,
                        cancelReason: status === 'canceled' ? cancelReason : ''
                    });
                }

                // Sort history desc by date and time
                history.sort((a, b) => {
                    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
                    return a.time > b.time ? -1 : 1;
                });

                patient.history = JSON.stringify(history);
            }
            return patient;
        };

        admissionPatients = admissionPatients.map(updatePatientHistory);
        outpatientPatients = outpatientPatients.map(updatePatientHistory);

        if (updated) {
            localStorage.setItem('admissionPatients', JSON.stringify(admissionPatients));
            localStorage.setItem('outpatientPatients', JSON.stringify(outpatientPatients));
        }
    };

    const updateReservationStatus = (status, cancelReason = '') => {
        if (!currentReservationKey) return;

        const savedData = localStorage.getItem(currentReservationKey);
        if (savedData) {
            const data = JSON.parse(savedData);

            if (status === 'canceled') {
                // Remove original key to free up the slot
                localStorage.removeItem(currentReservationKey);

                // Generate a new key for cancelled item (e.g. reservation_date_time_cancel_timestamp)
                const [_, resDate, resTime, resType] = currentReservationKey.split('_');
                const cancelKey = `reservation_${resDate}_${resTime}_cancel_${Date.now()}`;

                data.status = 'canceled';
                data.originalType = resType === 'staff' ? 'スタッフ枠' : '消炎枠';

                if (cancelReason) {
                    data.cancelReason = cancelReason;
                }

                // Save under new cancel key
                localStorage.setItem(cancelKey, JSON.stringify(data));

                // Push to patient DB history
                const typeNameStr = resType === 'staff' ? 'スタッフ' : '消炎';
                recordHistoryToDB(data.patientId, resDate, resTime, typeNameStr, status, cancelReason);

            } else {
                // Normal update (e.g. arrived)
                data.status = status;
                localStorage.setItem(currentReservationKey, JSON.stringify(data));

                // Push to patient DB history
                const [_, resDate, resTime, resType] = currentReservationKey.split('_');
                const typeNameStr = resType === 'staff' ? 'スタッフ' : '消炎';
                recordHistoryToDB(data.patientId, resDate, resTime, typeNameStr, status, cancelReason);
            }

            createSchedule(); // Re-render to show visual changes
        }
        closeStatusModal();
    };

    if (btnStatusArrived) {
        btnStatusArrived.addEventListener('click', () => updateReservationStatus('arrived'));
    }

    if (btnStatusCanceled) {
        btnStatusCanceled.addEventListener('click', () => {
            const reasonSelect = document.getElementById('cancel-reason');
            const reason = reasonSelect ? reasonSelect.value : '';

            if (!reason) {
                alert('キャンセル理由を選択してください。');
                return;
            }

            if (confirm('この予約をキャンセルしますか？患者データにキャンセル履歴が記録されます。')) {
                updateReservationStatus('canceled', reason);
            }
        });
    }

    if (btnStatusDelete) {
        btnStatusDelete.addEventListener('click', () => {
            if (confirm('この予約枠を完全に削除して空き枠に戻しますか？')) {
                const savedData = localStorage.getItem(currentReservationKey);
                if (savedData) {
                    const data = JSON.parse(savedData);
                    const [_, resDate, resTime, resType] = currentReservationKey.split('_');
                    const typeNameStr = resType === 'staff' ? 'スタッフ' : '消炎';
                    // Mark as deleted in history
                    recordHistoryToDB(data.patientId, resDate, resTime, typeNameStr, 'deleted');
                }

                localStorage.removeItem(currentReservationKey);
                createSchedule();
                closeStatusModal();
            }
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', (e) => {
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

            let pId = document.getElementById('patient-id').value;
            let pName = document.getElementById('patient-name').value;
            const remarks = document.getElementById('remarks').value;
            
            const unitsChecked = document.querySelector('input[name="booking-units"]:checked');
            const units = unitsChecked ? parseInt(unitsChecked.value, 10) : 2;

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
                const nextKey = `reservation_${selectedDate}_${nextTime}_${selectedType}_${selectedIndex}`;

                if (localStorage.getItem(nextKey)) {
                    alert('次の時間枠がすでに予約されているため、2枠の予約ができません。');
                    return;
                }
            }

            const reservationData = {
                patientId: pId,
                patientName: pName,
                remarks,
                units,
                isInpatientBlock,
                isMeeting,
                status: 'booked'
            };

            const key = `reservation_${selectedDate}_${selectedTime}_${selectedType}_${selectedIndex}`;
            localStorage.setItem(key, JSON.stringify(reservationData));

            // Record to DB history if patient info is available
            if (pId && pId !== 'INPATIENT') {
                const typeName = selectedType === 'staff' ? `スタッフ枠 ${selectedIndex}` : `消炎枠 ${selectedIndex}`;
                recordHistoryToDB(pId, selectedDate, selectedTime, typeName, 'booked');
            }

            createSchedule();
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

    // Initialization sequence
    initializeDate();
    createSchedule();

    // Optional: Re-render or handle date change if needed in the future
    targetDateInput.addEventListener('change', (e) => {
        console.log('Selected date changed to:', e.target.value);
        // Re-render the schedule when date changes to fetch new data
        createSchedule();
    });
});
