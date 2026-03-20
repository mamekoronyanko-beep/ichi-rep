import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jixzrqmscvghntvppvbi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function checkData() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: patients, error } = await supabase
        .from('patients')
        .select('p_id, p_name, p_type, next_reserve_date, p_doc_submission_date');

    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Patient Data Samples ---');
    patients.slice(0, 10).forEach(p => {
        console.log(`ID: ${p.p_id}, Name: ${p.p_name}, Type: ${p.p_type}`);
        console.log(`  Next Reserve: [${p.next_reserve_date}]`);
        console.log(`  Doc Subm: [${p.p_doc_submission_date}]`);
    });
}

checkData();
