const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    const dateStr = '2026-03-30';
    console.log(`Diagnosing statuses for ${dateStr}...`);

    const url = `${SUPABASE_URL}/rest/v1/reservations?res_date=eq.${dateStr}&patient_id=neq._METRICS_`;
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    const data = await response.json();
    console.log(`Total records: ${data.length}`);

    const statusCounts = {};
    data.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    console.log('Status Counts:', statusCounts);

    const arrivedOutpatients = data.filter(r => r.status === 'arrived' && !r.is_inpatient_block && !r.is_meeting);
    console.log(`\nArrived Outpatients/Nursing: ${arrivedOutpatients.length}`);
    arrivedOutpatients.forEach(r => {
        console.log(`  - Time=${r.res_time}, Name=${r.patient_name}, Type=${r.res_type}`);
    });
    
    const bookedOutpatients = data.filter(r => r.status === 'booked' && !r.is_inpatient_block && !r.is_meeting);
    console.log(`\nBooked Outpatients/Nursing: ${bookedOutpatients.length}`);
}

diagnose();
