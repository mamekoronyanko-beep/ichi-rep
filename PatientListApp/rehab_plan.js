// rehab_plan.js - Functionality for 2026 Rehab Plan

document.addEventListener('DOMContentLoaded', () => {
    initFimTable();
    setupEventListeners();
});

const fimItems = [
    { id: 'eat', name: '食事', type: 'motor' },
    { id: 'groom', name: '整容', type: 'motor' },
    { id: 'bathe', name: '清拭', type: 'motor' },
    { id: 'dress_up', name: '更衣上半身', type: 'motor' },
    { id: 'dress_down', name: '更衣下半身', type: 'motor' },
    { id: 'toilet', name: 'トイレ動作', type: 'motor' },
    { id: 'bladder', name: '排尿管理', type: 'motor' },
    { id: 'bowel', name: '排便管理', type: 'motor' },
    { id: 'trans_bed', name: 'ベッド移乗', type: 'motor' },
    { id: 'trans_toilet', name: 'トイレ移乗', type: 'motor' },
    { id: 'trans_tub', name: '浴槽移乗', type: 'motor' },
    { id: 'walk', name: '歩行/車椅子', type: 'motor' },
    { id: 'stairs', name: '階段', type: 'motor' },
    { id: 'comp', name: '理解', type: 'cog' },
    { id: 'expr', name: '表出', type: 'cog' },
    { id: 'soc', name: '社会的交流', type: 'cog' },
    { id: 'prob', name: '問題解決', type: 'cog' },
    { id: 'mem', name: '記憶', type: 'cog' }
];

function initFimTable() {
    const tbody = document.getElementById('fimBody');
    fimItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        // Category Label
        if (index === 0) {
            tr.innerHTML += `<th rowspan="13">運動</th>`;
        } else if (index === 13) {
            tr.innerHTML += `<th rowspan="5">認知</th>`;
        } // Skip rendering first cell for other rows
        
        tr.innerHTML += `<td class="item-name">${item.name}</td>`;
        
        // Radio buttons 1-7
        for(let i=1; i<=7; i++) {
            tr.innerHTML += `<td><input type="radio" name="fim_${item.id}" value="${i}" class="fim-radio" data-type="${item.type}"></td>`;
        }
        
        // Score display
        tr.innerHTML += `<td id="score_${item.id}" class="score-cell">-</td>`;
        tbody.appendChild(tr);
    });

    // Add listeners to radios
    document.querySelectorAll('.fim-radio').forEach(radio => {
        radio.addEventListener('change', calculateFimTotal);
    });
}

function calculateFimTotal() {
    let motorTotal = 0;
    let cogTotal = 0;
    
    fimItems.forEach(item => {
        const selected = document.querySelector(`input[name="fim_${item.id}"]:checked`);
        const scoreCell = document.getElementById(`score_${item.id}`);
        if(selected) {
            const val = parseInt(selected.value);
            scoreCell.textContent = val;
            if(item.type === 'motor') motorTotal += val;
            else cogTotal += val;
        } else {
            scoreCell.textContent = '-';
        }
    });

    document.getElementById('fimMotorTotal').textContent = motorTotal || 0;
    document.getElementById('fimCognitiveTotal').textContent = cogTotal || 0;
    document.getElementById('fimTotal').textContent = (motorTotal + cogTotal) || 0;
}

function setupEventListeners() {
    // Print Button
    document.getElementById('printBtn').addEventListener('click', () => {
        window.print();
    });

    // Quick Goal Select
    document.getElementById('longGoalSelect').addEventListener('change', (e) => {
        if(e.target.value) {
            const txt = document.getElementById('longGoal');
            txt.value = txt.value ? txt.value + '\n' + e.target.value : e.target.value;
            e.target.value = ""; // Reset
        }
    });

    // Auto Fill For Demo
    document.getElementById('autoFillBtn').addEventListener('click', () => {
        document.getElementById('patientName').value = "山田 太郎";
        document.getElementById('patientKana').value = "ヤマダ タロウ";
        document.querySelector('input[name="gender"][value="男"]').checked = true;
        document.getElementById('birthDate').value = "1950-05-12";
        calculateAge();
        document.getElementById('wardRoom').value = "3病棟 302号室";
        document.getElementById('onsetSurgeDate').value = "2026-03-01";
        document.getElementById('diseaseName').value = "右被殻出血";
        document.getElementById('creationDate').value = new Date().toISOString().split('T')[0];
        
        // Random FIM
        document.querySelectorAll('.fim-radio').forEach(radio => {
            if(radio.value === "4" && Math.random() > 0.5 || radio.value === "5") {
                radio.checked = true;
            }
        });
        calculateFimTotal();
    });

    // Age Auto Calculate
    document.getElementById('birthDate').addEventListener('change', calculateAge);
}

function calculateAge() {
    const birthInput = document.getElementById('birthDate').value;
    if(!birthInput) return;
    const birth = new Date(birthInput);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    document.getElementById('ageDisplay').textContent = age;
}
