const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    const dateStr = '2026-03-30';
    console.log(`Diagnosing reservations for ${dateStr}...`);

    const url = `${SUPABASE_URL}/rest/v1/reservations?res_date=eq.${dateStr}&patient_id=neq._METRICS_`;
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    const data = await response.json();
    console.log(`Total records (excl metrics): ${data.length}`);

    const counts = {};
    data.forEach(r => {
        if (r.status === 'canceled') return;
        const key = `${r.res_time}|${r.res_type}|${r.res_index}`;
        if (!counts[key]) counts[key] = [];
        counts[key].push(r);
    });

    let duplicatesFound = false;
    for (const key in counts) {
        if (counts[key].length > 1) {
            duplicatesFound = true;
            console.log(`DUPLICATE FOUND at ${key}:`);
            counts[key].forEach(r => {
                console.log(`  - ID=${r.id}, Patient=${r.patient_name}, Status=${r.status}`);
            });
        }
    }

    if (!duplicatesFound) {
        console.log("No non-canceled duplicates found for identical slots.");
    }

    // Check for "Unknown" patients (no p_id)
    const unknownPatients = data.filter(r => !r.patient_id && r.status !== 'canceled');
    console.log(`\nRecords with no patient_id: ${unknownPatients.length}`);
    unknownPatients.forEach(r => {
        console.log(`  - ID=${r.id}, Time=${r.res_time}, Name=${r.patient_name}`);
    });
}

diagnose();
