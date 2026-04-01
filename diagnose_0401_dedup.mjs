const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    const dateStr = '2026-04-01';
    console.log(`=== 4/1 スロット重複排除 詳細診断 ===\n`);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations?res_date=eq.${dateStr}&patient_id=neq._METRICS_&patient_name=neq._staff_attendance_`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    console.log(`全レコード数: ${data.length}`);

    // 重複排除シミュレーション
    const deduplicatedMap = {};
    data.forEach(r => {
        const key = `${r.res_time}_${r.res_type}_${r.res_index}`;
        const existing = deduplicatedMap[key];
        if (!existing) {
            deduplicatedMap[key] = r;
        } else {
            const priority = (s) => (s === 'arrived' ? 3 : s === 'booked' ? 2 : 1);
            if (priority(r.status) > priority(existing.status)) {
                console.log(`DEDUP: ${key} -> 優先: ${r.patient_name} (${r.status}) over ${existing.patient_name} (${existing.status})`);
                deduplicatedMap[key] = r;
            } else {
                console.log(`DEDUP: ${key} -> 除外: ${r.patient_name} (${r.status}) kept: ${existing.patient_name} (${existing.status})`);
            }
        }
    });

    const deduped = Object.values(deduplicatedMap);
    console.log(`\n重複排除後のレコード数: ${deduped.length}`);

    // 外来実績を再集計
    const outpatient = deduped.filter(r =>
        r.status === 'arrived' &&
        !r.is_inpatient_block &&
        !r.is_meeting
    );

    console.log(`\n外来 arrived 件数: ${outpatient.length}`);
    console.log(`外来 arrived 単位合計: ${outpatient.reduce((sum, r) => sum + (parseInt(r.units) || 1), 0)}`);

    // res_type の内訳
    const typeSummary = {};
    outpatient.forEach(r => {
        typeSummary[r.res_type] = (typeSummary[r.res_type] || 0) + 1;
    });
    console.log('\nres_type 内訳:', typeSummary);

    // 詳細リスト
    console.log('\n--- 全外来arrived一覧 ---');
    outpatient.sort((a,b) => a.res_time.localeCompare(b.res_time)).forEach(r => {
        console.log(`  ${r.res_time} [${r.res_type}:${r.res_index}] ${r.patient_name} (${r.patient_id || '空'}) | ${r.units ?? '未'}単位`);
    });
}

diagnose().catch(console.error);
