import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function diagnose() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Fetching sample patient to check columns...');
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found in patients table:');
        console.log(Object.keys(data[0]).join(', '));
        console.log('Sample data:', data[0]);
    } else {
        console.log('No data found in patients table.');
    }
}

diagnose();
