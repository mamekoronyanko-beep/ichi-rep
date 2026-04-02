const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    const dateStr = '2026-04-01';
    console.log(`=== 4/1 外来単位数 診断 ===\n`);

    // Fetch reservations (excluding internal records)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations?res_date=eq.${dateStr}&patient_id=neq._METRICS_&patient_name=neq._staff_attendance_`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    console.log(`全予約レコード数: ${data.length}`);

    // Fetch patient info
    const patientIds = [...new Set(data.map(r => r.patient_id).filter(id => id && id !== 'INPATIENT'))];
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/patients?p_id=in.(${patientIds.join(',')})&select=p_id,p_type,p_nursing_care`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const pData = await pRes.json();
    const patientMap = {};
    if (Array.isArray(pData)) pData.forEach(p => patientMap[p.p_id] = p);

    const STATUS_FILTER = 'arrived'; // 実績は arrived のみ

    let outpatientPlanned = 0, outpatientActual = 0;
    let outpatientPlannedCases = 0, outpatientActualCases = 0;
    let nursingActual = 0, nursingActualCases = 0;

    const rows = [];

    data.forEach(r => {
        if (r.status === 'canceled') return;
        if (r.is_inpatient_block || r.is_meeting) return;

        const units = parseInt(r.units) || 1;
        const p = patientMap[r.patient_id];
        const isNursing = p && (p.p_type === 'nursing_care' || (p.p_type === 'admission' && p.p_nursing_care === true));

        if (isNursing) {
            if (r.status === 'arrived') { nursingActual += units; nursingActualCases++; }
        } else {
            outpatientPlanned += units;
            outpatientPlannedCases++;
            if (r.status === 'arrived') { outpatientActual += units; outpatientActualCases++; }
        }

        rows.push({
            time: r.res_time, name: r.patient_name, pid: r.patient_id,
            units, status: r.status, type: isNursing ? '介護' : '外来',
            pType: p ? p.p_type : '不明', nursingCare: p ? p.p_nursing_care : '不明'
        });
    });

    console.log('\n--- 外来予約一覧 ---');
    rows.filter(r => r.type === '外来').sort((a,b) => a.time.localeCompare(b.time)).forEach(r => {
        console.log(`  ${r.time} ${r.name} (${r.pid}) | ${r.units}単位 | ${r.status} | pType=${r.pType}`);
    });

    console.log('\n--- 集計結果 ---');
    console.log(`外来 計画: ${outpatientPlannedCases}件 ${outpatientPlanned}単位`);
    console.log(`外来 実績: ${outpatientActualCases}件 ${outpatientActual}単位`);
    console.log(`介護 実績: ${nursingActualCases}件 ${nursingActual}単位`);
}

diagnose().catch(console.error);
