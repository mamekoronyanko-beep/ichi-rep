// --- Supabase Configuration ---
const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
let supabaseClient;

let currentYear = 2026;
let patientCategoryMap = {};
let patientNursingCareMap = {};
let allReservations = [];

document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    document.getElementById('prev-year').addEventListener('click', () => changeYear(-1));
    document.getElementById('next-year').addEventListener('click', () => changeYear(1));
    document.getElementById('refresh-btn').addEventListener('click', () => loadYearData());

    await loadInitialData();
    await loadYearData();
});

async function loadInitialData() {
    const { data: patients } = await supabaseClient.from('patients').select('id, category, need_nursing_care');
    if (patients) {
        patients.forEach(p => {
            patientCategoryMap[p.id] = p.category || 'その他';
            patientNursingCareMap[p.id] = p.need_nursing_care || false;
        });
    }
}

function changeYear(delta) {
    currentYear += delta;
    document.getElementById('current-year-display').textContent = `${currentYear}年`;
    loadYearData();
}

async function loadYearData() {
    const tbody = document.getElementById('perf-table-body');
    tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 3rem; color: #64748b;">${currentYear}年のデータを集計中...</td></tr>`;

    const startStr = `${currentYear}-01-01`;
    const endStr = `${currentYear}-12-31`;

    const { data: resData } = await supabaseClient
        .from('reservations')
        .select('id, patient_id, res_date, res_time, units, status, is_meeting, is_inpatient_block')
        .gte('res_date', startStr)
        .lte('res_date', endStr);

    allReservations = resData || [];

    renderTable();
}

function getPrices(year, month) {
    const isBeforeJune2026 = (year < 2026) || (year === 2026 && month < 6);
    return isBeforeJune2026 ? {
        type: 'old',
        in_locomotor: 1850, in_locomotor_deduction: 1110,
        in_cerebro: 2000, in_cerebro_deduction: 1200,
        in_disuse: 1460, in_disuse_deduction: 880,
        out_locomotor: 1850, out_cerebro: 2000, out_anti: 350, out_other: 2000,
        re_exam: 770 / 2, // 385 yen
        nursing: {
            '計画評価1': 3000, '計画評価1(初回)': 3000, '計画評価1(2回目以降)': 3000,
            '計画評価2': 2400, '計画評価2(初回)': 2400, '計画評価2(2回目以降)': 2400,
            '目標1': 2500, '目標2': 1000
        }
    } : {
        type: 'new',
        in_locomotor: 1850, in_locomotor_deduction: 1680,
        in_cerebro: 2000, in_cerebro_deduction: 1800,
        in_disuse: 1460, in_disuse_deduction: 1320,
        out_locomotor: 1850, out_cerebro: 2000, out_anti: 350, out_other: 2000,
        re_exam: 410,
        nursing: {
            '計画評価1': 3000, '計画評価1(初回)': 3000, '計画評価1(2回目以降)': 3000,
            '計画評価2': 2400, '計画評価2(初回)': 2400, '計画評価2(2回目以降)': 2400,
            '目標1': 2500, '目標2': 1000
        }
    };
}

