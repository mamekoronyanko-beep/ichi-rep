const SUPABASE_URL = 'https://dhazmbhvztzbrzyyiojw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lVw1SMjIgL4m9KovI09CKg_hl0WycWS';

async function cleanup() {
    const idsToDelete = [
        '5b48a450-c6c0-46c5-9825-839269ddf22d', // booked record at 16:00
        '462263a3-fdfd-41ed-ba95-2c91871081e7'  // booked record at 14:00
    ];

    console.log(`Cleaning up ${idsToDelete.length} duplicate records...`);

    for (const id of idsToDelete) {
        const url = `${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal'
            }
        });

        if (response.ok) {
            console.log(`Deleted ID: ${id}`);
        } else {
            console.error(`Failed to delete ID: ${id}`, await response.text());
        }
    }
    console.log('Cleanup finished.');
}

cleanup();
