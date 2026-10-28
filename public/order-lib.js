'use strict';
(function (global) {
  const TEXT = {
    zh: {
      gate_or: '或輸入稱呼', member_terms: '登入即同意', member_pts_label: '可用點數', member_rename: '更改稱呼', member_redeem_title: '用點數兌換', member_need: '需 {n} 點', member_short: '還差 {n} 點', member_logout_confirm: '確定登出會員？已點的餐點不受影響。', gate_login_hint: '會員累點・享會員價', member_title: '會員', member_hint: '登入會員，累點享會員價', member_google: '使用 Google 登入', member_line: '使用 LINE 登入', member_logout: '登出', member_points: '{n} 點', member_active: '會員價適用', member_plain: '結帳自動累點', member_redeem: '兌換', member_redeem_confirm: '用 {n} 點兌換「{name}」？會直接加進這桌已點清單。', member_redeemed: '已兌換「{name}」，剩 {n} 點', member_price: '會員',
      tip_title: '打賞', info_tip_free: '自由金額', tip_card: '喜歡今晚的表演？打賞一下', tip_card_to: '打賞給 {name}', tip_to: '打賞給 {name}。', tip_hint: '金額自己填（上限 NT${max}）。送出後由店員確認，確認後記在這桌帳上、用餐完一起結帳，店裡會播你選的音效。打賞全額轉交表演者，不開發票。', tip_amount: '金額', tip_sound: '選一個音效（點一下試聽）', tip_send: '送出打賞', tip_send_amt: '打賞 {amt}', tip_bad: '請填 1–{max} 元的整數。', tip_confirm: '打賞 {amt}，播放「{sfx}」？店員確認後會記在這桌帳上，用餐完一起結帳。', tip_done: '已送出，等店員確認後播放音效。謝謝你的打賞！', tip_pending: '等店員確認：{amt}', tip_confirmed: '已確認 {amt}，謝謝你的打賞！', tip_rejected: '店員未收這筆打賞，有問題請洽服務人員。',
      inst_title: '把言文字 App 加到主畫面', inst_sub: '會員卡、點數、訂位都在這裡，下次點餐也從這裡開。', inst_btn: '加到主畫面', inst_later: '稍後', inst_ok: '知道了', inst_done: '已加到主畫面', inst_ios_title: '加到主畫面', inst_ios_1: '點 Safari 下方的「分享」圖示（方框加向上箭頭）', inst_ios_2: '往下滑，選「加入主畫面」', inst_ios_3: '按右上角「新增」，主畫面就會出現言文字 App', inst_inapp_title: '請先用瀏覽器開啟', inst_inapp_1: '點畫面角落的「⋯」選單', inst_inapp_2: '選「用預設瀏覽器開啟」（Safari／Chrome）', inst_inapp_3: '開啟後再按「加到主畫面」', fb_title: '意見回饋', fb_card: '點餐好不好用、餐點、服務，都歡迎告訴我們', fb_hint: '您的意見會直接送到店長，我們每天都會看。', fb_kind: '想回饋什麼？', fb_rating: '整體滿意度（選填）', fb_placeholder: '請寫下您的建議或遇到的問題', fb_send: '送出回饋', fb_sent: '謝謝您的回饋！', fb_pick: '請先選擇回饋類別', fb_empty: '請寫下您的意見',
      call_btn: '呼叫', call_title: '呼叫服務', call_hint: '選一項，店員馬上過來。不會加進帳單。', call_send: '通知店員', call_note: '想請店員幫什麼？（選填）', call_sent: '已通知店員，請稍候。', call_waiting: '已通知店員：{kinds}', call_done: '店員已處理：{kinds}', call_wait: '{n} 秒後可再呼叫', call_pick: '請先選一項',
      song_popular: '熱門', song_recent: '最近點過', song_chart: '排行榜', song_queued: '已在待播', song_times: '點過 {n} 次', song_none_yet: '還沒有人點過歌，搜尋看看或看排行榜。', song_chart_empty: '排行榜暫時讀不到，請改用搜尋。',
      song_title: '點歌', song_card: '點一首歌在店裡播放', song_price: '每首 NT${price}，記在這桌帳上', song_search: '搜尋歌名或歌手', song_search_btn: '搜尋', song_searching: '搜尋中…', song_now: '正在播放', song_queue: '待播清單', song_queue_empty: '目前沒有人點歌。', song_pick: '點這首', song_picked: '已點歌！排在第 {n} 首。', song_confirm: '點「{title}」？NT${price} 會記在這桌帳上，用餐完一起結帳。', song_mine: '本桌', song_none: '找不到可以播放的歌，換個關鍵字試試。', song_hint: '長度上限 {min} 分鐘；每桌同時最多排 {max} 首。', song_playlist: '店內歌單',
      order: '桌邊點餐', loading: '載入中…', name_placeholder: '你的稱呼，例如：小明', confirm: '好',
      name_gate_title: '歡迎點餐', name_gate_submit: '查看菜單', name_skip: '略過', ordering_as: '點餐稱呼', name_edit: '更改', back_step: '上一步', served_banner: '桌號 {table}｜{items} 已送到桌上',
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
      gate_or: 'or enter a name', member_terms: 'By signing in you agree to our', member_pts_label: 'points', member_rename: 'Change name', member_redeem_title: 'Redeem with points', member_need: '{n} pts', member_short: '{n} pts short', member_logout_confirm: 'Sign out? Your order stays as is.', gate_login_hint: 'Members earn points & get member prices', member_title: 'Member', member_hint: 'Sign in to earn points', member_google: 'Continue with Google', member_line: 'Continue with LINE', member_logout: 'Sign out', member_points: '{n} pts', member_active: 'Member prices on', member_plain: 'Earning points', member_redeem: 'Redeem', member_redeem_confirm: 'Redeem “{name}” for {n} points? It will be added to this table.', member_redeemed: 'Redeemed “{name}”. {n} points left', member_price: 'Member',
      tip_title: 'Tip the performer', info_tip_free: 'Any amount', tip_card: 'Enjoying the show? Leave a tip', tip_card_to: 'Tip {name}', tip_to: 'Tip for {name}.', tip_hint: 'Enter any amount (up to NT${max}). Staff will confirm it, then it is added to your table bill and your sound effect plays in the shop. Tips go in full to the performer; no invoice is issued for them.', tip_amount: 'Amount', tip_sound: 'Pick a sound effect (tap to preview)', tip_send: 'Send tip', tip_send_amt: 'Tip {amt}', tip_bad: 'Please enter a whole number from 1 to {max}.', tip_confirm: 'Tip {amt} and play "{sfx}"? Once staff confirm, it will be added to your table bill.', tip_done: 'Sent! Your sound will play once staff confirm. Thank you!', tip_pending: 'Waiting for staff: {amt}', tip_confirmed: 'Confirmed {amt}. Thank you!', tip_rejected: 'Staff did not accept this tip. Please ask a staff member.',
      inst_title: 'Add the emoji app to your home screen', inst_sub: 'Member card, points and reservations in one place. Order from here next time too.', inst_btn: 'Add to home screen', inst_later: 'Later', inst_ok: 'Got it', inst_done: 'Added to home screen', inst_ios_title: 'Add to home screen', inst_ios_1: 'Tap the Share icon in Safari (square with an arrow)', inst_ios_2: 'Scroll down and choose “Add to Home Screen”', inst_ios_3: 'Tap “Add”. The emoji app appears on your home screen', inst_inapp_title: 'Open in your browser first', inst_inapp_1: 'Tap the “⋯” menu in the corner', inst_inapp_2: 'Choose “Open in browser” (Safari / Chrome)', inst_inapp_3: 'Then tap “Add to home screen” again', fb_title: 'Feedback', fb_card: 'Tell us about the ordering app, food or service', fb_hint: 'Your feedback goes straight to the store manager. We read it every day.', fb_kind: 'What is it about?', fb_rating: 'Overall rating (optional)', fb_placeholder: 'Your suggestion or the problem you ran into', fb_send: 'Send feedback', fb_sent: 'Thank you for your feedback!', fb_pick: 'Please choose a topic first', fb_empty: 'Please write your feedback',
      call_btn: 'Call staff', call_title: 'Call staff', call_hint: 'Pick one and a staff member will come over. Not added to your bill.', call_send: 'Notify staff', call_note: 'What do you need? (optional)', call_sent: 'Staff notified. Someone will be right with you.', call_waiting: 'Staff notified: {kinds}', call_done: 'Handled: {kinds}', call_wait: 'You can call again in {n}s', call_pick: 'Please pick one first',
      song_popular: 'Popular here', song_recent: 'Recently requested', song_chart: 'Top charts', song_queued: 'In queue', song_times: 'Requested {n}×', song_none_yet: 'No requests yet. Try search or the charts.', song_chart_empty: 'Charts are unavailable right now. Please use search.',
      song_title: 'Song request', song_card: 'Request a song to play in the shop', song_price: 'NT${price} per song, added to your table bill', song_search: 'Search a song or artist', song_search_btn: 'Search', song_searching: 'Searching…', song_now: 'Now playing', song_queue: 'Up next', song_queue_empty: 'No requests yet.', song_pick: 'Request', song_picked: 'Requested! It is #{n} in the queue.', song_confirm: 'Request "{title}"? NT${price} will be added to your table bill.', song_mine: 'Your table', song_none: 'No playable songs found. Try another keyword.', song_hint: 'Up to {min} min per song; up to {max} songs per table in the queue.', song_playlist: 'House playlist',
      order: 'Table ordering', loading: 'Loading…', name_placeholder: 'Your name (so your table knows what you ordered)', confirm: 'Save',
      name_gate_title: 'Welcome', name_gate_submit: 'View menu', name_skip: 'Skip', ordering_as: 'Ordering as', name_edit: 'Change', back_step: 'Back', served_banner: 'Table {table} | {items} served',
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
      gate_or: 'または名前を入力', member_terms: 'ログインで同意：', member_pts_label: 'ポイント', member_rename: '名前を変更', member_redeem_title: 'ポイントで交換', member_need: '{n} pt 必要', member_short: 'あと {n} pt', member_logout_confirm: 'ログアウトしますか？注文はそのままです。', gate_login_hint: '会員はポイント・会員価格', member_title: '会員', member_hint: 'ログインでポイント', member_google: 'Google でログイン', member_line: 'LINE でログイン', member_logout: 'ログアウト', member_points: '{n} pt', member_active: '会員価格適用', member_plain: 'ポイント加算', member_redeem: '交換', member_redeem_confirm: '{n} ポイントで「{name}」を交換しますか？このテーブルの注文に追加されます。', member_redeemed: '「{name}」を交換しました。残り {n} pt', member_price: '会員',
      tip_title: '投げ銭', info_tip_free: '金額自由', tip_card: '演奏が気に入ったら投げ銭を', tip_card_to: '{name} に投げ銭', tip_to: '{name} への投げ銭。', tip_hint: '金額は自由（上限 NT${max}）。スタッフが確認後、テーブルのお会計に加算され、選んだ効果音が店内で流れます。投げ銭は全額演者に渡し、レシート（発票）は発行しません。', tip_amount: '金額', tip_sound: '効果音を選ぶ（タップで試聴）', tip_send: '投げ銭する', tip_send_amt: '{amt} を投げ銭', tip_bad: '1〜{max} の整数で入力してください。', tip_confirm: '{amt} を投げ銭して「{sfx}」を流しますか？スタッフ確認後、お会計に加算されます。', tip_done: '送信しました。スタッフ確認後に効果音が流れます。ありがとうございます！', tip_pending: 'スタッフ確認待ち：{amt}', tip_confirmed: '{amt} 確認済み。ありがとうございます！', tip_rejected: 'この投げ銭は受け付けられませんでした。スタッフにお声がけください。',
      inst_title: '言文字アプリをホーム画面に追加', inst_sub: '会員カード・ポイント・予約をひとつに。次回の注文もここから。', inst_btn: 'ホーム画面に追加', inst_later: 'あとで', inst_ok: 'OK', inst_done: 'ホーム画面に追加しました', inst_ios_title: 'ホーム画面に追加', inst_ios_1: 'Safari の「共有」アイコン（四角と上矢印）をタップ', inst_ios_2: '下にスクロールして「ホーム画面に追加」を選択', inst_ios_3: '右上の「追加」をタップすると言文字アプリが表示されます', inst_inapp_title: 'まずブラウザで開いてください', inst_inapp_1: '画面の隅の「⋯」メニューをタップ', inst_inapp_2: '「ブラウザで開く」（Safari／Chrome）を選択', inst_inapp_3: '開いたら、もう一度「ホーム画面に追加」をタップ', fb_title: 'ご意見', fb_card: '注文画面・料理・サービスのご感想をお聞かせください', fb_hint: 'いただいたご意見は店長に直接届き、毎日確認しています。', fb_kind: 'どの内容についてですか？', fb_rating: '総合評価（任意）', fb_placeholder: 'ご提案やお困りの点をご記入ください', fb_send: '送信する', fb_sent: 'ご意見ありがとうございます！', fb_pick: '項目を選んでください', fb_empty: 'ご意見をご記入ください',
      call_btn: '呼び出し', call_title: 'スタッフ呼び出し', call_hint: '項目を選ぶとスタッフが伺います。お会計には加算されません。', call_send: 'スタッフに知らせる', call_note: 'ご用件（任意）', call_sent: 'スタッフに知らせました。少々お待ちください。', call_waiting: '呼び出し中：{kinds}', call_done: '対応済み：{kinds}', call_wait: '{n} 秒後に再度呼び出せます', call_pick: '項目を選んでください',
      song_popular: '人気', song_recent: '最近のリクエスト', song_chart: 'ランキング', song_queued: '再生待ち', song_times: '{n} 回リクエスト', song_none_yet: 'まだリクエストはありません。検索かランキングからどうぞ。', song_chart_empty: 'ランキングを読み込めません。検索をご利用ください。',
      song_title: 'リクエスト曲', song_card: '店内で流す曲をリクエスト', song_price: '1曲 NT${price}、テーブルのお会計に加算', song_search: '曲名・アーティストで検索', song_search_btn: '検索', song_searching: '検索中…', song_now: '再生中', song_queue: '再生待ち', song_queue_empty: 'まだリクエストはありません。', song_pick: 'リクエスト', song_picked: 'リクエストしました。{n} 番目に再生します。', song_confirm: '「{title}」をリクエストしますか？NT${price} がお会計に加算されます。', song_mine: 'このテーブル', song_none: '再生できる曲が見つかりません。別のキーワードでお試しください。', song_hint: '1曲 {min} 分まで／1テーブル同時 {max} 曲まで。', song_playlist: '店内プレイリスト',
      order: 'テーブル注文', loading: '読み込み中…', name_placeholder: 'お名前（同じテーブルで確認するため）', confirm: '保存',
      name_gate_title: 'ようこそ', name_gate_submit: 'メニューを見る', name_skip: 'スキップ', ordering_as: 'ご注文者', name_edit: '変更', back_step: '戻る', served_banner: 'テーブル {table}｜{items} をお届けしました',
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
  // 韓文（KK 10/28）：介面字串；菜單品名／產品內容沒有韓文時退回英文
  TEXT.ko = {
   "gate_or": "또는 이름 입력",
   "member_terms": "로그인하면 다음에 동의하게 됩니다",
   "member_pts_label": "포인트",
   "member_rename": "이름 변경",
   "member_redeem_title": "포인트로 교환",
   "member_need": "{n}P 필요",
   "member_short": "{n}P 부족",
   "member_logout_confirm": "로그아웃할까요? 주문 내역은 그대로 유지됩니다.",
   "gate_login_hint": "회원은 포인트 적립과 회원가 혜택을 받아요",
   "member_title": "회원",
   "member_hint": "로그인하고 포인트를 적립하세요",
   "member_google": "Google로 계속하기",
   "member_line": "LINE으로 계속하기",
   "member_logout": "로그아웃",
   "member_points": "{n}P",
   "member_active": "회원가 적용 중",
   "member_plain": "포인트 적립 중",
   "member_redeem": "교환",
   "member_redeem_confirm": "{n}포인트로 “{name}”을(를) 교환할까요? 이 테이블에 추가됩니다.",
   "member_redeemed": "“{name}” 교환 완료. 남은 포인트 {n}P",
   "member_price": "회원가",
   "tip_title": "팁 보내기",
   "info_tip_free": "자유 금액",
   "tip_card": "공연이 마음에 드셨나요? 팁을 보내 주세요",
   "tip_card_to": "{name}에게 팁 보내기",
   "tip_to": "{name}에게 보내는 팁입니다.",
   "tip_hint": "금액을 자유롭게 입력하세요 (최대 NT${max}). 직원이 확인하면 테이블 계산서에 추가되고, 선택한 효과음이 매장에서 재생됩니다. 팁은 전액 공연자에게 전달되며 영수증은 발행되지 않습니다.",
   "tip_amount": "금액",
   "tip_sound": "효과음 선택 (탭하면 미리 듣기)",
   "tip_send": "팁 보내기",
   "tip_send_amt": "{amt} 팁 보내기",
   "tip_bad": "1부터 {max} 사이의 정수를 입력해 주세요.",
   "tip_confirm": "{amt} 팁을 보내고 \"{sfx}\"을(를) 재생할까요? 직원이 확인하면 테이블 계산서에 추가됩니다.",
   "tip_done": "전송 완료! 직원이 확인하면 효과음이 재생됩니다. 감사합니다!",
   "tip_pending": "직원 확인 대기 중: {amt}",
   "tip_confirmed": "{amt} 확인 완료. 감사합니다!",
   "tip_rejected": "직원이 이 팁을 받지 않았습니다. 직원에게 문의해 주세요.",
   "inst_title": "emoji 앱을 홈 화면에 추가하기",
   "inst_sub": "회원 카드, 포인트, 예약을 한곳에서. 다음 주문도 여기서 시작하세요.",
   "inst_btn": "홈 화면에 추가",
   "inst_later": "나중에",
   "inst_ok": "확인",
   "inst_done": "홈 화면에 추가되었습니다",
   "inst_ios_title": "홈 화면에 추가",
   "inst_ios_1": "Safari의 공유 아이콘(화살표가 있는 사각형)을 탭하세요",
   "inst_ios_2": "아래로 스크롤해 “홈 화면에 추가”를 선택하세요",
   "inst_ios_3": "“추가”를 탭하면 emoji 앱이 홈 화면에 생깁니다",
   "inst_inapp_title": "먼저 브라우저에서 열어 주세요",
   "inst_inapp_1": "모서리의 “⋯” 메뉴를 탭하세요",
   "inst_inapp_2": "“브라우저에서 열기”(Safari / Chrome)를 선택하세요",
   "inst_inapp_3": "그다음 “홈 화면에 추가”를 다시 탭하세요",
   "fb_title": "의견 보내기",
   "fb_card": "주문 화면, 음식, 서비스에 대한 의견을 들려주세요",
   "fb_hint": "보내 주신 의견은 매장 매니저에게 바로 전달되며, 매일 확인합니다.",
   "fb_kind": "어떤 내용인가요?",
   "fb_rating": "전체 만족도 (선택)",
   "fb_placeholder": "제안하실 내용이나 불편했던 점을 적어 주세요",
   "fb_send": "의견 보내기",
   "fb_sent": "의견 감사합니다!",
   "fb_pick": "먼저 항목을 선택해 주세요",
   "fb_empty": "의견을 입력해 주세요",
   "call_btn": "직원 호출",
   "call_title": "직원 호출",
   "call_hint": "항목을 선택하면 직원이 바로 갑니다. 계산서에는 추가되지 않아요.",
   "call_send": "직원에게 알리기",
   "call_note": "필요하신 것을 적어 주세요 (선택)",
   "call_sent": "직원에게 알렸습니다. 잠시만 기다려 주세요.",
   "call_waiting": "직원 호출 중: {kinds}",
   "call_done": "처리 완료: {kinds}",
   "call_wait": "{n}초 후 다시 호출할 수 있어요",
   "call_pick": "먼저 항목을 선택해 주세요",
   "song_popular": "매장 인기곡",
   "song_recent": "최근 신청곡",
   "song_chart": "인기 차트",
   "song_queued": "대기열에 있음",
   "song_times": "{n}회 신청됨",
   "song_none_yet": "아직 신청곡이 없어요. 검색하거나 차트에서 골라 보세요.",
   "song_chart_empty": "지금은 차트를 불러올 수 없어요. 검색을 이용해 주세요.",
   "song_title": "노래 신청",
   "song_card": "매장에서 틀 노래를 신청하세요",
   "song_price": "곡당 NT${price}, 테이블 계산서에 추가됩니다",
   "song_search": "노래 제목이나 가수 검색",
   "song_search_btn": "검색",
   "song_searching": "검색 중…",
   "song_now": "지금 재생 중",
   "song_queue": "다음 곡",
   "song_queue_empty": "아직 신청곡이 없어요.",
   "song_pick": "신청",
   "song_picked": "신청 완료! 대기열 {n}번째입니다.",
   "song_confirm": "\"{title}\"을(를) 신청할까요? NT${price}이(가) 테이블 계산서에 추가됩니다.",
   "song_mine": "우리 테이블",
   "song_none": "재생 가능한 노래가 없어요. 다른 검색어로 찾아보세요.",
   "song_hint": "곡당 최대 {min}분, 테이블당 대기열에 최대 {max}곡까지 신청할 수 있어요.",
   "song_playlist": "매장 플레이리스트",
   "order": "테이블 주문",
   "loading": "불러오는 중…",
   "name_placeholder": "이름 (같은 테이블에서 누가 무엇을 주문했는지 알 수 있어요)",
   "confirm": "저장",
   "name_gate_title": "환영합니다",
   "name_gate_submit": "메뉴 보기",
   "name_skip": "건너뛰기",
   "ordering_as": "주문자",
   "name_edit": "변경",
   "back_step": "뒤로",
   "served_banner": "{table}번 테이블 | {items} 서빙 완료",
   "shared_hint": "같은 테이블의 모두가 같은 QR 코드를 스캔할 수 있어요. 메뉴를 담고 \"주문 보내기\"를 누른 뒤, 식사 후 카운터에서 결제하세요. 함께, 각자 주문한 메뉴별, 또는 균등 분할로 결제할 수 있어요.",
   "place": "주문 보내기",
   "place_n": "{count}개 주문 보내기",
   "n_items": "{count}개",
   "place_with_others": "{count}개 주문 보내기 ({others} 포함)",
   "place_confirm": "같은 테이블의 다른 분이 아직 보내지 않은 메뉴도 함께 보내집니다: {others}. 지금 보낼까요?",
   "someone_added": "{name}님이 {items}을(를) 추가했어요",
   "someone_removed": "{name}님이 {items}을(를) 삭제했어요",
   "others_pending_hint": "같은 테이블의 다른 분이 보내지 않은 메뉴도 함께 보내집니다",
   "placed": "주문됨",
   "served": "서빙 완료",
   "not_sent": "아직 안 보냄",
   "place_done": "주문이 전송되었습니다. 지금 준비 중이에요. 식사 후 카운터에서 결제해 주세요!",
   "pay_reminder": "나가시기 전에 카운터에서 결제해 주세요. 직원이 이 테이블의 주문 내역으로 계산합니다.",
   "pending_items": "아직 보내지 않은 메뉴 {count}개",
   "current_menu": "현재 메뉴",
   "closed": "주문 마감",
   "menu_unavailable": "아직 이용 가능한 메뉴가 없어요.",
   "closed_message": "지금은 주문이 마감되었습니다. 잠시 후 다시 시도해 주세요.",
   "last_order": "마지막 주문",
   "cafe_last_order": "음식 16:00까지 · 음료 16:30까지",
   "bar_last_order": "음식 02:00까지 · 음료 02:30까지",
   "cafe_food_closed": "음식 주문은 16:00에 마감 · 음료는 16:30까지",
   "bar_food_closed": "음식 주문은 02:00에 마감 · 음료는 02:30까지",
   "cart": "주문 목록",
   "checkout": "식사 후 결제",
   "table_order": "테이블 주문 내역",
   "unpaid_total": "미결제 합계",
   "continue": "계속 주문하기",
   "checkout_title": "식사 후 카운터에서 결제",
   "checkout_hint": "먼저 식사를 즐기세요. 나가시기 전에 이 화면을 카운터에 보여 주시면 직원이 금액을 확인합니다.",
   "whole_table": "테이블 전체 결제",
   "my_items": "내 메뉴만 결제",
   "split_evenly": "균등 분할",
   "people": "인원",
   "people_suffix": "명",
   "my_items_hint": "내가 주문한 메뉴만",
   "split_hint": "테이블 합계를 균등하게 나누고, 카운터에서 1인당 결제합니다",
   "counter_amount": "카운터 결제 금액",
   "keep_screen": "이 화면을 열어 두고 결제할 때 직원에게 보여 주세요.",
   "back": "주문으로 돌아가기",
   "notify_counter": "카운터에 결제 요청 알리기",
   "notify_done": "카운터에 알렸습니다. 카운터에서 결제해 주세요.",
   "notify_sent": "카운터에 알림: {count}개 {amount}",
   "notify_sent_split": "카운터에 알림: {people}명 분할, 1인당 {each}",
   "notify_cancel": "취소",
   "split_each": "1인당",
   "split_remainder": "{count}명은 NT$1을 더 내며, 잔액은 직원이 조정합니다",
   "table": "테이블",
   "unpaid_items": "미결제 {count}개",
   "empty": "담은 메뉴가 없어요",
   "no_orders": "아직 아무도 주문하지 않았어요.",
   "me": "나",
   "paid": "결제 완료",
   "preparing": "준비 중",
   "ready": "픽업 가능",
   "done": "픽업 완료",
   "bar_policy": "3AM 최소 주문 금액: 평일 1인 NT$300, 주말 NT$600, 별도 10% 봉사료 (포장 제외).",
   "info_title": "매장 정보",
   "info_company": "emoji Co., Ltd. (言文字股份有限公司)",
   "info_tax_id": "사업자번호 93537055",
   "info_address": "No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei",
   "info_prices": "가격표 (현재 메뉴)",
   "info_price_note": "가격은 대만 달러(TWD)이며 5% 영업세가 포함되어 있습니다. 주문 내역에 따라 카운터에서 결제합니다.",
   "info_song": "노래 신청 (1곡)",
   "info_support": "고객 문의",
   "info_support_hours": "영업시간(08:00–03:00)에는 매장 직원에게 문의하시거나 전화·이메일로 연락해 주세요.",
   "info_refund": "환불 정책",
   "info_refund_text": "조리된 음식과 음료는 반품·교환이 불가합니다. 품질 문제는 현장에서 직원에게 바로 알려 주세요. 환불(온라인 카드 결제 포함)은 카운터에서 처리하며 원래 결제 수단으로 환불되고, 법에 따라 영수증을 취소하거나 할인 증명서를 발행합니다.",
   "info_refund_link": "전체 환불 정책",
   "info_tappay": "결제 서비스는 TapPay가 제공합니다.",
   "info_tel": "전화",
   "info_terms": "이용약관",
   "info_privacy": "개인정보처리방침",
   "alcohol": "만 18세 미만 음주 금지. 음주운전 금지.",
   "add": "추가",
   "remove": "삭제",
   "ready_banner": "{table}번 테이블 | 주문하신 메뉴가 준비되었습니다. 카운터에서 픽업해 주세요.",
   "thanks": "이용해 주셔서 감사합니다. 또 만나요.",
   "thanks_hint": "이번 주문은 종료되었습니다. 다시 주문하시려면 직원에게 문의해 주세요.",
   "thanks_again": "다시 주문하기",
   "review_title": "오늘 식사는 어떠셨나요?",
   "review_hint": "Google 지도에 리뷰를 남기고 결제할 때 직원에게 보여 주세요. 회원에게 5포인트를 드립니다 (회원당 1회).",
   "review_go": "Google 리뷰 쓰기",
   "review_view_cart": "주문 목록 보기",
   "review_later": "나중에",
   "stock_left": "{n}개 남음",
   "view_detail": "자세히",
   "back_menu": "메뉴로 돌아가기",
   "add_to_cart": "주문 목록에 담기",
   "added": "담았어요",
   "quantity": "수량",
   "required": "필수",
   "optional": "선택",
   "special_request": "기타 요청",
   "special_placeholder": "예: 파 빼 주세요, 소스 따로",
   "sugar": "당도",
   "ice": "얼음",
   "temperature": "온도",
   "rice_amount": "밥 양",
   "noodle_amount": "면 양",
   "notification_prompt": "준비되면 알림 받기",
   "notification_on": "알림 켜짐",
   "notification_unsupported": "이 브라우저는 알림을 지원하지 않아요. 이 페이지를 열어 두시면 준비되었을 때 화면에 알려 드립니다.",
   "notification_error": "알림을 켤 수 없습니다: {message}. 화면 알림을 받으려면 이 페이지를 열어 두세요."
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
    ko: {
      sugar: ['보통', '적게', '반', '약간', '무설탕'],
      ice: ['보통 얼음', '얼음 적게', '얼음 없이 (잘게 부순 얼음 약간)'],
      temp: ['아이스', '핫'],
      rice: ['보통', '적게', '많이'],
      noodle: ['보통', '적게', '많이'],
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
    const l = lang === 'en' || lang === 'ja' || lang === 'ko' ? lang : 'zh';
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
    ko: { 主餐: '메인', 飲品: '음료', 貝果: '베이글', 飯糰: '주먹밥', 甜點: '디저트', 麵: '면' },
  };
  const slotLabel = (zh, lang) => (SLOT[lang] && SLOT[lang][zh]) || zh;
  const nameOf = (m, lang) => (lang === 'en' && m.en) || (lang === 'ja' && m.ja) || (lang === 'ko' && (m.ko || m.en)) || m.zh;
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
  const LANGS = [{ id: 'zh', name: '中文' }, { id: 'en', name: 'English' }, { id: 'ja', name: '日本語' }, { id: 'ko', name: '한국어' }];
  global.OrderLib = { LANGS, TEXT, text, splitBill, optionEn, optionGroups, activeOptionGroups, comboGroups, comboPayload, slotLabel };
})(typeof window !== 'undefined' ? window : globalThis);
