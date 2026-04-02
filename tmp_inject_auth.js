const fs = require('fs');
const path = require('path');

const patientDbDir = 'c:\\Users\\user\\OneDrive\\デスクトップ\\Antigravity\\patient-db';
const reservationAppDir = 'c:\\Users\\user\\OneDrive\\デスクトップ\\Antigravity\\reservation-app';

const authScriptPatient = `\n    <script>\n        if (!sessionStorage.getItem('isLoggedIn')) {\n            window.location.href = 'login.html';\n        }\n    </script>`;
const authScriptRes = `\n    <script>\n        if (!sessionStorage.getItem('isLoggedIn')) {\n            window.location.href = '../patient-db/login.html';\n        }\n    </script>`;

// patient-db files
const patientFiles = fs.readdirSync(patientDbDir)
    .filter(f => f.endsWith('.html') && f !== 'login.html');

patientFiles.forEach(file => {
    const target = path.join(patientDbDir, file);
    let content = fs.readFileSync(target, 'utf8');
    if (!content.includes("sessionStorage.getItem('isLoggedIn')")) {
        content = content.replace('<head>', '<head>' + authScriptPatient);
        fs.writeFileSync(target, content, 'utf8');
        console.log('Injected auth into ' + file);
    }
});

// reservation-app/index.html
const resTarget = path.join(reservationAppDir, 'index.html');
let resContent = fs.readFileSync(resTarget, 'utf8');
if (!resContent.includes("sessionStorage.getItem('isLoggedIn')")) {
    resContent = resContent.replace('<head>', '<head>' + authScriptRes);
    fs.writeFileSync(resTarget, resContent, 'utf8');
    console.log('Injected auth into reservation-app/index.html');
}
