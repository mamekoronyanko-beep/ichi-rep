const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SERVICE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

// First let's try to verify the schema using REST API
async function tryCreateTable() {
    // Try to insert using the REST API to see what columns exist
    const url = `${SUPABASE_URL}/rest/v1/`;
    const res = await fetch(url, {
        headers: { 
            'apikey': SERVICE_KEY, 
            'Authorization': `Bearer ${SERVICE_KEY}` 
        }
    });
    const data = await res.json();
    console.log('Available tables:', JSON.stringify(data).substring(0, 500));
}

async function checkIfStaffSettingsExist() {
    const url = `${SUPABASE_URL}/rest/v1/staff_settings?limit=5`;
    const res = await fetch(url, {
        headers: { 
            'apikey': SERVICE_KEY, 
            'Authorization': `Bearer ${SERVICE_KEY}` 
        }
    });
    console.log('staff_settings status:', res.status);
    const data = await res.json();
    console.log('staff_settings sample:', JSON.stringify(data).substring(0, 500));
}

tryCreateTable();
checkIfStaffSettingsExist();