function renderTable() {
    const tbody = document.getElementById('perf-table-body');
    
    // Rows: Inpatient, Outpatient, Eval/Goal, Nursing, Total
    const rows = [
        { id: 'inpatient', label: '🏥 入院売上', cls: 'section-header', values: Array(12).fill(0), sub: [] },
        { id: 'in_locomotor', label: '└ 運動器', cls: 'row-sub', values: Array(12).fill(0) },
        { id: 'in_cerebro', label: '└ 脳血管', cls: 'row-sub', values: Array(12).fill(0) },
        { id: 'in_disuse', label: '└ 廃用症候群', cls: 'row-sub', values: Array(12).fill(0) },

        { id: 'outpatient', label: '👤 外来売上 (再診料込)', cls: 'section-header', values: Array(12).fill(0), sub: [] },
        { id: 'out_locomotor', label: '└ 運動器', cls: 'row-sub', values: Array(12).fill(0) },
        { id: 'out_cerebro', label: '└ 脳血管', cls: 'row-sub', values: Array(12).fill(0) },
        { id: 'out_anti', label: '└ 消炎', cls: 'row-sub', values: Array(12).fill(0) },

        { id: 'eval', label: '📝 評価・目標 (入外合算)', cls: 'section-header', values: Array(12).fill(0), sub: [] },
        { id: 'nursing', label: '🏢 介護医療院', cls: 'section-header', values: Array(12).fill(0), sub: [] },
        { id: 'total', label: '💰 総合計売上', cls: 'total-row', values: Array(12).fill(0), sub: [] },
    ];

    const getRow = (id) => rows.find(r => r.id === id);

    for (let month = 1; month <= 12; month++) {
        const prices = getPrices(currentYear, month);
        const monthIdx = month - 1;

        // --- Inpatient Sales (From LocalStorage) ---
        ['locomotor', 'cerebro', 'disuse'].forEach(cat => {
            let totalUnits = 0;
            let deductionUnits = 0;
            const lastDay = new Date(currentYear, month, 0).getDate();
            for (let d = 1; d <= lastDay; d++) {
                const dateStr = `${currentYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                totalUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${dateStr}`)) || 0;
                deductionUnits += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${dateStr}`)) || 0;
            }
            
            let val = 0;
            if (cat === 'locomotor') {
                val = (totalUnits - deductionUnits) * prices.in_locomotor + (deductionUnits * prices.in_locomotor_deduction);
                getRow('in_locomotor').values[monthIdx] = val;
            } else if (cat === 'cerebro') {
                val = (totalUnits - deductionUnits) * prices.in_cerebro + (deductionUnits * prices.in_cerebro_deduction);
                getRow('in_cerebro').values[monthIdx] = val;
            } else if (cat === 'disuse') {
                val = (totalUnits - deductionUnits) * prices.in_disuse + (deductionUnits * prices.in_disuse_deduction);
                getRow('in_disuse').values[monthIdx] = val;
            }
            getRow('inpatient').values[monthIdx] += val;
        });

        // --- Outpatient & Nursing Base Sales (From Reservations) ---
        const filteredRes = allReservations.filter(res => {
            if (res.status === 'canceled') return false;
            const d = new Date(res.res_date);
            return d.getMonth() + 1 === month;
        });

        const nursingVisits = { withCare: 0, withoutCare: 0 };

        filteredRes.forEach(res => {
            const units = parseInt(res.units) || 1;
            const pId = res.patient_id;
            const cat = patientCategoryMap[pId] || 'その他';

            if (res.is_meeting) {
                if (patientNursingCareMap[pId]) nursingVisits.withCare++;
                else nursingVisits.withoutCare++;
                return;
            }

            if (res.is_inpatient_block) return;

            let outVal = 0;
            if (cat === '運動器') {
                outVal = (units * prices.out_locomotor) + prices.re_exam;
                getRow('out_locomotor').values[monthIdx] += outVal;
            } else if (cat === '脳血管') {
                outVal = (units * prices.out_cerebro) + prices.re_exam;
                getRow('out_cerebro').values[monthIdx] += outVal;
            } else if (cat === '消炎') {
                outVal = (units * prices.out_anti) + prices.re_exam;
                getRow('out_anti').values[monthIdx] += outVal;
            } else {
                outVal = (units * prices.out_other);
            }
            getRow('outpatient').values[monthIdx] += outVal;
        });

        // --- Eval/Goal (From LocalStorage) ---
        let planEvalAndGoalSales = 0;
        const inOutMetrics = [
            '計画評価1', '計画評価1(初回)', '計画評価1(2回目以降)', 
            '計画評価2', '計画評価2(初回)', '計画評価2(2回目以降)',
            '目標1', '目標2'
        ];
        // Note: the original logic subtracts 1 from month to store in localstorage because JS Date months are 0-11
        // `manual_nursing_${year}_${month - 1}_${label}`
        inOutMetrics.forEach(label => {
            const storageKey = `manual_nursing_${currentYear}_${month - 1}_${label}`;
            const count = parseInt(localStorage.getItem(storageKey)) || 0;
            planEvalAndGoalSales += count * (prices.nursing[label] || 0);
        });
        getRow('eval').values[monthIdx] = planEvalAndGoalSales;

        // --- Nursing Care ---
        let nursingCareBaseSales = (nursingVisits.withoutCare * 1230) + (nursingVisits.withCare * 860);
        getRow('nursing').values[monthIdx] = nursingCareBaseSales;

        // --- Total ---
        getRow('total').values[monthIdx] = getRow('inpatient').values[monthIdx] + getRow('outpatient').values[monthIdx] + planEvalAndGoalSales + nursingCareBaseSales;
    }

    // Render HTML
    let html = '';
    rows.forEach(r => {
        let totalVal = r.values.reduce((sum, v) => sum + v, 0);
        
        html += `<tr class="${r.cls || ''}">
            <td>${r.label}</td>`;
        
        r.values.forEach(v => {
            html += `<td>${v > 0 ? v.toLocaleString() : '-'}</td>`;
        });
        
        html += `<td style="background-color:#f0f9ff; color:#0369a1; font-weight:700;">${totalVal > 0 ? totalVal.toLocaleString() : '-'}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}
