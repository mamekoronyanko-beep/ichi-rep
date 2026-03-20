
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('reservations').select('*').limit(1);
    if (error) {
        console.error('Error fetching reservations:', error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns in reservations table:', Object.keys(data[0]));
    } else {
        console.log('No data in reservations table to infer columns.');
    }
}

checkSchema();
