// --- Supabase Configuration ---
const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
let supabaseClient;

let currentYear = new Date().getFullYear();
let patientCategoryMap = {};
let patientNursingCareMap = {};
let allReservations = [];

// monthlyData stores computed results for current year
// monthlyData[0..11] = { inpatient, outpatient, eval, nursing, total }
let monthlyData = [];

// Chart instances (kept so they can be destroyed on re-open)
let chartTrend = null, chartComp = null, chartYoY = null;

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    document.getElementById('current-year-display').textContent = `${currentYear}年`;

    document.getElementById('prev-year').addEventListener('click', () => changeYear(-1));
    document.getElementById('next-year').addEventListener('click', () => changeYear(1));
    document.getElementById('refresh-btn').addEventListener('click', () => loadYearData());
    document.getElementById('perf-csv-import').addEventListener('change', handleExcelImport);
    document.getElementById('analysis-btn').addEventListener('click', openAnalysisModal);
    document.getElementById('close-analysis-modal').addEventListener('click', closeAnalysisModal);

    // Close on overlay click
    document.getElementById('analysis-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('analysis-modal-overlay')) closeAnalysisModal();
    });

    // Tab switching
    document.querySelectorAll('.analysis-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(`tab-${btn.dataset.tab}`);
            if (panel) panel.classList.add('active');
            renderActiveChart(btn.dataset.tab);
        });
    });

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

    const { data: resData } = await supabaseClient
        .from('reservations')
        .select('id, patient_id, res_date, units, status, is_meeting, is_inpatient_block')
        .gte('res_date', `${currentYear}-01-01`)
        .lte('res_date', `${currentYear}-12-31`);

    allReservations = resData || [];
    renderTable();
}

function getPrices(year, month) {
    const isOld = (year < 2026) || (year === 2026 && month < 6);
    return isOld ? {
        in_locomotor: 1850, in_locomotor_deduction: 1110,
        in_cerebro: 2000,   in_cerebro_deduction: 1200,
        in_disuse: 1460,    in_disuse_deduction: 880,
        out_locomotor: 1850, out_cerebro: 2000, out_anti: 350, out_other: 2000,
        re_exam: 385,
        nursing: { '計画評価1':3000,'計画評価1(初回)':3000,'計画評価1(2回目以降)':3000,'計画評価2':2400,'計画評価2(初回)':2400,'計画評価2(2回目以降)':2400,'目標1':2500,'目標2':1000 }
    } : {
        in_locomotor: 1850, in_locomotor_deduction: 1680,
        in_cerebro: 2000,   in_cerebro_deduction: 1800,
        in_disuse: 1460,    in_disuse_deduction: 1320,
        out_locomotor: 1850, out_cerebro: 2000, out_anti: 350, out_other: 2000,
        re_exam: 410,
        nursing: { '計画評価1':3000,'計画評価1(初回)':3000,'計画評価1(2回目以降)':3000,'計画評価2':2400,'計画評価2(初回)':2400,'計画評価2(2回目以降)':2400,'目標1':2500,'目標2':1000 }
    };
}

