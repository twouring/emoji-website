import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../public/downloads/' + file, import.meta.url), 'utf8');
test('Windows and macOS printer-station installers embed bridge payload, create config and install auto-start', () => {
  const win = read('EmojiPOSPrinterStationSetup.ps1');
  assert.match(win, /Emoji POS Printer Station Installer \(Windows\)/);
  assert.match(win, /FromBase64String/); assert.match(win, /config\.json/); assert.match(win, /receipt-main/); assert.match(win, /Startup/); assert.match(win, /start-bridge\.cmd/);
  const mac = read('EmojiPOSPrinterStationInstaller.command');
  assert.match(mac, /Emoji POS Printer Station Installer \(macOS\)/);
  assert.match(mac, /base64 -D/); assert.match(mac, /config\.json/); assert.match(mac, /receipt-main/); assert.match(mac, /LaunchAgents/); assert.match(mac, /launchctl bootstrap/);
});
