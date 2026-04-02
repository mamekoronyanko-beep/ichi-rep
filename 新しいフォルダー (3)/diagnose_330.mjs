import { createClient } from '@supabase/supabase-client';

const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function diagnose() {
    const dateStr = '2026-03-30';
    console.log(`Diagnosing reservations for ${dateStr}...`);

    const { data: res, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('res_date', dateStr)
        .neq('patient_id', '_METRICS_');

    if (resError) {
        console.error('Error fetching reservations:', resError);
        return;
    }

    console.log(`Total records: ${res.length}`);

    const patientIds = [...new Set(res.map(r => r.patient_id).filter(id => id))];
    const { data: patients } = await supabase.from('patients').select('*').in('p_id', patientIds);
    const pMap = {};
    patients.forEach(p => pMap[p.p_id] = p);

    let outpatientPlannedCases = 0;
    let cancelCount = 0;

    res.forEach(r => {
        const isInpatient = r.is_inpatient_block === true;
        const isMeeting = r.is_meeting === true;
        
        if (r.status === 'canceled') {
            cancelCount++;
            return;
        }

        if (isMeeting) {
            // bypass
        } else if (isInpatient) {
            // bypass
        } else {
            const p = pMap[r.patient_id];
            if (p && (p.p_type === 'nursing_care' || p.p_nursing_care === true)) {
                // nursing
            } else {
                outpatientPlannedCases++;
                console.log(`Outpatient case: Time=${r.res_time}, ID=${r.patient_id}, Name=${r.patient_name}, Type=${r.res_type}`);
            }
        }
    });

    console.log(`\nFinal Outpatient Planned Cases (calculated): ${outpatientPlannedCases}`);
    console.log(`Cancel Count: ${cancelCount}`);
}

diagnose();
