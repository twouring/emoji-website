'use strict';
(function (global) {
  const TEXT = {
    zh: {
      order: '桌邊點餐', loading: '載入中…', name_placeholder: '你的稱呼（讓同桌知道誰點了什麼）', confirm: '好',
      name_gate_title: '先告訴我們怎麼稱呼您', name_gate_submit: '查看菜單', name_skip: '略過', ordering_as: '點餐稱呼', name_edit: '更改', back_step: '上一步', served_banner: '桌號 {table}｜{items} 已送到桌上',
      shared_hint: '同桌的人掃同一個 QR 就能一起點；加入已點清單後按「送出點餐」，用餐完再到櫃檯結帳，可付全桌、各付自己的，或平均分攤。',
      place: '送出點餐', placed: '已送出', served: '已出餐', not_sent: '未送出', place_done: '已送出點餐，餐點準備中。用餐完記得到櫃檯結帳！', pay_reminder: '離席前請到櫃檯結帳，工作人員會依這桌的明細收款。', pending_items: '{count} 項還沒送出',
      current_menu: '目前菜單', closed: '非供餐時段', menu_unavailable: '目前尚未提供菜單。', closed_message: '目前非供餐時段，請稍後再點餐。',
      cart: '已點清單', checkout: '用餐完結帳', table_order: '這桌的點餐', unpaid_total: '未結帳合計', continue: '繼續點',
      checkout_title: '用餐完再到櫃檯結帳', checkout_hint: '請先享用餐點；離席前帶著手機到櫃檯，工作人員會依這桌點餐明細結帳。',
      whole_table: '付全桌', my_items: '只付我的', split_evenly: '平均分攤', people: '分攤人數', people_suffix: '人',
      counter_amount: '櫃檯結帳金額', keep_screen: '畫面可先保留，結帳時出示給櫃檯確認。', back: '返回繼續點',
      split_each: '每人', split_remainder: '其中 {count} 人各多付 NT$1（尾差由櫃檯調整）', table: '桌號', unpaid_items: '{count} 項未結帳', empty: '尚未點餐',
      no_orders: '還沒有人點餐。', me: '我', paid: '已付款', preparing: '準備中', ready: '可取餐', done: '已取餐',
      alcohol: '未滿十八歲禁止飲酒。禁止酒駕。', add: '加入', remove: '移除', ready_banner: '桌號 {table}｜餐點好了，請至櫃檯取餐',
      view_detail: '查看細項', back_menu: '返回菜單', add_to_cart: '加入已點清單', added: '已加入', quantity: '數量', required: '必選', optional: '選填', special_request: '其他需求', special_placeholder: '例如：不要蔥、醬另外放', sugar: '糖度', ice: '冰塊', temperature: '溫度', rice_amount: '飯量', noodle_amount: '麵量', notification_prompt: '餐點好了通知我', notification_on: '已開啟通知', notification_unsupported: '此瀏覽器不支援通知；請留在這個頁面，餐點好了會在畫面上提示。', notification_error: '無法開啟通知：{message}。請留在此頁，餐點好了會在畫面上提示。',
    },
    en: {
      order: 'Table ordering', loading: 'Loading…', name_placeholder: 'Your name (so your table knows what you ordered)', confirm: 'Save',
      name_gate_title: 'Tell us your name first', name_gate_submit: 'View menu', name_skip: 'Skip', ordering_as: 'Ordering as', name_edit: 'Change', back_step: 'Back', served_banner: 'Table {table} | {items} served',
      shared_hint: 'Everyone at the table can scan the same QR code. Add items, tap "Send order", and pay at the counter after dining—together, by ordered items, or split evenly.',
      place: 'Send order', placed: 'Sent', served: 'Served', not_sent: 'Not sent yet', place_done: 'Order sent. We are preparing it now. Remember to pay at the counter after dining!', pay_reminder: 'Please pay at the counter before leaving. Staff will charge by this table\'s order.', pending_items: '{count} item(s) not sent yet',
      current_menu: 'Current menu', closed: 'Kitchen closed', menu_unavailable: 'No menu is available yet.', closed_message: 'The kitchen is currently closed. Please try again later.',
      cart: 'Order list', checkout: 'Pay after dining', table_order: 'Table order', unpaid_total: 'Unpaid total', continue: 'Keep ordering',
      checkout_title: 'Pay at the counter after dining', checkout_hint: 'Enjoy your meal first. Before leaving, bring this screen to the counter and staff will confirm the bill.',
      whole_table: 'Whole table', my_items: 'My items', split_evenly: 'Split evenly', people: 'Number of people', people_suffix: 'people',
      counter_amount: 'Amount at counter', keep_screen: 'Keep this screen open and show it to staff when paying.', back: 'Back to order',
      split_each: 'Each person', split_remainder: '{count} person(s) pays NT$1 more; staff will adjust the remainder', table: 'Table', unpaid_items: '{count} unpaid item(s)', empty: 'No items yet',
      no_orders: 'No one has ordered yet.', me: 'Me', paid: 'Paid', preparing: 'Preparing', ready: 'Ready for pickup', done: 'Picked up',
      alcohol: 'No alcohol under 18. Do not drink and drive.', add: 'Add', remove: 'Remove', ready_banner: 'Table {table} | Your order is ready. Please pick it up at the counter.',
      view_detail: 'Details', back_menu: 'Back to menu', add_to_cart: 'Add to order list', added: 'Added', quantity: 'Quantity', required: 'Required', optional: 'Optional', special_request: 'Other requests', special_placeholder: 'e.g. no scallions, sauce on the side', sugar: 'Sweetness', ice: 'Ice', temperature: 'Temperature', rice_amount: 'Rice amount', noodle_amount: 'Noodle amount', notification_prompt: 'Notify me when ready', notification_on: 'Notifications on', notification_unsupported: 'This browser does not support notifications. Keep this page open and we will show an on-screen alert when your order is ready.', notification_error: 'Could not enable notifications: {message}. Keep this page open for the on-screen alert.',
    },
    ja: {
      order: 'テーブル注文', loading: '読み込み中…', name_placeholder: 'お名前（同じテーブルで確認するため）', confirm: '保存',
      name_gate_title: 'まずお名前を教えてください', name_gate_submit: 'メニューを見る', name_skip: 'スキップ', ordering_as: 'ご注文者', name_edit: '変更', back_step: '戻る', served_banner: 'テーブル {table}｜{items} をお届けしました',
      shared_hint: '同じテーブルの方は同じQRから注文できます。注文リストに入れて「注文を送る」を押し、お食事後にカウンターでまとめて・自分の分だけ・割り勘でお支払いできます。',
      place: '注文を送る', placed: '送信済み', served: '提供済み', not_sent: '未送信', place_done: '注文を送りました。ただいま準備中です。お食事後はカウンターでお会計をお願いします。', pay_reminder: '退店前にカウンターでお会計をお願いします。このテーブルの注文明細で精算します。', pending_items: '未送信 {count} 件',
      current_menu: '現在のメニュー', closed: '提供時間外', menu_unavailable: '現在メニューはありません。', closed_message: '現在は提供時間外です。しばらくしてからご注文ください。',
      cart: '注文リスト', checkout: '食後に会計', table_order: 'このテーブルの注文', unpaid_total: '未会計合計', continue: '注文を続ける',
      checkout_title: 'お食事後にカウンターで会計', checkout_hint: 'まずお食事をお楽しみください。退店前にこの画面をカウンターで提示してください。',
      whole_table: '全体を支払う', my_items: '自分の分だけ', split_evenly: '割り勘', people: '人数', people_suffix: '人',
      counter_amount: 'カウンター会計金額', keep_screen: '会計時にスタッフへこの画面を提示してください。', back: '戻る',
      split_each: '一人あたり', split_remainder: '{count} 人が NT$1 多く支払います（端数はスタッフが調整）', table: 'テーブル', unpaid_items: '未会計 {count} 件', empty: 'まだ注文はありません',
      no_orders: 'まだ注文はありません。', me: '自分', paid: '支払い済み', preparing: '準備中', ready: '受け取り可', done: '受け取り済み',
      alcohol: '20歳未満の飲酒は禁止です。飲酒運転禁止。', add: '追加', remove: '削除', ready_banner: 'テーブル {table}｜ご注文の品ができました。カウンターでお受け取りください。',
      view_detail: '詳細を見る', back_menu: 'メニューに戻る', add_to_cart: '注文リストに追加', added: '追加しました', quantity: '数量', required: '必須', optional: '任意', special_request: 'その他の希望', special_placeholder: '例：ねぎ抜き、ソース別添え', sugar: '甘さ', ice: '氷', temperature: '温度', rice_amount: 'ご飯の量', noodle_amount: '麺の量', notification_prompt: '出来上がりを通知', notification_on: '通知を有効にしました', notification_unsupported: 'このブラウザは通知に対応していません。このページを開いたままにしてください。出来上がり時に画面でお知らせします。', notification_error: '通知を有効にできません：{message}。このページを開いたままにしてください。',
    },
  };
  function text(lang, key, vars) {
    const dict = TEXT[lang] || TEXT.zh;
    let value = dict[key] || TEXT.zh[key] || key;
    Object.entries(vars || {}).forEach(([name, replacement]) => { value = value.replaceAll('{' + name + '}', replacement); });
    return value;
  }
  function splitBill(total, people) {
    const amount = Number(total); const count = Number(people);
    if (!Number.isInteger(amount) || amount < 0) throw new TypeError('total must be a non-negative integer');
    if (!Number.isInteger(count) || count < 2 || count > 20) throw new RangeError('people must be an integer from 2 to 20');
    return { base: Math.floor(amount / count), remainder: amount % count, people: count, total: amount };
  }

  const OPT = {
    zh: {
      sugar: ['正常糖', '少糖', '半糖', '微糖', '無糖'],
      ice: ['正常冰', '少冰', '微冰', '去冰', '常溫'],
      temp: ['冰', '熱'],
      rice: ['正常飯', '少飯', '飯多'],
      noodle: ['正常麵', '少麵', '麵多'],
    },
    en: {
      sugar: ['Regular', 'Less sugar', 'Half sugar', 'Light sugar', 'No sugar'],
      ice: ['Regular ice', 'Less ice', 'Light ice', 'No ice', 'Room temp'],
      temp: ['Iced', 'Hot'],
      rice: ['Regular rice', 'Less rice', 'Extra rice'],
      noodle: ['Regular noodles', 'Less noodles', 'Extra noodles'],
    },
    ja: {
      sugar: ['通常', '少なめ', '半分', '微糖', '無糖'],
      ice: ['通常', '少なめ', '微氷', '氷なし', '常温'],
      temp: ['アイス', 'ホット'],
      rice: ['通常', '少なめ', '多め'],
      noodle: ['通常', '少なめ', '多め'],
    },
  };
  function optionGroups(item, lang) {
    const l = lang === 'en' || lang === 'ja' ? lang : 'zh';
    const labels = TEXT[l] || TEXT.zh;
    const cat = String(item?.cat || '');
    const name = [item?.zh, item?.en, item?.note].filter(Boolean).join(' ').toLowerCase();
    const groups = [];
    const drinkCats = new Set(['COFFEE', 'TEA', 'BEVERAGE', 'SPARKLING']);
    if (drinkCats.has(cat)) {
      if (cat === 'COFFEE') groups.push({ key: 'temperature', label: labels.temperature, choices: OPT[l].temp });
      if (cat !== 'COFFEE' || /拿鐵|茶|latte|milk|sparkling|氣泡|飲/.test(name)) groups.push({ key: 'sugar', label: labels.sugar, choices: OPT[l].sugar });
      groups.push({ key: 'ice', label: labels.ice, choices: OPT[l].ice });
    }
    if (cat === 'MAIN' || cat === 'JAPANESE' || /飯|rice|丼|咖哩/.test(name)) groups.push({ key: 'rice', label: labels.rice_amount, choices: OPT[l].rice });
    if (/麵|noodle|pasta|義大利/.test(name)) groups.push({ key: 'noodle', label: labels.noodle_amount, choices: OPT[l].noodle });
    return groups;
  }

  global.OrderLib = { TEXT, text, splitBill, optionGroups };
})(typeof window !== 'undefined' ? window : globalThis);
