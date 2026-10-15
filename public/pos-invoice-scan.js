/* Shared invoice lookup scanner. Does not change orders or void invoices. */
(function (global) {
  'use strict';
  function parse(raw) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (/^[A-Z]{2}\d{8}$/.test(text)) return text;
    // Accept the requested 3-digit period and the full 5-digit ROC year/month period.
    const barcode = /^\d{3}(?:\d{2})?([A-Z]{2}\d{8})\d{4}$/.exec(text);
    if (barcode) return barcode[1];
    // Taiwan left QR: invoice, ROC date, random code, hex amounts, tax IDs, encrypted signature.
    const qr = /^([A-Z]{2}\d{8})(\d{3})(\d{2})(\d{2})\d{4}[\dA-Fa-f]{16}\d{16}[A-Za-z\d+/=]{24}(?::[^\r\n]*)?$/.exec(text);
    if (!qr) return null;
    const year = Number(qr[2]) + 1911, month = Number(qr[3]), day = Number(qr[4]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? qr[1] : null;
  }
  let activeClose = null;
  // Resolves immediately with { close, ready }; ready settles after camera setup.
  async function open({ onScan, onClose } = {}) {
    activeClose?.();
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '掃描發票查詢訂單');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;color:#111;padding:24px;border-radius:12px;width:min(480px,100%);max-height:90vh;overflow:auto';
    const title = document.createElement('h2');
    title.textContent = '掃描發票查詢訂單';
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.hidden = true;
    video.style.cssText = 'width:100%;max-height:40vh;object-fit:contain';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = '此瀏覽器不支援相機掃碼，請使用掃描槍或輸入發票號碼後按 Enter。';
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', '發票號碼或掃描內容');
    input.placeholder = 'AB12345678／掃描槍直接掃描';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText = 'width:100%;box-sizing:border-box;font-size:18px;padding:12px';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '查詢訂單';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '關閉';
    form.append(input, submit);
    panel.append(title, video, status, form, cancel);
    overlay.append(panel);
    document.body.append(overlay);
    let closed = false, stream = null, timer = null;
    function stopCamera() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      video.hidden = true;
    }
    function close() {
      if (closed) return;
      closed = true;
      stopCamera();
      document.removeEventListener('keydown', keydown);
      global.removeEventListener?.('pagehide', close);
      if (activeClose === close) activeClose = null;
      overlay.remove();
      previous?.focus();
      onClose?.();
    }
    function accept(raw) {
      if (closed) return;
      const invoice = parse(raw);
      if (!invoice) {
        status.textContent = '無法辨識發票，請掃描發票一維條碼、左側 QR Code，或輸入兩碼大寫英文＋八碼數字。';
        input.select();
        return;
      }
      close();
      onScan?.(invoice);
    }
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }
    activeClose = close;
    document.addEventListener('keydown', keydown);
    global.addEventListener?.('pagehide', close);
    form.addEventListener('submit', event => { event.preventDefault(); accept(input.value); });
    cancel.addEventListener('click', close);
    input.focus();
    const ready = (async () => {
      if (!navigator.mediaDevices?.getUserMedia || (!global.BarcodeDetector && !global.ZXingWASM?.readBarcodes)) return;
      status.textContent = '正在開啟相機…';
      try {
        let detector;
        if (global.BarcodeDetector) detector = new global.BarcodeDetector({ formats: ['code_39', 'qr_code'] });
        else {
          const zx = global.ZXingWASM;
          zx.prepareZXingModule({ overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? '/vendor/zxing_reader.wasm' : prefix + path } });
          const canvas = document.createElement('canvas');
          detector = { async detect(frame) {
            if (!frame.videoWidth || !frame.videoHeight) return [];
            canvas.width = frame.videoWidth;
            canvas.height = frame.videoHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(frame, 0, 0, canvas.width, canvas.height);
            const results = await zx.readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), {
              formats: ['Code39Std', 'QRCode'], textMode: 'Plain', maxNumberOfSymbols: 4
            });
            return results.map(result => ({ rawValue: result.text }));
          } };
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (closed) { stopCamera(); return; }
        video.srcObject = stream;
        video.hidden = false;
        await video.play();
        if (closed) return;
        status.textContent = '請將發票一維條碼或左側 QR Code 對準相機；也可直接使用掃描槍。';
        async function scan() {
          if (closed) return;
          try {
            const results = await detector.detect(video);
            if (closed) return;
            for (const result of results) {
              if (parse(result.rawValue)) { accept(result.rawValue); return; }
            }
          } catch (error) {
            if (closed) return;
            stopCamera();
            status.textContent = '相機辨識失敗，請改用掃描槍或輸入發票號碼後按 Enter。';
            return;
          }
          if (!closed) timer = setTimeout(scan, 180);
        }
        timer = setTimeout(scan, 0);
      } catch (error) {
        stopCamera();
        if (!closed) status.textContent = '無法開啟相機，請允許相機權限並使用 HTTPS；也可改用掃描槍或輸入發票號碼後按 Enter。';
      }
    })();
    return { close, ready };
  }
  global.PosInvoiceScan = { parse, open, close() { activeClose?.(); } };
})(window);
