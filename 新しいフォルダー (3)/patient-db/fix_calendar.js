const fs = require('fs');
const path = 'script.js';
let content = fs.readFileSync(path, 'utf8');

// 1. renderMeetingCalendar update
// Find the fetch and data processing block
const meetingSearch = /\.select\('p_name, next_reserve_date'\)\s*\.in\('p_type',\s*\['admission',\s*'nursing_care'\]\)/;
const meetingReplace = ".select('p_name, next_reserve_date')";

if (meetingSearch.test(content)) {
    content = content.replace(meetingSearch, meetingReplace);
} else {
    console.error('Meeting fetch block not found');
}

// Data processing logic for meeting
const meetingDateSearch = /if\s*\(p\.next_reserve_date\)\s*\{\s*const\s*d\s*=\s*p\.next_reserve_date;/;
const meetingDateReplace = "if (p.next_reserve_date && p.next_reserve_date.length >= 10) {\n                const d = p.next_reserve_date.substring(0, 10);";

if (meetingDateSearch.test(content)) {
    content = content.replace(meetingDateSearch, meetingDateReplace);
} else {
    console.error('Meeting date processing block not found');
}

// 2. renderDocSubmissionCalendar update
const docSearch = /\.select\('p_name, p_doc_submission_date'\)\s*\.in\('p_type',\s*\['admission',\s*'nursing_care'\]\)/;
const docReplace = ".select('p_name, p_doc_submission_date')";

if (docSearch.test(content)) {
    content = content.replace(docSearch, docReplace);
} else {
    console.error('Doc fetch block not found');
}

// Data processing logic for doc
const docDateSearch = /if\s*\(p\.p_doc_submission_date\)\s*\{\s*const\s*d\s*=\s*p\.p_doc_submission_date;/;
const docDateReplace = "if (p.p_doc_submission_date && p.p_doc_submission_date.length >= 10) {\n                const d = p.p_doc_submission_date.substring(0, 10);";

if (docDateSearch.test(content)) {
    content = content.replace(docDateSearch, docDateReplace);
} else {
    console.error('Doc date processing block not found');
}

fs.writeFileSync(path, content);
console.log('Successfully updated script.js');
