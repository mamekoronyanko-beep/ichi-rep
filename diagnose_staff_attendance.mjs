const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function check() {
    // Try inserting a test row then deleting it
    const testDate = '2099-01-01';
    
    // First, check if there's a table with these columns
    const url = `${SUPABASE_URL}/rest/v1/staff_attendance?attendance_date=eq.${testDate}&limit=1`;
    const res = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    console.log('staff_attendance table test:', res.status, JSON.stringify(data));

    // Try upsert with ignoreDuplicates: false  
    const upsertUrl = `${SUPABASE_URL}/rest/v1/staff_attendance`;
    const upsertRes = await fetch(upsertUrl, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([{ staff_id: 1, attendance_date: testDate, status: 'work' }])
    });
    const upsertData = await upsertRes.text();
    console.log('Upsert test status:', upsertRes.status, upsertData);
    
    // Cleanup
    const delUrl = `${SUPABASE_URL}/rest/v1/staff_attendance?attendance_date=eq.${testDate}`;
    await fetch(delUrl, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    console.log('Cleanup done.');
}

check().catch(console.error);
