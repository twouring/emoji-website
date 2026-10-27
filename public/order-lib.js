'use strict';
(function (global) {
  const TEXT = {
    zh: {
      call_btn: '呼叫', call_title: '呼叫服務', call_hint: '選一項，店員馬上過來。不會加進帳單。', call_send: '通知店員', call_note: '想請店員幫什麼？（選填）', call_sent: '已通知店員，請稍候。', call_waiting: '已通知店員：{kinds}', call_done: '店員已處理：{kinds}', call_wait: '{n} 秒後可再呼叫', call_pick: '請先選一項',
      song_popular: '熱門', song_recent: '最近點過', song_chart: '排行榜', song_queued: '已在待播', song_times: '點過 {n} 次', song_none_yet: '還沒有人點過歌，搜尋看看或看排行榜。', song_chart_empty: '排行榜暫時讀不到，請改用搜尋。',
      song_title: '點歌', song_card: '點一首歌在店裡播放', song_price: '每首 NT${price}，記在這桌帳上', song_search: '搜尋歌名或歌手', song_search_btn: '搜尋', song_searching: '搜尋中…', song_now: '正在播放', song_queue: '待播清單', song_queue_empty: '目前沒有人點歌。', song_pick: '點這首', song_picked: '已點歌！排在第 {n} 首。', song_confirm: '點「{title}」？NT${price} 會記在這桌帳上，用餐完一起結帳。', song_mine: '本桌', song_none: '找不到可以播放的歌，換個關鍵字試試。', song_hint: '長度上限 {min} 分鐘；每桌同時最多排 {max} 首。', song_playlist: '店內歌單',
      order: '桌邊點餐', loading: '載入中…', name_placeholder: '你的稱呼（讓同桌知道誰點了什麼）', confirm: '好',
      name_gate_title: '先告訴我們怎麼稱呼您', name_gate_submit: '查看菜單', name_skip: '略過', ordering_as: '點餐稱呼', name_edit: '更改', back_step: '上一步', served_banner: '桌號 {table}｜{items} 已送到桌上',
      shared_hint: '同桌的人掃同一個 QR 就能一起點；加入已點清單後按「送出點餐」，用餐完再到櫃檯結帳，可全部付款、各付各的，或平均分攤。',
      place: '送出點餐', place_n: '送出 {count} 項', n_items: '{count} 項', place_with_others: '送出 {count} 項（含{others}）', place_confirm: '這會把同桌其他人還沒送出的品項一起送進廚房：{others}。確定送出？', someone_added: '{name} 加了 {items}', someone_removed: '{name} 移除了 {items}', others_pending_hint: '同桌還沒送出的品項會跟著一起送出', placed: '已送出', served: '已出餐', not_sent: '未送出', place_done: '已送出點餐，餐點準備中。用餐完記得到櫃檯結帳！', pay_reminder: '離席前請到櫃檯結帳，工作人員會依這桌的明細收款。', pending_items: '{count} 項還沒送出',
      current_menu: '目前菜單', closed: '非供餐時段', menu_unavailable: '目前尚未提供菜單。', closed_message: '目前非供餐時段，請稍後再點餐。', last_order: '最後點餐', cafe_last_order: '餐點點到 16:00・飲品點到 16:30', bar_last_order: '餐點點到 02:00・酒水點到 02:30', cafe_food_closed: '餐點已過最後點餐（16:00），飲品點到 16:30', bar_food_closed: '餐點已過最後點餐（02:00），酒水點到 02:30',
      cart: '已點清單', checkout: '用餐完結帳', table_order: '這桌的點餐', unpaid_total: '未結帳合計', continue: '繼續點',
      checkout_title: '用餐完再到櫃檯結帳', checkout_hint: '請先享用餐點；離席前帶著手機到櫃檯，工作人員會依這桌點餐明細結帳。',
      whole_table: '全部付款', my_items: '各付各的', split_evenly: '平均分攤', people: '分攤人數', people_suffix: '人', my_items_hint: '只付自己點的品項', split_hint: '全桌金額平均分，櫃檯依人數分次收',
      counter_amount: '櫃檯結帳金額', keep_screen: '畫面可先保留，結帳時出示給櫃檯確認。', back: '返回繼續點',
      notify_counter: '通知櫃檯我要結帳', notify_done: '已通知櫃檯，請到櫃檯付款。', notify_sent: '已通知櫃檯：{count} 項 {amount}', notify_sent_split: '已通知櫃檯：平均分攤 {people} 人，每人 {each}', notify_cancel: '取消',
      split_each: '每人', split_remainder: '其中 {count} 人各多付 NT$1（尾差由櫃檯調整）', table: '桌號', unpaid_items: '{count} 項未結帳', empty: '尚未點餐',
      no_orders: '還沒有人點餐。', me: '我', paid: '已付款', preparing: '準備中', ready: '可取餐', done: '已取餐',
      bar_policy: '三點水低消每人平日 NT$300、假日 NT$600，另加 10% 服務費（外帶不收）。',
      info_title: '店家資訊', info_company: '言文字股份有限公司', info_tax_id: '統一編號 93537055', info_address: '台北市中正區重慶南路一段 11 號',
      info_prices: '收費表（目前菜單）', info_price_note: '標價為新台幣、含 5% 營業稅；依點餐明細於櫃檯結帳。', info_song: '點歌（每首）',
      info_support: '客服聯繫', info_support_hours: '營業時間 08:00–翌日 03:00 可洽現場人員，或來電／來信。',
      info_refund: '退款政策', info_refund_text: '現場點用的餐點製作後恕不退換；品質問題請當場告知店員處理。退款（含線上刷卡）請洽櫃檯辦理，以原付款方式退回，並依法作廢原發票或開立折讓單。', info_refund_link: '完整退費政策',
      info_tappay: '本服務由 TapPay 提供金流服務。', info_tel: '電話', info_terms: '服務條款', info_privacy: '隱私權政策',
      alcohol: '未滿十八歲禁止飲酒。禁止酒駕。', add: '加入', remove: '移除', ready_banner: '桌號 {table}｜餐點好了，請至櫃檯取餐',
      thanks: '感謝用餐，期待再次光臨。', thanks_hint: '這次點餐已結束。若要再點，請洽服務人員。', thanks_again: '重新點餐',
      review_title: '喜歡今天的餐點嗎？', review_hint: '在 Google 地圖留下評論，結帳時把評論出示給櫃檯人員，就送你 5 點會員點數（每位會員限領一次）。', review_go: '寫 Google 評論', review_view_cart: '查看已點清單', review_later: '下次再說',
      stock_left: '剩 {n} 份', view_detail: '查看細項', back_menu: '返回菜單', add_to_cart: '加入已點清單', added: '已加入', quantity: '數量', required: '必選', optional: '選填', special_request: '其他需求', special_placeholder: '例如：不要蔥、醬另外放', sugar: '糖度', ice: '冰塊', temperature: '溫度', rice_amount: '飯量', noodle_amount: '麵量', notification_prompt: '餐點好了通知我', notification_on: '已開啟通知', notification_unsupported: '此瀏覽器不支援通知；請留在這個頁面，餐點好了會在畫面上提示。', notification_error: '無法開啟通知：{message}。請留在此頁，餐點好了會在畫面上提示。',
    },
    en: {
      call_btn: 'Call staff', call_title: 'Call staff', call_hint: 'Pick one and a staff member will come over. Not added to your bill.', call_send: 'Notify staff', call_note: 'What do you need? (optional)', call_sent: 'Staff notified. Someone will be right with you.', call_waiting: 'Staff notified: {kinds}', call_done: 'Handled: {kinds}', call_wait: 'You can call again in {n}s', call_pick: 'Please pick one first',
      song_popular: 'Popular here', song_recent: 'Recently requested', song_chart: 'Top charts', song_queued: 'In queue', song_times: 'Requested {n}×', song_none_yet: 'No requests yet. Try search or the charts.', song_chart_empty: 'Charts are unavailable right now. Please use search.',
      song_title: 'Song request', song_card: 'Request a song to play in the shop', song_price: 'NT${price} per song, added to your table bill', song_search: 'Search a song or artist', song_search_btn: 'Search', song_searching: 'Searching…', song_now: 'Now playing', song_queue: 'Up next', song_queue_empty: 'No requests yet.', song_pick: 'Request', song_picked: 'Requested! It is #{n} in the queue.', song_confirm: 'Request "{title}"? NT${price} will be added to your table bill.', song_mine: 'Your table', song_none: 'No playable songs found. Try another keyword.', song_hint: 'Up to {min} min per song; up to {max} songs per table in the queue.', song_playlist: 'House playlist',
      order: 'Table ordering', loading: 'Loading…', name_placeholder: 'Your name (so your table knows what you ordered)', confirm: 'Save',
      name_gate_title: 'Tell us your name first', name_gate_submit: 'View menu', name_skip: 'Skip', ordering_as: 'Ordering as', name_edit: 'Change', back_step: 'Back', served_banner: 'Table {table} | {items} served',
      shared_hint: 'Everyone at the table can scan the same QR code. Add items, tap "Send order", and pay at the counter after dining—together, by ordered items, or split evenly.',
      place: 'Send order', place_n: 'Send {count} item(s)', n_items: '{count} item(s)', place_with_others: 'Send {count} item(s) (incl. {others})', place_confirm: 'This will also send items others at your table have not sent yet: {others}. Send now?', someone_added: '{name} added {items}', someone_removed: '{name} removed {items}', others_pending_hint: 'Unsent items from others at the table will be sent together', placed: 'Sent', served: 'Served', not_sent: 'Not sent yet', place_done: 'Order sent. We are preparing it now. Remember to pay at the counter after dining!', pay_reminder: 'Please pay at the counter before leaving. Staff will charge by this table\'s order.', pending_items: '{count} item(s) not sent yet',
      current_menu: 'Current menu', closed: 'Kitchen closed', menu_unavailable: 'No menu is available yet.', closed_message: 'The kitchen is currently closed. Please try again later.', last_order: 'Last order', cafe_last_order: 'Food until 16:00 · drinks until 16:30', bar_last_order: 'Food until 02:00 · drinks until 02:30', cafe_food_closed: 'Last food order was 16:00 · drinks until 16:30', bar_food_closed: 'Last food order was 02:00 · drinks until 02:30',
      cart: 'Order list', checkout: 'Pay after dining', table_order: 'Table order', unpaid_total: 'Unpaid total', continue: 'Keep ordering',
      checkout_title: 'Pay at the counter after dining', checkout_hint: 'Enjoy your meal first. Before leaving, bring this screen to the counter and staff will confirm the bill.',
      whole_table: 'Pay all together', my_items: 'Pay my own items', split_evenly: 'Split evenly', people: 'Number of people', people_suffix: 'people', my_items_hint: 'Only the items you ordered', split_hint: 'Table total divided evenly; the counter collects per person',
      counter_amount: 'Amount at counter', keep_screen: 'Keep this screen open and show it to staff when paying.', back: 'Back to order',
      notify_counter: 'Tell the counter I\'m ready to pay', notify_done: 'Counter notified. Please pay at the counter.', notify_sent: 'Counter notified: {count} item(s) {amount}', notify_sent_split: 'Counter notified: split {people} ways, {each} each', notify_cancel: 'Cancel',
      split_each: 'Each person', split_remainder: '{count} person(s) pays NT$1 more; staff will adjust the remainder', table: 'Table', unpaid_items: '{count} unpaid item(s)', empty: 'No items yet',
      no_orders: 'No one has ordered yet.', me: 'Me', paid: 'Paid', preparing: 'Preparing', ready: 'Ready for pickup', done: 'Picked up',
      bar_policy: '3AM minimum spend: NT$300 per person on weekdays, NT$600 on weekends, plus a 10% service charge (not for takeout).',
      info_title: 'Merchant information', info_company: 'emoji Co., Ltd. (言文字股份有限公司)', info_tax_id: 'Tax ID 93537055', info_address: 'No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei',
      info_prices: 'Price list (current menu)', info_price_note: 'Prices are in TWD and include 5% business tax. Pay at the counter based on your order.', info_song: 'Song request (each)',
      info_support: 'Customer service', info_support_hours: 'Ask our staff during opening hours (08:00–03:00), or call / email us.',
      info_refund: 'Refund policy', info_refund_text: 'Food and drinks cannot be returned or exchanged once prepared. For quality issues, please tell our staff on the spot. Refunds (including online card payments) are handled at the counter and returned to the original payment method, and the invoice is voided or a credit note issued as required by law.', info_refund_link: 'Full refund policy',
      info_tappay: 'Payment services are provided by TapPay.', info_tel: 'Tel', info_terms: 'Terms of service', info_privacy: 'Privacy policy',
      alcohol: 'No alcohol under 18. Do not drink and drive.', add: 'Add', remove: 'Remove', ready_banner: 'Table {table} | Your order is ready. Please pick it up at the counter.',
      thanks: 'Thanks for dining with us. See you next time.', thanks_hint: 'This order has ended. Please ask our staff if you would like to order again.', thanks_again: 'Order again',
      review_title: 'Enjoying your visit?', review_hint: 'Leave us a Google Maps review and show it to our staff when you pay. Members get 5 points (once per member).', review_go: 'Write a Google review', review_view_cart: 'View my order', review_later: 'Maybe later',
      stock_left: 'Only {n} left', view_detail: 'Details', back_menu: 'Back to menu', add_to_cart: 'Add to order list', added: 'Added', quantity: 'Quantity', required: 'Required', optional: 'Optional', special_request: 'Other requests', special_placeholder: 'e.g. no scallions, sauce on the side', sugar: 'Sweetness', ice: 'Ice', temperature: 'Temperature', rice_amount: 'Rice amount', noodle_amount: 'Noodle amount', notification_prompt: 'Notify me when ready', notification_on: 'Notifications on', notification_unsupported: 'This browser does not support notifications. Keep this page open and we will show an on-screen alert when your order is ready.', notification_error: 'Could not enable notifications: {message}. Keep this page open for the on-screen alert.',
    },
    ja: {
      call_btn: '呼び出し', call_title: 'スタッフ呼び出し', call_hint: '項目を選ぶとスタッフが伺います。お会計には加算されません。', call_send: 'スタッフに知らせる', call_note: 'ご用件（任意）', call_sent: 'スタッフに知らせました。少々お待ちください。', call_waiting: '呼び出し中：{kinds}', call_done: '対応済み：{kinds}', call_wait: '{n} 秒後に再度呼び出せます', call_pick: '項目を選んでください',
      song_popular: '人気', song_recent: '最近のリクエスト', song_chart: 'ランキング', song_queued: '再生待ち', song_times: '{n} 回リクエスト', song_none_yet: 'まだリクエストはありません。検索かランキングからどうぞ。', song_chart_empty: 'ランキングを読み込めません。検索をご利用ください。',
      song_title: 'リクエスト曲', song_card: '店内で流す曲をリクエスト', song_price: '1曲 NT${price}、テーブルのお会計に加算', song_search: '曲名・アーティストで検索', song_search_btn: '検索', song_searching: '検索中…', song_now: '再生中', song_queue: '再生待ち', song_queue_empty: 'まだリクエストはありません。', song_pick: 'リクエスト', song_picked: 'リクエストしました。{n} 番目に再生します。', song_confirm: '「{title}」をリクエストしますか？NT${price} がお会計に加算されます。', song_mine: 'このテーブル', song_none: '再生できる曲が見つかりません。別のキーワードでお試しください。', song_hint: '1曲 {min} 分まで／1テーブル同時 {max} 曲まで。', song_playlist: '店内プレイリスト',
      order: 'テーブル注文', loading: '読み込み中…', name_placeholder: 'お名前（同じテーブルで確認するため）', confirm: '保存',
      name_gate_title: 'まずお名前を教えてください', name_gate_submit: 'メニューを見る', name_skip: 'スキップ', ordering_as: 'ご注文者', name_edit: '変更', back_step: '戻る', served_banner: 'テーブル {table}｜{items} をお届けしました',
      shared_hint: '同じテーブルの方は同じQRから注文できます。注文リストに入れて「注文を送る」を押し、お食事後にカウンターでまとめて・自分の分だけ・割り勘でお支払いできます。',
      place: '注文を送る', place_n: '{count} 件を送る', n_items: '{count} 件', place_with_others: '{count} 件を送る（{others} を含む）', place_confirm: '同じテーブルの他の方がまだ送っていない注文も一緒に送られます：{others}。送信しますか？', someone_added: '{name} さんが {items} を追加しました', someone_removed: '{name} さんが {items} を削除しました', others_pending_hint: '同席者の未送信の注文も一緒に送られます', placed: '送信済み', served: '提供済み', not_sent: '未送信', place_done: '注文を送りました。ただいま準備中です。お食事後はカウンターでお会計をお願いします。', pay_reminder: '退店前にカウンターでお会計をお願いします。このテーブルの注文明細で精算します。', pending_items: '未送信 {count} 件',
      current_menu: '現在のメニュー', closed: '提供時間外', menu_unavailable: '現在メニューはありません。', closed_message: '現在は提供時間外です。しばらくしてからご注文ください。', last_order: 'ラストオーダー', cafe_last_order: 'フード16:00・ドリンク16:30まで', bar_last_order: 'フード02:00・ドリンク02:30まで', cafe_food_closed: 'フードのラストオーダーは16:00・ドリンクは16:30まで', bar_food_closed: 'フードのラストオーダーは02:00・ドリンクは02:30まで',
      cart: '注文リスト', checkout: '食後に会計', table_order: 'このテーブルの注文', unpaid_total: '未会計合計', continue: '注文を続ける',
      checkout_title: 'お食事後にカウンターで会計', checkout_hint: 'まずお食事をお楽しみください。退店前にこの画面をカウンターで提示してください。',
      whole_table: 'まとめて支払う', my_items: '自分の分だけ支払う', split_evenly: '割り勘', people: '人数', people_suffix: '人', my_items_hint: '自分が注文した品のみ', split_hint: 'テーブル合計を人数で均等に分け、カウンターで一人ずつ会計',
      counter_amount: 'カウンター会計金額', keep_screen: '会計時にスタッフへこの画面を提示してください。', back: '戻る',
      notify_counter: 'カウンターに会計を知らせる', notify_done: 'カウンターに通知しました。カウンターでお支払いください。', notify_sent: '通知済み：{count} 件 {amount}', notify_sent_split: '通知済み：{people} 人で割り勘、一人 {each}', notify_cancel: '取消',
      split_each: '一人あたり', split_remainder: '{count} 人が NT$1 多く支払います（端数はスタッフが調整）', table: 'テーブル', unpaid_items: '未会計 {count} 件', empty: 'まだ注文はありません',
      no_orders: 'まだ注文はありません。', me: '自分', paid: '支払い済み', preparing: '準備中', ready: '受け取り可', done: '受け取り済み',
      bar_policy: '三點水（3AM）は最低ご利用額 平日お一人様 NT$300・週末 NT$600、別途サービス料 10%（お持ち帰りは除く）。',
      info_title: '店舗情報', info_company: '言文字股份有限公司', info_tax_id: '統一番号 93537055', info_address: '台北市中正区重慶南路一段 11 号',
      info_prices: '料金表（現在のメニュー）', info_price_note: '価格は台湾ドル（5% 営業税込み）です。ご注文明細に基づきカウンターでお支払いください。', info_song: 'リクエスト曲（1曲）',
      info_support: 'お問い合わせ', info_support_hours: '営業時間（08:00〜翌03:00）は店頭スタッフへ、またはお電話・メールでどうぞ。',
      info_refund: '返金ポリシー', info_refund_text: '調理済みの商品は返品・交換できません。品質の問題はその場でスタッフにお知らせください。返金（オンラインカード決済を含む）はカウンターで承り、元のお支払い方法で行い、法令に基づき発票の取消または折讓単を発行します。', info_refund_link: '返金ポリシー全文',
      info_tappay: '決済サービスは TapPay が提供しています。', info_tel: '電話', info_terms: '利用規約', info_privacy: 'プライバシーポリシー',
      alcohol: '20歳未満の飲酒は禁止です。飲酒運転禁止。', add: '追加', remove: '削除', ready_banner: 'テーブル {table}｜ご注文の品ができました。カウンターでお受け取りください。',
      thanks: 'ご来店ありがとうございました。', thanks_hint: '今回のご注文は終了しました。追加のご注文はスタッフにお声がけください。', thanks_again: 'もう一度注文する',
      review_title: '本日のお食事はいかがでしたか？', review_hint: 'Google マップにレビューを投稿し、お会計の際にスタッフへお見せいただくと、会員ポイントを 5 点進呈します（会員様お一人につき 1 回）。', review_go: 'Google でレビューを書く', review_view_cart: '注文リストを見る', review_later: 'また今度',
      stock_left: '残り {n} 点', view_detail: '詳細を見る', back_menu: 'メニューに戻る', add_to_cart: '注文リストに追加', added: '追加しました', quantity: '数量', required: '必須', optional: '任意', special_request: 'その他の希望', special_placeholder: '例：ねぎ抜き、ソース別添え', sugar: '甘さ', ice: '氷', temperature: '温度', rice_amount: 'ご飯の量', noodle_amount: '麺の量', notification_prompt: '出来上がりを通知', notification_on: '通知を有効にしました', notification_unsupported: 'このブラウザは通知に対応していません。このページを開いたままにしてください。出来上がり時に画面でお知らせします。', notification_error: '通知を有効にできません：{message}。このページを開いたままにしてください。',
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
      ice: ['正常冰', '少冰', '去冰（有小碎冰）'],
      temp: ['冰', '熱'],
      rice: ['正常飯', '少飯', '飯多'],
      noodle: ['正常麵', '少麵', '麵多'],
    },
    en: {
      sugar: ['Regular', 'Less sugar', 'Half sugar', 'Light sugar', 'No sugar'],
      ice: ['Regular ice', 'Less ice', 'No ice (small crushed ice)'],
      temp: ['Iced', 'Hot'],
      rice: ['Regular rice', 'Less rice', 'Extra rice'],
      noodle: ['Regular noodles', 'Less noodles', 'Extra noodles'],
    },
    ja: {
      sugar: ['通常', '少なめ', '半分', '微糖', '無糖'],
      ice: ['通常', '少なめ', '氷なし（小さな砕氷あり）'],
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
    // 冰塊只有冰飲才顯示，且所有飲品只提供 正常（4 顆）／少冰（2 顆）／去冰（標示「有小碎冰」，KK 10/20 指示）；所有飲品不提供甜度調整。
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
    en: { 主餐: 'Main', 飲品: 'Drink', 貝果: 'Bagel', 飯糰: 'Onigiri', 甜點: 'Dessert', 麵: 'Noodles' },
    ja: { 主餐: 'メイン', 飲品: 'ドリンク', 貝果: 'ベーグル', 飯糰: 'おにぎり', 甜點: 'デザート', 麵: '麺' },
  };
  const slotLabel = (zh, lang) => (SLOT[lang] && SLOT[lang][zh]) || zh;
  const nameOf = (m, lang) => (lang === 'en' && m.en) || (lang === 'ja' && m.ja) || m.zh;
  function comboGroups(item, items, lang) {
    const groups = [];
    (item?.combo || []).forEach(slot => {
      const opts = slot.choices.map(c => {
        const pool = (items || []).filter(x => x.venue === item.venue && x.cat !== 'COMBO');
        const m = (c.id && pool.find(x => x.id === c.id)) || pool.find(x => x.zh === c.zh);
        return m ? { c, m, name: nameOf(m, lang), label: nameOf(m, lang) + (c.add > 0 ? ' (+' + c.add + ')' : '') } : null;
      }).filter(Boolean);
      if (!opts.length) return;
      groups.push({ key: slot.key, label: slotLabel(slot.label, lang), choices: opts.map(o => o.label), values: opts.map(o => o.m.zh), ids: opts.map(o => o.m.id), combo: true });
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
      out[g.key] = { id: g.ids[i < 0 ? 0 : i], zh: g.values[i < 0 ? 0 : i], note: subs.map(s => s.sub.optLabel + '：' + (picks[s.key] || s.choices[0])).join('；') };
    });
    return out;
  }
  function activeOptionGroups(groups, picks) {
    return (groups || []).filter(g => !g.when || [].concat(g.when).every(w => picks?.[w.key] === w.value));
  }

  /* 規格中文 → 英文（POS 帳本夾點餐明細用）；不在對照表的自由備註回空字串 */
  function optionEn(zh) { for (const k of Object.keys(OPT.zh)) { const i = OPT.zh[k].indexOf(zh); if (i >= 0) return OPT.en[k][i]; } return ''; }
  global.OrderLib = { TEXT, text, splitBill, optionEn, optionGroups, activeOptionGroups, comboGroups, comboPayload, slotLabel };
})(typeof window !== 'undefined' ? window : globalThis);
