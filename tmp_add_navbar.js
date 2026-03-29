const fs = require('fs');
const path = require('path');
const patientDbDir = 'c:\\Users\\user\\OneDrive\\デスクトップ\\Antigravity\\patient-db';
const reservationAppDir = 'c:\\Users\\user\\OneDrive\\デスクトップ\\Antigravity\\reservation-app';

const htmlFiles = fs.readdirSync(patientDbDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const target = path.join(patientDbDir, file);
    let content = fs.readFileSync(target, 'utf8');
    
    if (!content.includes('>実績表<')) {
        content = content.replace('<li><a href="../reservation-app/index.html">予約表</a></li>', 
            '<li><a href="../reservation-app/index.html">予約表</a></li>\n            <li><a href="performance.html">実績表</a></li>');
        fs.writeFileSync(target, content, 'utf8');
        console.log('Updated ' + file);
    }
});

const resTarget = path.join(reservationAppDir, 'index.html');
let resContent = fs.readFileSync(resTarget, 'utf8');
if (!resContent.includes('>実績表<')) {
    resContent = resContent.replace('<li><a href="index.html" class="active">予約表</a></li>', 
        '<li><a href="index.html" class="active">予約表</a></li>\n            <li><a href="../patient-db/performance.html">実績表</a></li>');
    fs.writeFileSync(resTarget, resContent, 'utf8');
    console.log('Updated reservation-app/index.html');
}
