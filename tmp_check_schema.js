
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
    // Check patients table
    const { data: patients, error: pError } = await supabase.from('patients').select('*').limit(1);
    console.log('--- Patients Table Example Data ---');
    console.log(JSON.stringify(patients, null, 2));
    if (patients && patients.length > 0) {
        console.log('Columns:', Object.keys(patients[0]));
    }
}

checkSchema();