function computeMonthSales(month) {
    const prices = getPrices(currentYear, month);
    let inpatient = 0, inLoco = 0, inCereb = 0, inDisuse = 0;
    let outpatient = 0, outLoco = 0, outCereb = 0, outAnti = 0;
    let evalGoal = 0, nursing = 0;

    // Inpatient from localStorage
    ['locomotor','cerebro','disuse'].forEach(cat => {
        let total = 0, ded = 0;
        const last = new Date(currentYear, month, 0).getDate();
        for (let d = 1; d <= last; d++) {
            const ds = `${currentYear}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            total += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${ds}`)) || 0;
            ded   += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${ds}`)) || 0;
        }
        let v = 0;
        if (cat === 'locomotor') { v = (total-ded)*prices.in_locomotor + ded*prices.in_locomotor_deduction; inLoco = v; }
        else if (cat === 'cerebro') { v = (total-ded)*prices.in_cerebro + ded*prices.in_cerebro_deduction; inCereb = v; }
        else { v = (total-ded)*prices.in_disuse + ded*prices.in_disuse_deduction; inDisuse = v; }
        inpatient += v;
    });

    // Outpatient from reservations
    const nursingVisits = { withCare: 0, withoutCare: 0 };
    allReservations.filter(r => {
        if (r.status === 'canceled') return false;
        return new Date(r.res_date).getMonth() + 1 === month;
    }).forEach(res => {
        const units = parseInt(res.units) || 1;
        const cat = patientCategoryMap[res.patient_id] || 'その他';
        if (res.is_meeting) {
            if (patientNursingCareMap[res.patient_id]) nursingVisits.withCare++;
            else nursingVisits.withoutCare++;
            return;
        }
        if (res.is_inpatient_block) return;
        if (cat === '運動器') { const v=units*prices.out_locomotor+prices.re_exam; outLoco+=v; outpatient+=v; }
        else if (cat === '脳血管') { const v=units*prices.out_cerebro+prices.re_exam; outCereb+=v; outpatient+=v; }
        else if (cat === '消炎') { const v=units*prices.out_anti+prices.re_exam; outAnti+=v; outpatient+=v; }
        else { const v=units*prices.out_other; outpatient+=v; }
    });

    // Eval/Goal from localStorage
    ['計画評価1','計画評価1(初回)','計画評価1(2回目以降)','計画評価2','計画評価2(初回)','計画評価2(2回目以降)','目標1','目標2'].forEach(lbl => {
        const cnt = parseInt(localStorage.getItem(`manual_nursing_${currentYear}_${month-1}_${lbl}`)) || 0;
        evalGoal += cnt * (prices.nursing[lbl] || 0);
    });

    // Nursing
    nursing = nursingVisits.withoutCare * 1230 + nursingVisits.withCare * 860;

    return { inpatient, inLoco, inCereb, inDisuse, outpatient, outLoco, outCereb, outAnti, evalGoal, nursing,
             total: inpatient + outpatient + evalGoal + nursing };
}

function renderTable() {
    monthlyData = [];
    const importedStorage = localStorage.getItem(`perf_import_${currentYear}`);
    const importedData = importedStorage ? JSON.parse(importedStorage) : null;

    for (let m = 1; m <= 12; m++) {
        if (importedData && importedData[m] && Object.keys(importedData[m]).length > 0) {
            monthlyData.push({ ...importedData[m], isImported: true });
        } else {
            monthlyData.push(computeMonthSales(m));
        }
    }

    const rows = [
        { label:'🏥 入院売上',          cls:'section-header', key:'inpatient' },
        { label:'└ 運動器',            cls:'row-sub',        key:'inLoco' },
        { label:'└ 脳血管',            cls:'row-sub',        key:'inCereb' },
        { label:'└ 廃用症候群',        cls:'row-sub',        key:'inDisuse' },
        { label:'👤 外来売上 (再診料込)', cls:'section-header', key:'outpatient' },
        { label:'└ 運動器',            cls:'row-sub',        key:'outLoco' },
        { label:'└ 脳血管',            cls:'row-sub',        key:'outCereb' },
        { label:'└ 消炎',             cls:'row-sub',        key:'outAnti' },
        { label:'📝 評価・目標 (入外合算)', cls:'section-header', key:'evalGoal' },
        { label:'🏢 介護医療院',       cls:'section-header', key:'nursing' },
        { label:'💰 総合計売上',        cls:'total-row',      key:'total' },
    ];

    let html = '';
    rows.forEach(r => {
        const vals = monthlyData.map(m => m[r.key]);
        const yearTotal = vals.reduce((a,b)=>a+b,0);
        html += `<tr class="${r.cls || ''}"><td>${r.label}</td>`;
        vals.forEach((v, idx) => {
            const isImported = monthlyData[idx].isImported;
            const cls = (isImported && v !== undefined && r.key !== 'total') ? 'color: #d97706 !important; font-weight: 700;' : '';
            html += `<td style="${cls}">${v > 0 ? v.toLocaleString() : '-'}</td>`;
        });
        html += `<td style="background:#f0f9ff;color:#0369a1;font-weight:700;">${yearTotal>0?yearTotal.toLocaleString():'-'}</td></tr>`;
    });

    document.getElementById('perf-table-body').innerHTML = html;
}

async function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const targetYear = prompt(`インポートするデータの「対象年（西暦）」を入力してください。\n例: ${currentYear - 1}`);
    if (!targetYear || isNaN(targetYear)) {
        alert("有効な年が入力されなかったため、インポートを中止しました。");
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            const importedData = {};
            for (let m = 1; m <= 12; m++) importedData[m] = {};

            let currentContext = ''; 

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row[0]) continue;
                const label = String(row[0]).trim();

                if (label.includes('入院')) currentContext = 'in';
                else if (label.includes('外来')) currentContext = 'out';

                let key = null;
                if (label.includes('入院売上')) key = 'inpatient';
                else if (label.includes('外来売上')) key = 'outpatient';
                else if (label.includes('評価・目標')) key = 'evalGoal';
                else if (label.includes('介護医療院')) key = 'nursing';
                else if (label.includes('総合計売上') || label.includes('合計売上')) key = 'total';
                else if (label.includes('運動器')) key = currentContext === 'in' ? 'inLoco' : 'outLoco';
                else if (label.includes('脳血管')) key = currentContext === 'in' ? 'inCereb' : 'outCereb';
                else if (label.includes('廃用')) key = 'inDisuse';
                else if (label.includes('消炎')) key = 'outAnti';

                if (key) {
                    for (let m = 1; m <= 12; m++) {
                        const val = parseFloat(row[m]) || 0;
                        importedData[m][key] = val;
                    }
                }
            }

            localStorage.setItem(`perf_import_${targetYear}`, JSON.stringify(importedData));
            alert(`${targetYear}年の実績データをインポートしました！`);
            if (parseInt(targetYear) === currentYear) {
                loadYearData();
            } else {
                currentYear = parseInt(targetYear);
                document.getElementById('current-year-display').textContent = `${currentYear}年`;
                loadYearData();
            }
        } catch (err) {
            console.error(err);
            alert("Excelファイルの読み込みに失敗しました。フォーマットをご確認ください。");
        }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ===== Analysis Modal =====
function openAnalysisModal() {
    document.getElementById('analysis-year-title').textContent = `${currentYear}年`;
    document.getElementById('analysis-modal-overlay').classList.add('open');

    // reset to first tab
    document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="trend"]').classList.add('active');
    document.getElementById('tab-trend').classList.add('active');

    renderActiveChart('trend');
}

function closeAnalysisModal() {
    document.getElementById('analysis-modal-overlay').classList.remove('open');
}

function renderActiveChart(tab) {
    if (tab === 'trend') renderTrendChart();
    else if (tab === 'composition') renderCompositionChart();
    else if (tab === 'yoy') renderYoYChart();
    else if (tab === 'summary') renderSummaryTab();
}

function renderTrendChart() {
    const ctx = document.getElementById('chart-trend').getContext('2d');
    if (chartTrend) chartTrend.destroy();
    chartTrend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                {
                    label: '入院',
                    data: monthlyData.map(m => m.inpatient),
                    backgroundColor: 'rgba(59,130,246,0.8)',
                    stack: 's'
                },
                {
                    label: '外来',
                    data: monthlyData.map(m => m.outpatient),
                    backgroundColor: 'rgba(16,185,129,0.8)',
                    stack: 's'
                },
                {
                    label: '評価・目標',
                    data: monthlyData.map(m => m.evalGoal),
                    backgroundColor: 'rgba(251,191,36,0.8)',
                    stack: 's'
                },
                {
                    label: '介護医療院',
                    data: monthlyData.map(m => m.nursing),
                    backgroundColor: 'rgba(168,85,247,0.8)',
                    stack: 's'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
                label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} 円`
            }}},
            scales: {
                y: { ticks: { callback: v => `${(v/10000).toFixed(0)}万` }, stacked: true },
                x: { stacked: true }
            }
        }
    });
}

