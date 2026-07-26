// Reference copy only — paste into script.google.com's Apps Script editor
// (via the bound Sheet's Extensions > Apps Script menu). Not run directly from this repo.
// Setup instructions: see gas/README.md

function doGet(e) {
  // Visiting the deployed URL in a browser sends GET — this just confirms
  // the deployment is live. Actual form submissions from index.html use doPost.
  return respond({ result: 'ok', message: 'Wedding GAS endpoint is running.' });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Honeypot: bots that fill every field get a fake success, no write happens.
    if (data.website) return respond({ result: 'success' });

    if (data.type === 'photo') return handlePhoto(data);
    if (data.type === 'message') return handleMessage(data);
    return respond({ result: 'error', message: 'unknown type' });
  } catch (err) {
    return respond({ result: 'error', message: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkRateLimit() {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('submit_count') || 0);
  if (count > 20) return false;
  cache.put('submit_count', count + 1, 60); // window resets every 60s
  return true;
}

function handlePhoto(data) {
  if (!checkRateLimit()) {
    return respond({ result: 'error', message: '少し時間をおいてお試しください' });
  }

  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const mime = (data.mimeType || '').startsWith('image/') ? data.mimeType : 'image/jpeg';
  const bytes = Utilities.base64Decode(data.data);
  const blob = Utilities.newBlob(bytes, mime, data.filename || ('guest-' + Date.now() + '.jpg'));
  const file = folder.createFile(blob);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Photos');
  sheet.appendRow([
    new Date(),
    (data.name || '').toString().slice(0, 50),
    (data.caption || '').toString().slice(0, 300),
    file.getUrl(),
    file.getId()
  ]);
  return respond({ result: 'success' });
}

function handleMessage(data) {
  if (!checkRateLimit()) {
    return respond({ result: 'error', message: '少し時間をおいてお試しください' });
  }

  const msg = (data.message || '').toString().slice(0, 500);
  if (!msg.trim()) return respond({ result: 'error', message: 'empty message' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Messages');
  sheet.appendRow([
    new Date(),
    (data.name || '').toString().slice(0, 50),
    msg
  ]);
  return respond({ result: 'success' });
}
