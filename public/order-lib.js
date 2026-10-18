'use strict';
(function (global) {
  const TEXT = {
    zh: {
      order: '桌邊點餐', loading: '載入中…', name_placeholder: '你的稱呼（讓同桌知道誰點了什麼）', confirm: '好',
      name_gate_title: '先告訴我們怎麼稱呼您', name_gate_submit: '查看菜單', name_skip: '略過', ordering_as: '點餐稱呼', name_edit: '更改', back_step: '上一步', served_banner: '桌號 {table}｜{items} 已送到桌上',
      shared_hint: '同桌的人掃同一個 QR 就能一起點；加入已點清單後按「送出點餐」，用餐完再到櫃檯結帳，可全部付款、各付各的，或平均分攤。',
      place: '送出點餐', place_n: '送出 {count} 項', n_items: '{count} 項', place_with_others: '送出 {count} 項（含{others}）', place_confirm: '這會把同桌其他人還沒送出的品項一起送進廚房：{others}。確定送出？', someone_added: '{name} 加了 {items}', someone_removed: '{name} 移除了 {items}', others_pending_hint: '同桌還沒送出的品項會跟著一起送出', placed: '已送出', served: '已出餐', not_sent: '未送出', place_done: '已送出點餐，餐點準備中。用餐完記得到櫃檯結帳！', pay_reminder: '離席前請到櫃檯結帳，工作人員會依這桌的明細收款。', pending_items: '{count} 項還沒送出',
      current_menu: '目前菜單', closed: '非供餐時段', menu_unavailable: '目前尚未提供菜單。', closed_message: '目前非供餐時段，請稍後再點餐。',
      cart: '已點清單', checkout: '用餐完結帳', table_order: '這桌的點餐', unpaid_total: '未結帳合計', continue: '繼續點',
      checkout_title: '用餐完再到櫃檯結帳', checkout_hint: '請先享用餐點；離席前帶著手機到櫃檯，工作人員會依這桌點餐明細結帳。',
      whole_table: '全部付款', my_items: '各付各的', split_evenly: '平均分攤', people: '分攤人數', people_suffix: '人', my_items_hint: '只付自己點的品項', split_hint: '全桌金額平均分，櫃檯依人數分次收',
      counter_amount: '櫃檯結帳金額', keep_screen: '畫面可先保留，結帳時出示給櫃檯確認。', back: '返回繼續點',
      notify_counter: '通知櫃檯我要結帳', notify_done: '已通知櫃檯，請到櫃檯付款。', notify_sent: '已通知櫃檯：{count} 項 {amount}', notify_sent_split: '已通知櫃檯：平均分攤 {people} 人，每人 {each}', notify_cancel: '取消',
      split_each: '每人', split_remainder: '其中 {count} 人各多付 NT$1（尾差由櫃檯調整）', table: '桌號', unpaid_items: '{count} 項未結帳', empty: '尚未點餐',
      no_orders: '還沒有人點餐。', me: '我', paid: '已付款', preparing: '準備中', ready: '可取餐', done: '已取餐',
      alcohol: '未滿十八歲禁止飲酒。禁止酒駕。', add: '加入', remove: '移除', ready_banner: '桌號 {table}｜餐點好了，請至櫃檯取餐',
      thanks: '感謝用餐，期待再次光臨。', thanks_hint: '這次點餐已結束。若要再點，請重新掃描桌上的 QR。', thanks_again: '重新點餐',
      view_detail: '查看細項', back_menu: '返回菜單', add_to_cart: '加入已點清單', added: '已加入', quantity: '數量', required: '必選', optional: '選填', special_request: '其他需求', special_placeholder: '例如：不要蔥、醬另外放', sugar: '糖度', ice: '冰塊', temperature: '溫度', rice_amount: '飯量', noodle_amount: '麵量', notification_prompt: '餐點好了通知我', notification_on: '已開啟通知', notification_unsupported: '此瀏覽器不支援通知；請留在這個頁面，餐點好了會在畫面上提示。', notification_error: '無法開啟通知：{message}。請留在此頁，餐點好了會在畫面上提示。',
    },
    en: {
      order: 'Table ordering', loading: 'Loading…', name_placeholder: 'Your name (so your table knows what you ordered)', confirm: 'Save',
      name_gate_title: 'Tell us your name first', name_gate_submit: 'View menu', name_skip: 'Skip', ordering_as: 'Ordering as', name_edit: 'Change', back_step: 'Back', served_banner: 'Table {table} | {items} served',
      shared_hint: 'Everyone at the table can scan the same QR code. Add items, tap "Send order", and pay at the counter after dining—together, by ordered items, or split evenly.',
      place: 'Send order', place_n: 'Send {count} item(s)', n_items: '{count} item(s)', place_with_others: 'Send {count} item(s) (incl. {others})', place_confirm: 'This will also send items others at your table have not sent yet: {others}. Send now?', someone_added: '{name} added {items}', someone_removed: '{name} removed {items}', others_pending_hint: 'Unsent items from others at the table will be sent together', placed: 'Sent', served: 'Served', not_sent: 'Not sent yet', place_done: 'Order sent. We are preparing it now. Remember to pay at the counter after dining!', pay_reminder: 'Please pay at the counter before leaving. Staff will charge by this table\'s order.', pending_items: '{count} item(s) not sent yet',
      current_menu: 'Current menu', closed: 'Kitchen closed', menu_unavailable: 'No menu is available yet.', closed_message: 'The kitchen is currently closed. Please try again later.',
      cart: 'Order list', checkout: 'Pay after dining', table_order: 'Table order', unpaid_total: 'Unpaid total', continue: 'Keep ordering',
      checkout_title: 'Pay at the counter after dining', checkout_hint: 'Enjoy your meal first. Before leaving, bring this screen to the counter and staff will confirm the bill.',
      whole_table: 'Pay all together', my_items: 'Pay my own items', split_evenly: 'Split evenly', people: 'Number of people', people_suffix: 'people', my_items_hint: 'Only the items you ordered', split_hint: 'Table total divided evenly; the counter collects per person',
      counter_amount: 'Amount at counter', keep_screen: 'Keep this screen open and show it to staff when paying.', back: 'Back to order',
      notify_counter: 'Tell the counter I\'m ready to pay', notify_done: 'Counter notified. Please pay at the counter.', notify_sent: 'Counter notified: {count} item(s) {amount}', notify_sent_split: 'Counter notified: split {people} ways, {each} each', notify_cancel: 'Cancel',
      split_each: 'Each person', split_remainder: '{count} person(s) pays NT$1 more; staff will adjust the remainder', table: 'Table', unpaid_items: '{count} unpaid item(s)', empty: 'No items yet',
      no_orders: 'No one has ordered yet.', me: 'Me', paid: 'Paid', preparing: 'Preparing', ready: 'Ready for pickup', done: 'Picked up',
      alcohol: 'No alcohol under 18. Do not drink and drive.', add: 'Add', remove: 'Remove', ready_banner: 'Table {table} | Your order is ready. Please pick it up at the counter.',
      thanks: 'Thanks for dining with us. See you next time.', thanks_hint: 'This order has ended. Scan the table QR again to start a new one.', thanks_again: 'Order again',
      view_detail: 'Details', back_menu: 'Back to menu', add_to_cart: 'Add to order list', added: 'Added', quantity: 'Quantity', required: 'Required', optional: 'Optional', special_request: 'Other requests', special_placeholder: 'e.g. no scallions, sauce on the side', sugar: 'Sweetness', ice: 'Ice', temperature: 'Temperature', rice_amount: 'Rice amount', noodle_amount: 'Noodle amount', notification_prompt: 'Notify me when ready', notification_on: 'Notifications on', notification_unsupported: 'This browser does not support notifications. Keep this page open and we will show an on-screen alert when your order is ready.', notification_error: 'Could not enable notifications: {message}. Keep this page open for the on-screen alert.',
    },
    ja: {
      order: 'テーブル注文', loading: '読み込み中…', name_placeholder: 'お名前（同じテーブルで確認するため）', confirm: '保存',
      name_gate_title: 'まずお名前を教えてください', name_gate_submit: 'メニューを見る', name_skip: 'スキップ', ordering_as: 'ご注文者', name_edit: '変更', back_step: '戻る', served_banner: 'テーブル {table}｜{items} をお届けしました',
      shared_hint: '同じテーブルの方は同じQRから注文できます。注文リストに入れて「注文を送る」を押し、お食事後にカウンターでまとめて・自分の分だけ・割り勘でお支払いできます。',
      place: '注文を送る', place_n: '{count} 件を送る', n_items: '{count} 件', place_with_others: '{count} 件を送る（{others} を含む）', place_confirm: '同じテーブルの他の方がまだ送っていない注文も一緒に送られます：{others}。送信しますか？', someone_added: '{name} さんが {items} を追加しました', someone_removed: '{name} さんが {items} を削除しました', others_pending_hint: '同席者の未送信の注文も一緒に送られます', placed: '送信済み', served: '提供済み', not_sent: '未送信', place_done: '注文を送りました。ただいま準備中です。お食事後はカウンターでお会計をお願いします。', pay_reminder: '退店前にカウンターでお会計をお願いします。このテーブルの注文明細で精算します。', pending_items: '未送信 {count} 件',
      current_menu: '現在のメニュー', closed: '提供時間外', menu_unavailable: '現在メニューはありません。', closed_message: '現在は提供時間外です。しばらくしてからご注文ください。',
      cart: '注文リスト', checkout: '食後に会計', table_order: 'このテーブルの注文', unpaid_total: '未会計合計', continue: '注文を続ける',
      checkout_title: 'お食事後にカウンターで会計', checkout_hint: 'まずお食事をお楽しみください。退店前にこの画面をカウンターで提示してください。',
      whole_table: 'まとめて支払う', my_items: '自分の分だけ支払う', split_evenly: '割り勘', people: '人数', people_suffix: '人', my_items_hint: '自分が注文した品のみ', split_hint: 'テーブル合計を人数で均等に分け、カウンターで一人ずつ会計',
      counter_amount: 'カウンター会計金額', keep_screen: '会計時にスタッフへこの画面を提示してください。', back: '戻る',
      notify_counter: 'カウンターに会計を知らせる', notify_done: 'カウンターに通知しました。カウンターでお支払いください。', notify_sent: '通知済み：{count} 件 {amount}', notify_sent_split: '通知済み：{people} 人で割り勘、一人 {each}', notify_cancel: '取消',
      split_each: '一人あたり', split_remainder: '{count} 人が NT$1 多く支払います（端数はスタッフが調整）', table: 'テーブル', unpaid_items: '未会計 {count} 件', empty: 'まだ注文はありません',
      no_orders: 'まだ注文はありません。', me: '自分', paid: '支払い済み', preparing: '準備中', ready: '受け取り可', done: '受け取り済み',
      alcohol: '20歳未満の飲酒は禁止です。飲酒運転禁止。', add: '追加', remove: '削除', ready_banner: 'テーブル {table}｜ご注文の品ができました。カウンターでお受け取りください。',
      thanks: 'ご来店ありがとうございました。', thanks_hint: '今回のご注文は終了しました。もう一度ご注文の際はテーブルのQRをスキャンしてください。', thanks_again: 'もう一度注文する',
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
      ice: ['正常冰', '少冰', '去冰'],
      temp: ['冰', '熱'],
      rice: ['正常飯', '少飯', '飯多'],
      noodle: ['正常麵', '少麵', '麵多'],
    },
    en: {
      sugar: ['Regular', 'Less sugar', 'Half sugar', 'Light sugar', 'No sugar'],
      ice: ['Regular ice', 'Less ice', 'No ice'],
      temp: ['Iced', 'Hot'],
      rice: ['Regular rice', 'Less rice', 'Extra rice'],
      noodle: ['Regular noodles', 'Less noodles', 'Extra noodles'],
    },
    ja: {
      sugar: ['通常', '少なめ', '半分', '微糖', '無糖'],
      ice: ['通常', '少なめ', '氷なし'],
      temp: ['アイス', 'ホット'],
      rice: ['通常', '少なめ', '多め'],
      noodle: ['通常', '少なめ', '多め'],
    },
  };
  function optionGroups(item, lang) {
    const l = lang === 'en' || lang === 'ja' ? lang : 'zh';
    const labels = TEXT[l] || TEXT.zh;
    const cat = String(item?.cat || '');
    if (cat === 'COMBO') return [];   // 套餐的選項由 comboGroups 依內容產生
    const title = [item?.zh, item?.en].filter(Boolean).join(' ').toLowerCase();
    const name = [title, item?.note].filter(Boolean).join(' ').toLowerCase();
    const groups = [];
    const temperature = () => groups.push({ key: 'temperature', label: labels.temperature, choices: OPT[l].temp });
    // 冰塊只有冰飲才顯示，且所有飲品只提供 正常／少冰／去冰；所有飲品不提供甜度調整。
    const ice = conditional => groups.push({ key: 'ice', label: labels.ice, choices: conditional ? OPT[l].ice : OPT[l].ice, ...(conditional ? { when: { key: 'temperature', value: OPT[l].temp[0] } } : {}) });
    const fixedHot = cat === 'TEA' && /（壺）|\(pot\)|熱水|hot water/.test(name);
    const fixedCold = cat === 'SPARKLING' || /西西里|柚子美式|氣泡|sparkling|romano/.test(name);
    if ((cat === 'COFFEE' || cat === 'BEVERAGE' || cat === 'TEA') && !fixedHot && !fixedCold) {
      temperature();
      ice(true);
    } else if ((cat === 'COFFEE' || cat === 'BEVERAGE' || cat === 'TEA' || cat === 'SPARKLING') && fixedCold) {
      ice(false);
    }
    // 只依品名判斷主食份量；麵優先，避免 MAIN/JAPANESE 麵類同時出現「加飯」。
    const hasNoodle = /麵|noodle|pasta|udon|soba|義大利/.test(title);
    const hasRice = /飯|rice|丼|咖哩|curry|onigiri|ochazuke/.test(title);
    if (hasNoodle) groups.push({ key: 'noodle', label: labels.noodle_amount, choices: OPT[l].noodle });
    else if (hasRice) groups.push({ key: 'rice', label: labels.rice_amount, choices: OPT[l].rice });
    return groups;
  }
  /* 套餐：每個選擇欄（主餐／飲品）一組單選，選到的品項再帶出它自己的規格（溫度／糖度／冰塊／飯量…），
   * 規格組用 when 綁在所選品項上，沿用 activeOptionGroups 顯示／隱藏。items＝同一份菜單（找出各選項對應的品項）。 */
  const SLOT = {
    en: { 主餐: 'Main', 飲品: 'Drink', 貝果: 'Bagel', 飯糰: 'Onigiri', 甜點: 'Dessert' },
    ja: { 主餐: 'メイン', 飲品: 'ドリンク', 貝果: 'ベーグル', 飯糰: 'おにぎり', 甜點: 'デザート' },
  };
  const slotLabel = (zh, lang) => (SLOT[lang] && SLOT[lang][zh]) || zh;
  const nameOf = (m, lang) => (lang === 'en' && m.en) || (lang === 'ja' && m.ja) || m.zh;
  function comboGroups(item, items, lang) {
    const groups = [];
    (item?.combo || []).forEach(slot => {
      const opts = slot.choices.map(c => {
        const m = (items || []).find(x => x.zh === c.zh && x.venue === item.venue && x.cat !== 'COMBO');
        return m ? { c, m, name: nameOf(m, lang), label: nameOf(m, lang) + (c.add > 0 ? ' (+' + c.add + ')' : '') } : null;
      }).filter(Boolean);
      if (!opts.length) return;
      groups.push({ key: slot.key, label: slotLabel(slot.label, lang), choices: opts.map(o => o.label), values: opts.map(o => o.c.zh), combo: true });
      opts.forEach((o, i) => {
        optionGroups(o.m, lang).forEach(g => {
          const key = slot.key + '__' + i + '__' + g.key;
          const when = [{ key: slot.key, value: o.label }];
          if (g.when) when.push({ key: slot.key + '__' + i + '__' + g.when.key, value: g.when.value });
          groups.push({ key, label: o.name + '・' + g.label, choices: g.choices, when, sub: { slot: slot.key, label: o.label, zh: o.c.zh, optLabel: g.label } });
        });
      });
    });
    return groups;
  }
  /* 把選好的結果轉成後端要的 combo：{ main: { zh:'原味貝果', note:'飯量：正常飯' }, drink: { zh:'拿鐵咖啡', note:'溫度：熱；糖度：半糖' } } */
  function comboPayload(groups, picks) {
    const active = activeOptionGroups(groups, picks), out = {};
    groups.filter(g => g.combo).forEach(g => {
      const i = g.choices.indexOf(picks[g.key] || g.choices[0]);
      const label = g.choices[i < 0 ? 0 : i];
      const subs = active.filter(s => s.sub && s.sub.slot === g.key && s.sub.label === label);
      out[g.key] = { zh: g.values[i < 0 ? 0 : i], note: subs.map(s => s.sub.optLabel + '：' + (picks[s.key] || s.choices[0])).join('；') };
    });
    return out;
  }
  function activeOptionGroups(groups, picks) {
    return (groups || []).filter(g => !g.when || [].concat(g.when).every(w => picks?.[w.key] === w.value));
  }

  global.OrderLib = { TEXT, text, splitBill, optionGroups, activeOptionGroups, comboGroups, comboPayload, slotLabel };
})(typeof window !== 'undefined' ? window : globalThis);