function renderCompositionChart() {
    const ctx = document.getElementById('chart-composition').getContext('2d');
    if (chartComp) chartComp.destroy();

    const cats = ['入院', '外来', '評価・目標', '介護医療院'];
    const totals = [
        monthlyData.reduce((a,m)=>a+m.inpatient,0),
        monthlyData.reduce((a,m)=>a+m.outpatient,0),
        monthlyData.reduce((a,m)=>a+m.evalGoal,0),
        monthlyData.reduce((a,m)=>a+m.nursing,0)
    ];
    const colors = ['#3b82f6','#10b981','#fbbf24','#a855f7'];
    const grandTotal = totals.reduce((a,b)=>a+b,0);

    chartComp = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: cats, datasets: [{ data: totals, backgroundColor: colors, borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: {
                label: ctx => `${ctx.label}: ${ctx.raw.toLocaleString()} 円 (${grandTotal>0?(ctx.raw/grandTotal*100).toFixed(1):'0'}%)`
            }}}
        }
    });

    const legend = document.getElementById('composition-legend');
    legend.innerHTML = cats.map((cat, i) => {
        const pct = grandTotal > 0 ? (totals[i]/grandTotal*100).toFixed(1) : 0;
        return `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
            <div style="width:14px;height:14px;border-radius:3px;background:${colors[i]};flex-shrink:0;"></div>
            <div>
                <div style="font-weight:600;color:#1e293b;">${cat}</div>
                <div style="font-size:0.82rem;color:#64748b;">${totals[i].toLocaleString()} 円 (${pct}%)</div>
            </div>
        </div>`;
    }).join('');
}

