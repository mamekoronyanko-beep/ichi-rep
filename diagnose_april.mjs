const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    console.log(`Diagnosing statuses for April 2026...`);

    // Fetch all for April (assuming date format YYYY-MM-DD)
    const url = `${SUPABASE_URL}/rest/v1/reservations?res_date=gte.2026-04-01&res_date=lte.2026-04-30&patient_id=neq._METRICS_`;
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    const data = await response.json();
    console.log(`Total records in April: ${data.length}`);

    const arrived = data.filter(r => r.status === 'arrived');
    console.log(`Arrived records in April: ${arrived.length}`);
    arrived.forEach(r => {
        console.log(`  - ID=${r.id}, Date=${r.res_date}, Name=${r.patient_name}, Status=${r.status}`);
    });

    const statusCounts = {};
    data.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    console.log('Status Counts:', statusCounts);
}

diagnose();
