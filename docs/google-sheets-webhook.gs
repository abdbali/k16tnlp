// Boş bırakılırsa Apps Script'in bağlı olduğu dosyadaki aktif/ilk sekmeye yazar.
// Belirli bir sekmeye yazmak isterseniz örn. 'DegerlendirmeKayitlari' yazın.
const SHEET_NAME = '';
const STUDENT_ID_PREFIX = 'Öğrenci_';
const FIRST_STUDENT_NUMBER = 100;

const HEADERS = [
  'timestamp',
  'respondentId',
  'clientId',
  'ipAddress',
  'userAgent',
  'answer',
  'mlScore',
  'mlConfidence',
  'mlReason',
  'mlMatchedRules',
  'feedback',
  'finalScore',
];

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTargetSheet(spreadsheet);

  ensureHeaders(sheet);
  payload.respondentId = findOrCreateRespondentId(sheet, payload);
  sheet.appendRow(HEADERS.map((header) => payload[header] ?? ''));

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, respondentId: payload.respondentId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTargetSheet(spreadsheet) {
  if (SHEET_NAME) {
    return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  }

  return spreadsheet.getActiveSheet() || spreadsheet.getSheets()[0];
}

function ensureHeaders(sheet) {
  const existingHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];

  const hasExactHeaders = HEADERS.every((header, index) => existingHeaders[index] === header);
  if (!hasExactHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function findOrCreateRespondentId(sheet, payload) {
  const rows = getDataRows(sheet);
  const existingId = findExistingRespondentId(rows, payload);
  if (existingId) return existingId;

  return `${STUDENT_ID_PREFIX}${getNextStudentNumber(rows)}`;
}

function getDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function findExistingRespondentId(rows, payload) {
  const respondentIdIndex = HEADERS.indexOf('respondentId');
  const clientIdIndex = HEADERS.indexOf('clientId');
  const ipAddressIndex = HEADERS.indexOf('ipAddress');
  const userAgentIndex = HEADERS.indexOf('userAgent');

  for (const row of rows) {
    const respondentId = row[respondentIdIndex];
    if (!respondentId) continue;

    if (payload.clientId && row[clientIdIndex] === payload.clientId) {
      return respondentId;
    }

    const sameIp = payload.ipAddress && row[ipAddressIndex] === payload.ipAddress;
    const sameUserAgent = payload.userAgent && row[userAgentIndex] === payload.userAgent;
    if (!payload.clientId && sameIp && sameUserAgent) {
      return respondentId;
    }
  }

  return '';
}

function getNextStudentNumber(rows) {
  const respondentIdIndex = HEADERS.indexOf('respondentId');
  let maxNumber = FIRST_STUDENT_NUMBER - 1;
  const pattern = new RegExp(`^${STUDENT_ID_PREFIX}(\\d+)$`);

  for (const row of rows) {
    const match = String(row[respondentIdIndex] || '').match(pattern);
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  }

  return maxNumber + 1;
}
