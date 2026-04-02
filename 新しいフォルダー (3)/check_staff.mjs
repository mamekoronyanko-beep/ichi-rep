import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log("Fetching staff_attendance...");
    const { data, error } = await supabase.from('staff_attendance').select('*').order('attendance_date', { ascending: false }).limit(20);
    if (error) {
        console.error(error);
    } else {
        console.log(data);
    }
}
check();
