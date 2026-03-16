const monthYearText = document.getElementById('monthYear');
const calendarGrid = document.getElementById('calendarGrid');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let currentDate = new Date(); // Starts at today
let manualOverrides = JSON.parse(localStorage.getItem('calendarApp_overrides')) || {};
let holidays = {}; // 祝日データを保持するオブジェクト

// 日本の祝日を取得する非同期関数（内閣府のデータを提供する外部APIを使用）
async function fetchHolidays(year) {
    if (holidays[year]) return; // すでに取得済みならスキップ

    try {
        const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
        if (response.ok) {
            const data = await response.json();
            holidays[year] = data;
        }
    } catch (error) {
        console.error('祝日データの取得に失敗しました', error);
    }
}

function saveOverrides() {
    localStorage.setItem('calendarApp_overrides', JSON.stringify(manualOverrides));
}

async function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    // 祝日データを取得してからカレンダーを描画
    await fetchHolidays(year);
    // 年またぐ可能性を考慮して前後の年も取得（簡略化）

    monthYearText.textContent = `${year}年 ${month + 1}月`;

    // Clear grid
    calendarGrid.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Empty cells before the 1st
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell empty-cell';
        calendarGrid.appendChild(emptyCell);
    }

    // Days in the month
    for (let day = 1; day <= lastDay; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'day-cell';
        dayCell.style.cursor = 'pointer';

        const dayOfWeek = (firstDayIndex + day - 1) % 7;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        let isHoliday = false;
        let holidayName = '';

        // 祝日かどうかの判定
        if (holidays[year] && holidays[year][dateStr]) {
            isHoliday = true;
            holidayName = holidays[year][dateStr];
        }

        // 日曜・祝日の文字色制御
        if (dayOfWeek === 0 || isHoliday) dayCell.classList.add('sun');
        else if (dayOfWeek === 6) dayCell.classList.add('sat');

        // manualOverrides に設定があればそれを使用、なければデフォルトルール
        let isNextCalc;
        let isManualHidden = false; // 手動で非表示にした場合のフラグ（トグル用）

        if (manualOverrides[dateStr] === 'hidden') {
            isManualHidden = true;
        } else if (manualOverrides[dateStr] !== undefined) {
            isNextCalc = manualOverrides[dateStr] === 'next';
        } else {
            // logic: 1-14 is next calculation, 15+ is first calculation
            isNextCalc = day <= 14;
        }

        let labelHtml = '';
        // 祝日はデフォルトで非表示、ただし手動上書きがあればそれを優先
        let shouldHideDefault = isHoliday;

        if (isManualHidden) {
            // 手動非表示
            labelHtml = '';
        } else if (!shouldHideDefault || manualOverrides[dateStr] !== undefined) {
            // 表示する場合
            const labelText = isNextCalc ? '次回算定' : '初回算定';
            const labelClass = isNextCalc ? 'label-next' : 'label-first';
            labelHtml = `<div class="calc-label ${labelClass}">${labelText}</div>`;
        }

        const holidayHtml = isHoliday ? `<div style="font-size: 0.65rem; color: #ef4444; margin-bottom: 2px;">${holidayName}</div>` : '';

        dayCell.innerHTML = `
            <div class="day-number">${day}</div>
            ${holidayHtml}
            ${labelHtml}
        `;

        // クリックイベントで状態をトグル (次回 -> 初回 -> 非表示 -> 次回...)
        dayCell.addEventListener('click', () => {
            if (manualOverrides[dateStr] === undefined) {
                // 初回クリック時は現在の状態（未設定）から次へ
                if (isHoliday) {
                    manualOverrides[dateStr] = isNextCalc ? 'first' : 'next'; // 祝日（デフォ非表示）なら表示へ
                } else {
                    manualOverrides[dateStr] = isNextCalc ? 'first' : 'next';
                }
            } else if (manualOverrides[dateStr] === 'next') {
                manualOverrides[dateStr] = 'first';
            } else if (manualOverrides[dateStr] === 'first') {
                manualOverrides[dateStr] = 'hidden';
            } else {
                manualOverrides[dateStr] = 'next';
            }
            saveOverrides();
            renderCalendar(currentDate); // 再描画
        });

        calendarGrid.appendChild(dayCell);
    }
}

prevBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
});

nextBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
});

// Initial render
renderCalendar(currentDate);
