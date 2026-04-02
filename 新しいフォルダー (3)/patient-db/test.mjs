import puppeteer from 'puppeteer';

(async () => {
    console.log('Starting puppeteer...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));

    console.log('Navigating...');
    await page.goto('http://localhost:8080/admission.html', { waitUntil: 'networkidle0' });

    console.log('Opening modal...');
    await page.click('button.btn.primary');

    console.log('Filling form...');
    await page.type('#patientId', 'P-9988');
    await page.type('#patientName', 'Testing Node');
    await page.select('#patientCategory', '運動器');
    await page.type('#diseaseName', 'Test Disease');
    await page.type('#diagnosisDate', '2026-03-22');

    console.log('Submitting form...');
    await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(e => console.log('Did not navigate! Good.'))
    ]);

    console.log('Done.');
    await browser.close();
})();