async function renderYoYChart() {
    const ctx = document.getElementById('chart-yoy').getContext('2d');
    if (chartYoY) chartYoY.destroy();

    // Previous year totals from localStorage (inpatient) + a separate query for reservations
    const prevYear = currentYear - 1;
    const prevMonths = [];
    for (let m = 1; m <= 12; m++) {
        const prices = getPrices(prevYear, m);
        let total = 0;
        ['locomotor','cerebro','disuse'].forEach(cat => {
            let tu = 0, du = 0;
            const last = new Date(prevYear, m, 0).getDate();
            for (let d=1; d<=last; d++) {
                const ds=`${prevYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                tu += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_units_${ds}`)) || 0;
                du += parseFloat(localStorage.getItem(`manual_inpatient_${cat}_deduction_units_${ds}`)) || 0;
            }
            if (cat==='locomotor') total += (tu-du)*prices.in_locomotor + du*prices.in_locomotor_deduction;
            else if (cat==='cerebro') total += (tu-du)*prices.in_cerebro + du*prices.in_cerebro_deduction;
            else total += (tu-du)*prices.in_disuse + du*prices.in_disuse_deduction;
        });
        // Nursing eval
        ['計画評価1','計画評価1(初回)','計画評価1(2回目以降)','計画評価2','計画評価2(初回)','計画評価2(2回目以降)','目標1','目標2'].forEach(lbl => {
            const cnt = parseInt(localStorage.getItem(`manual_nursing_${prevYear}_${m-1}_${lbl}`)) || 0;
            total += cnt * (prices.nursing[lbl] || 0);
        });
        prevMonths.push(total);
    }

    chartYoY = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                { label: `${prevYear}年`, data: prevMonths, backgroundColor: 'rgba(148,163,184,0.7)', borderRadius: 4 },
                { label: `${currentYear}年`, data: monthlyData.map(m=>m.total), backgroundColor: 'rgba(99,102,241,0.8)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
                label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} 円`
            }}},
            scales: { y: { ticks: { callback: v => `${(v/10000).toFixed(0)}万` } } }
        }
    });
}

function renderSummaryTab() {
    const totals = monthlyData.map(m => m.total);
    const nonZero = totals.filter(v => v > 0);
    const maxVal = totals.length ? Math.max(...totals) : 0;
    const minVal = nonZero.length ? Math.min(...nonZero) : 0;
    const maxIdx = totals.indexOf(maxVal);
    const minIdx = totals.indexOf(minVal);
    const avg = nonZero.length ? Math.round(nonZero.reduce((a,b)=>a+b,0) / nonZero.length) : 0;
    const yearTotal = totals.reduce((a,b)=>a+b,0);
    const nowMonth = new Date().getFullYear() === currentYear ? new Date().getMonth() + 1 : 12;
    const monthsPassed = nowMonth;
    const projected = monthsPassed > 0 ? Math.round(yearTotal / monthsPassed * 12) : 0;

    document.getElementById('summary-grid').innerHTML = `
        <div class="summary-card highlight">
            <div class="label">💰 年間売上合計</div>
            <div class="value">${yearTotal.toLocaleString()} 円</div>
            <div class="sub">月平均 ${avg.toLocaleString()} 円</div>
        </div>
        <div class="summary-card highlight">
            <div class="label">📈 年間売上予測</div>
            <div class="value">${projected.toLocaleString()} 円</div>
            <div class="sub">${monthsPassed}ヶ月分のペースを元に算出</div>
        </div>
        <div class="summary-card">
            <div class="label">🔝 最高売上月</div>
            <div class="value">${maxIdx >= 0 ? MONTHS[maxIdx] : '—'}</div>
            <div class="sub">${maxVal.toLocaleString()} 円</div>
        </div>
        <div class="summary-card">
            <div class="label">🔻 最低売上月</div>
            <div class="value">${minIdx >= 0 ? MONTHS[minIdx] : '—'}</div>
            <div class="sub">${minVal.toLocaleString()} 円</div>
        </div>
    `;

    let rows = '';
    monthlyData.forEach((m, i) => {
        const prev = i > 0 ? monthlyData[i-1].total : null;
        let badge = '';
        if (prev !== null && m.total > 0) {
            const diff = m.total - prev;
            const pct = prev > 0 ? (diff/prev*100).toFixed(1) : '—';
            if (diff > 0) badge = `<span class="badge badge-blue">▲ ${pct !== '—' ? pct+'%' : '増'}</span>`;
            else if (diff < 0) badge = `<span class="badge badge-red">▼ ${pct !== '—' ? Math.abs(pct)+'%' : '減'}</span>`;
            else badge = `<span class="badge" style="background:#f1f5f9;color:#64748b;">→ 横ばい</span>`;
        }
        rows += `<tr>
            <td><strong>${MONTHS[i]}</strong></td>
            <td>${m.inpatient > 0 ? m.inpatient.toLocaleString() : '-'}</td>
            <td>${m.outpatient > 0 ? m.outpatient.toLocaleString() : '-'}</td>
            <td>${m.evalGoal > 0 ? m.evalGoal.toLocaleString() : '-'}</td>
            <td>${m.nursing > 0 ? m.nursing.toLocaleString() : '-'}</td>
            <td style="font-weight:700;color:${m.total > 0 ? '#1e40af' : '#94a3b8'};">${m.total > 0 ? m.total.toLocaleString() : '-'}</td>
            <td>${badge}</td>
        </tr>`;
    });
    document.getElementById('detail-table-body').innerHTML = rows;
}
