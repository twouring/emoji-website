#!/usr/bin/env python3
"""產生官網法務三頁（隱私權政策／服務條款／退費政策）× 三語。
內容改這支腳本後重跑：python3 tools/build-legal-pages.py
規則來源：/events#venue 須知（活動退費，已公開）、母檔 04／07（創始會員不可退費僅可轉讓）、
App 文案（會籍首次進場啟用）、消費者保護法 §19（通訊交易七日解除權）。"""
import html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
UPDATED = '2026-10-23'
CO = {
    'zh': '言文字股份有限公司（統一編號 93537055）',
    'en': 'emoji Co., Ltd. (言文字股份有限公司, Tax ID 93537055)',
    'ja': '言文字股份有限公司（統一番号 93537055）',
}
ADDR = {
    'zh': '台北市中正區重慶南路一段 11 號',
    'en': 'No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei',
    'ja': '台北市中正区重慶南路一段11号',
}
CONTACT = 'us@emoji.tw'

L = {
 'zh': dict(lang='zh-Hant', locale='zh_TW', skip='跳至主要內容', eyebrow='法務資訊', updated='最後更新',
            others='其他條款', contact='聯絡我們', lead_contact='如有任何問題，請來信',
            names={'privacy':'隱私權政策','terms':'服務條款','refund':'退費政策'},
            suffix=' · 言文字｜台灣人才聚落', prevail=''),
 'en': dict(lang='en', locale='en_US', skip='Skip to main content', eyebrow='Legal', updated='Last updated',
            others='Other policies', contact='Contact', lead_contact='Questions? Email',
            names={'privacy':'Privacy Policy','terms':'Terms of Service','refund':'Refund Policy'},
            suffix=' · emoji — Taiwan Talent Hub',
            prevail='This English version is provided for convenience. If it differs from the Traditional Chinese version, the Chinese version prevails.'),
 'ja': dict(lang='ja', locale='ja_JP', skip='メインコンテンツへ移動', eyebrow='法務情報', updated='最終更新',
            others='その他の規約', contact='お問い合わせ', lead_contact='ご不明な点はメールで',
            names={'privacy':'プライバシーポリシー','terms':'利用規約','refund':'返金ポリシー'},
            suffix=' · 言文字｜台湾タレントハブ',
            prevail='この日本語版は参考訳です。繁体字中国語版と相違がある場合は、中国語版が優先します。'),
}

# 每頁：(說明, [(小標, [段落或 ('ul', [項目])])])
P = {}
P['zh'] = {
'privacy': ('本政策說明' + CO['zh'] + '（以下稱「言文字」）在 www.emoji.tw、會員 App（app.emoji.tw）及在咖啡、三點水、等等空間門市，如何蒐集、處理與利用你的個人資料。', [
  ('一、蒐集目的', ['會員與帳號管理、會籍與等等空間進出管理、訂位與預約取餐、活動報名與票務、消費紀錄與點數、開立統一發票、客服聯繫與通知、場所安全維護，以及經去識別化的統計分析。']),
  ('二、蒐集的資料', [('ul', [
    '識別資料：姓名、Email、手機號碼；以 Google 或 LINE 登入時，取得該帳號的識別碼、顯示名稱與 Email（如有授權）。',
    '交易資料：會籍、訂位、預約取餐、消費、點數、活動報名、簽到與付款狀態。信用卡資料由金流服務商 Stripe 處理，言文字不儲存完整卡號。',
    '發票資料：你提供的載具、統一編號或捐贈碼。',
    '場所資料：等等空間的進出紀錄；會員於 03:00–08:00 無人時段進出所需的人臉辨識資料（須經會員同意後才建立）；館內監視器影像。',
    '活動報名表上，主辦人設定的問題與你的回答。'])]),
  ('三、利用期間、地區、對象與方式', [
    '期間：帳號存續期間，以及法令或會計憑證規定的保存期間；監視器影像依錄影設備循環覆寫，除調查事故所需外不另行保存。你刪除帳號或會籍終止後，人臉辨識資料即刪除。',
    '地區：台灣，以及下列服務商的資料處理所在地。',
    '對象：言文字，以及受託處理資料的服務商——金流 Stripe、雲端主機 Google Cloud、Email 寄送 Resend、簡訊 Twilio、登入服務 Google 與 LINE。你報名的活動，報名資料會提供給該場活動主辦人，僅限報名管理、簽到與活動通知使用。依法令要求時，提供給有權機關。',
    '方式：以電子或書面方式，在上述目的範圍內處理與利用。'])
  ,('四、你的權利', ['依個人資料保護法第 3 條，你可以請求查詢或閱覽、製給複製本、補充或更正、停止蒐集處理或利用，以及刪除你的個人資料。請來信 ' + CONTACT + '，我們會在確認身分後處理。你可以選擇不提供資料，但可能因此無法使用會員、訂位或報名等服務。']),
  ('五、本機儲存', ['會員 App 以瀏覽器本機儲存（localStorage）保存登入狀態、語言與離線快取；登出即清除登入狀態。']),
  ('六、資料安全', ['網站全程使用 HTTPS 加密傳輸，後台依職務設定存取權限。若發生個人資料外洩，我們會依法通知受影響的當事人。']),
  ('七、政策修訂', ['本政策修訂時公告於本頁，並更新最後更新日期。']),
]),
'terms': ('使用' + CO['zh'] + '（以下稱「言文字」）提供的餐飲、會員空間、活動與會員 App 服務，即表示你同意以下條款。', [
  ('一、服務內容', ['言文字在台北車站旁（' + ADDR['zh'] + '）經營在咖啡、三點水餐飲，以及會員空間等等空間，並透過官網與會員 App 提供會籍購買、訂位、預約取餐、活動報名與主辦等服務。各項價格與營業時間以官網公告為準。']),
  ('二、帳號', ['你可以用 Google、LINE 或 Email 建立帳號，並應提供正確資料。帳號限本人使用，不得轉借；請妥善保管登入裝置。']),
  ('三、會籍', [('ul', [
    '方案與價格以「消費方式」頁公告為準。單日 4 小時與 12 小時方案超時每小時 NT$100。',
    '會籍於首次進場時啟用，效期自啟用起算；創始會員依購買時的約定起算。',
    '有效會籍可使用等等空間會員區與所有設備。等等空間 24 小時使用為條件式啟用：03:00–08:00 為無人時段，會員以人臉辨識進出。',
    '進出 QR 與會員卡限本人使用，不得轉借或代他人進出。'])]),
  ('四、活動與場地', ['活動報名、票務、場地費、主辦人代收票款與撥款，依各活動頁與「活動與場地須知」（/events#venue）辦理。']),
  ('五、使用規範', ['請遵守館內規定與工作人員指示。禁止違法行為、騷擾他人、毀損設備，或在館內進行直銷、投資招攬、宗教及政治動員。違反者，言文字得拒絕服務、停止或終止會籍；造成損害者應負賠償責任。']),
  ('六、付款與發票', ['線上付款由 Stripe 處理。言文字依法開立統一發票。']),
  ('七、退費', ['依「退費政策」（/refund）辦理。']),
  ('八、服務變更與中斷', ['因設備維修、天災或其他不可抗力，言文字得暫停部分服務，並盡可能事先於官網或 App 公告。']),
  ('九、責任', ['個人物品請自行保管。除言文字有故意或重大過失外，對館內個人物品遺失或毀損不負賠償責任。']),
  ('十、條款修訂', ['條款修訂時公告於本頁；修訂後繼續使用服務，視為同意修訂內容。']),
  ('十一、準據法與管轄', ['本條款以中華民國法律為準據法；因本條款發生爭議，以臺灣臺北地方法院為第一審管轄法院。']),
]),
'refund': ('本政策適用於向' + CO['zh'] + '購買的會籍、活動票券、場地與餐飲。', [
  ('一、會籍', [('ul', [
    '線上購買的會籍，自付款日起 7 日內且尚未首次進場啟用者，可申請全額退款。',
    '已啟用的會籍，不退費。',
    '創始會員方案依購買時的約定：超過前項 7 日後不可退費，僅可轉讓。',
    '申請方式：來信 ' + CONTACT + '，寫明姓名、帳號 Email、付款日期。退款以原付款方式退回，入帳時間依發卡銀行作業。'])]),
  ('二、活動票券', [('ul', [
    '參加者退票依主辦人設定：接受退票時，活動開始前 8 日以前可在 App 自行退票，票價扣 10% 手續費、場地茶飲費全額退還；不接受退票時可轉讓票券。',
    '主辦人取消公開活動時，參加者全額退款。言文字因場地因素取消時，全額退款。'])]),
  ('三、包場活動場地費', [('ul', [
    '活動日 14 日前取消全額退還，前 8–13 日退 50%，7 日內不退。',
    '審核未通過全額退還；颱風等經政府公告停班停課，可全額退還或改期一次。',
    '活動日 7 日前可免費改期一次（3 個月內）。'])]),
  ('四、餐飲', ['現場點用的餐點製作後恕不退換；品質問題請當場告知店員處理。預約取餐在店家開始製作前，可於 App 自行取消。訂位不收訂金。']),
  ('五、發票', ['退款時，言文字依法作廢原發票或開立折讓單。']),
]),
}

P['en'] = {
'privacy': ('This policy explains how ' + CO['en'] + ' ("emoji", "we") collects, processes and uses your personal data on www.emoji.tw, the member App (app.emoji.tw) and at at cafe, 3AM and Stay Square.', [
  ('1. Purposes', ['Member and account management; membership and Stay Square access; table reservations and pickup orders; event registration and ticketing; purchase history and points; issuing uniform invoices; customer support and notifications; venue safety; and de-identified statistics.']),
  ('2. Data we collect', [('ul', [
    'Identity: name, email and mobile number. If you sign in with Google or LINE, we receive that account\'s ID, display name and email (if you allow it).',
    'Transactions: memberships, reservations, pickup orders, purchases, points, event registrations, check-ins and payment status. Card details are handled by our payment processor Stripe; we never store full card numbers.',
    'Invoice details: the carrier, company tax ID or donation code you provide.',
    'Venue: Stay Square entry records; face recognition data needed for entry during unstaffed hours (03:00–08:00), created only with the member\'s consent; CCTV footage.',
    'Answers to questions an event host adds to the registration form.'])]),
  ('3. Retention, location, recipients and use', [
    'Retention: for as long as your account exists and for any period required by law or accounting rules. CCTV footage is overwritten on the recorder\'s cycle unless needed to investigate an incident. Face recognition data is deleted when you delete your account or your membership ends.',
    'Location: Taiwan, and where the service providers below process data.',
    'Recipients: emoji and the providers that process data on our behalf — Stripe (payments), Google Cloud (hosting), Resend (email), Twilio (SMS), and Google and LINE (sign-in). When you register for an event, your registration is shared with that event\'s host for registration, check-in and event notices only. We disclose data to authorities when the law requires it.',
    'Use: electronically or on paper, within the purposes above.']),
  ('4. Your rights', ['Under Article 3 of Taiwan\'s Personal Data Protection Act you may request to view or copy, supplement or correct, stop the collection, processing or use of, or delete your personal data. Email ' + CONTACT + ' and we will act once we verify your identity. You may choose not to provide data, but some services (membership, reservations, registration) may then be unavailable.']),
  ('5. Local storage', ['The member App uses your browser\'s local storage to keep you signed in and to remember your language and offline cache. Signing out clears your sign-in.']),
  ('6. Security', ['The site uses HTTPS throughout and staff access is limited by role. If a data breach occurs, we will notify affected people as required by law.']),
  ('7. Changes', ['We post changes on this page and update the date above.']),
]),
'terms': ('By using the food and drink, member space, events and member App services provided by ' + CO['en'] + ' ("emoji"), you agree to these terms.', [
  ('1. Services', ['emoji runs at cafe and 3AM and the member space Stay Square by Taipei Main Station (' + ADDR['en'] + '), and offers membership purchase, reservations, pickup orders, event registration and hosting through the website and member App. Prices and hours are as published on the website.']),
  ('2. Accounts', ['You can create an account with Google, LINE or email and must provide accurate details. Accounts are personal and may not be shared; keep your signed-in devices secure.']),
  ('3. Membership', [('ul', [
    'Plans and prices are as published on the “How it works” page. Single-day 4-hour and 12-hour plans cost NT$100 per extra hour.',
    'A membership activates on your first entry and its term runs from activation; Founding Memberships run as agreed at purchase.',
    'An active membership covers the Stay Square member area and all its facilities. 24-hour access is conditional: 03:00–08:00 is unstaffed and members enter by face recognition.',
    'Entry QR codes and member cards are for the holder only and may not be lent or used to admit others.'])]),
  ('4. Events and venue', ['Event registration, ticketing, venue fees, ticket collection and host payouts follow each event page and the Events & venue guide (/events#venue).']),
  ('5. House rules', ['Follow house rules and staff instructions. Illegal activity, harassment, damaging equipment, multi-level marketing, investment solicitation and religious or political mobilization are not allowed. emoji may refuse service or suspend or end a membership for breaches; you are liable for any damage caused.']),
  ('6. Payment and invoices', ['Online payments are processed by Stripe. emoji issues uniform invoices as required by law.']),
  ('7. Refunds', ['See the Refund Policy (/en/refund).']),
  ('8. Changes and interruptions', ['emoji may suspend some services for maintenance, natural disasters or other force majeure, and will announce this on the website or App in advance where possible.']),
  ('9. Liability', ['Please look after your belongings. Except for emoji\'s intentional misconduct or gross negligence, emoji is not liable for loss of or damage to personal belongings on the premises.']),
  ('10. Changes to these terms', ['We post changes on this page; continuing to use the services means you accept them.']),
  ('11. Governing law', ['These terms are governed by the laws of the Republic of China (Taiwan). The Taiwan Taipei District Court is the court of first instance for any dispute.']),
]),
'refund': ('This policy covers memberships, event tickets, venue fees and food and drink purchased from ' + CO['en'] + '.', [
  ('1. Memberships', [('ul', [
    'A membership bought online can be refunded in full if you request it within 7 days of payment and have not yet activated it with a first entry.',
    'Activated memberships are not refundable.',
    'Founding Memberships follow the terms agreed at purchase: after the 7-day period above they are non-refundable but transferable.',
    'To request a refund, email ' + CONTACT + ' with your name, account email and payment date. Refunds go back to the original payment method; timing depends on your card issuer.'])]),
  ('2. Event tickets', [('ul', [
    'Guest refunds follow the host\'s setting: if refunds are accepted, guests can refund in the App up to 8 days before the event, minus 10% of the ticket price, with the venue and tea fee refunded in full; otherwise tickets can be transferred.',
    'If a host cancels a public event, guests are refunded in full. If emoji cancels for venue reasons, everyone is refunded in full.'])]),
  ('3. Buyout venue fees', [('ul', [
    'Refunded in full if cancelled 14+ days before the event, 50% at 8–13 days, and not refunded within 7 days.',
    'Declined applications are refunded in full; government-announced typhoon closures are refunded in full or rescheduled once.',
    'One free reschedule (within 3 months) is allowed up to 7 days before the event.'])]),
  ('4. Food and drink', ['Dishes ordered on site cannot be returned once prepared; please tell staff right away about any quality issue. Pickup orders can be cancelled in the App before the kitchen starts preparing them. Reservations require no deposit.']),
  ('5. Invoices', ['For refunds, emoji voids the original invoice or issues an allowance as required by law.']),
]),
}

P['ja'] = {
'privacy': ('本ポリシーは、' + CO['ja'] + '（以下「言文字」）が www.emoji.tw、会員アプリ（app.emoji.tw）および在咖啡・三點水・Stay Square の店舗で、個人情報をどのように収集・処理・利用するかを説明します。', [
  ('1. 利用目的', ['会員・アカウント管理、会員プランと Stay Square の入退館管理、席の予約とテイクアウト予約、イベント申込とチケット、利用履歴とポイント、統一発票の発行、お問い合わせ対応と通知、施設の安全管理、匿名化した統計分析。']),
  ('2. 収集する情報', [('ul', [
    '識別情報：氏名、メール、携帯番号。Google または LINE でログインした場合は、そのアカウントの ID、表示名、メール（許可された場合）。',
    '取引情報：会員プラン、予約、テイクアウト予約、購入、ポイント、イベント申込、チェックイン、支払い状況。カード情報は決済代行の Stripe が処理し、言文字はカード番号全体を保存しません。',
    '発票情報：ご提供いただいたキャリア、統一番号、寄付コード。',
    '施設情報：Stay Square の入退館記録、無人時間帯（03:00–08:00）の入館に必要な顔認証データ（会員の同意を得た場合のみ作成）、館内の防犯カメラ映像。',
    'イベント主催者が申込フォームに設定した質問への回答。'])]),
  ('3. 保存期間・地域・提供先・方法', [
    '期間：アカウントが存在する間、および法令や会計規則が定める保存期間。防犯カメラ映像は録画機器の循環上書きにより消去され、事故調査に必要な場合を除き別途保存しません。顔認証データはアカウント削除または会員プラン終了時に削除します。',
    '地域：台湾、および下記の委託先が処理する地域。',
    '提供先：言文字、および処理を委託するサービス事業者——Stripe（決済）、Google Cloud（サーバー）、Resend（メール送信）、Twilio（SMS）、Google と LINE（ログイン）。イベントに申し込んだ場合、申込情報はそのイベントの主催者に提供され、申込管理・チェックイン・イベント連絡にのみ利用されます。法令に基づく要請があれば関係機関に提供します。',
    '方法：電子または書面により、上記の目的の範囲内で処理・利用します。']),
  ('4. お客様の権利', ['台湾の個人資料保護法第3条に基づき、閲覧・複製、補充・訂正、収集・処理・利用の停止、削除を請求できます。' + CONTACT + ' までご連絡いただければ、本人確認のうえ対応します。情報をご提供いただかないこともできますが、その場合は会員・予約・申込などのサービスをご利用いただけないことがあります。']),
  ('5. ローカルストレージ', ['会員アプリはブラウザのローカルストレージにログイン状態、言語、オフライン用キャッシュを保存します。ログアウトするとログイン状態は消去されます。']),
  ('6. 安全管理', ['サイト全体で HTTPS を使用し、スタッフのアクセス権限は職務に応じて制限しています。個人情報の漏えいが発生した場合は、法令に従い対象の方にお知らせします。']),
  ('7. 改定', ['改定時は本ページに掲載し、最終更新日を更新します。']),
]),
'terms': (CO['ja'] + '（以下「言文字」）が提供する飲食、会員スペース、イベント、会員アプリのサービスをご利用いただくことで、以下の規約に同意したものとみなします。', [
  ('1. サービス内容', ['言文字は台北駅そば（' + ADDR['ja'] + '）で在咖啡・三點水の飲食と会員スペース Stay Square を運営し、ウェブサイトと会員アプリで会員プランの購入、予約、テイクアウト予約、イベントの申込と主催などのサービスを提供します。料金と営業時間はウェブサイトの掲載内容に従います。']),
  ('2. アカウント', ['Google、LINE、メールでアカウントを作成でき、正確な情報をご登録ください。アカウントはご本人のみ利用でき、貸与できません。ログインした端末は適切に管理してください。']),
  ('3. 会員プラン', [('ul', [
    'プランと料金は「ご利用方法」ページの掲載内容に従います。1日4時間・12時間プランの超過料金は1時間ごとに NT$100 です。',
    '会員プランは初回入場時に有効化され、有効期間はその日から起算します。創始会員は購入時の約定に従います。',
    '有効な会員プランで Stay Square の会員エリアとすべての設備を利用できます。24時間利用は条件付きで、03:00–08:00 は無人時間帯となり、会員は顔認証で入館します。',
    '入退館 QR と会員カードはご本人専用で、貸与や他人の入館に使うことはできません。'])]),
  ('4. イベントと会場', ['イベントの申込、チケット、会場費、チケット代金の代行受領と主催者への送金は、各イベントページと「イベントと会場」の案内（/events#venue）に従います。']),
  ('5. 利用ルール', ['館内ルールとスタッフの指示に従ってください。違法行為、迷惑行為、設備の損壊、マルチ商法、投資勧誘、宗教および政治的な動員は禁止です。違反した場合、言文字はサービスの提供を拒否し、会員プランを停止または終了できます。損害が生じた場合は賠償責任を負います。']),
  ('6. 支払いと発票', ['オンライン決済は Stripe が処理します。言文字は法令に従い統一発票を発行します。']),
  ('7. 返金', ['「返金ポリシー」（/ja/refund）に従います。']),
  ('8. サービスの変更・中断', ['設備の保守、天災その他の不可抗力により、一部のサービスを停止することがあります。可能な限り事前にウェブサイトまたはアプリでお知らせします。']),
  ('9. 責任', ['私物はご自身で管理してください。言文字の故意または重大な過失による場合を除き、館内での私物の紛失・破損について責任を負いません。']),
  ('10. 規約の改定', ['改定時は本ページに掲載します。改定後もサービスを利用された場合、改定内容に同意したものとみなします。']),
  ('11. 準拠法と管轄', ['本規約は中華民国（台湾）の法律に準拠し、紛争が生じた場合は台湾台北地方法院を第一審の管轄裁判所とします。']),
]),
'refund': ('本ポリシーは、' + CO['ja'] + 'から購入した会員プラン、イベントチケット、会場費、飲食に適用されます。', [
  ('1. 会員プラン', [('ul', [
    'オンラインで購入した会員プランは、支払日から7日以内で、まだ初回入場（有効化）していない場合、全額返金を申請できます。',
    '有効化済みの会員プランは返金できません。',
    '創始会員は購入時の約定に従い、上記7日間を過ぎた後は返金不可、譲渡のみ可能です。',
    '申請方法：' + CONTACT + ' に氏名、アカウントのメール、支払日を記載してご連絡ください。返金は元の支払方法に戻し、反映時期はカード会社の処理によります。'])]),
  ('2. イベントチケット', [('ul', [
    '参加者の払い戻しは主催者の設定に従います。払い戻し可の場合は開催8日前までアプリで手続きでき、チケット代の10%を差し引き、会場・お茶代は全額返金します。払い戻し不可の場合はチケットを譲渡できます。',
    '主催者が公開イベントを中止した場合は全額返金します。会場側の理由で言文字が中止した場合も全額返金します。'])]),
  ('3. 貸切イベントの会場費', [('ul', [
    '開催日の14日前までのキャンセルで全額返金、8〜13日前は50%、7日以内は返金なし。',
    '審査不承認は全額返金、政府発表の台風休業などは全額返金または1回振替。',
    '開催7日前までなら3か月以内の日程に1回無料で振替できます。'])]),
  ('4. 飲食', ['店内でご注文の料理は、調理後の返品・交換はできません。品質に問題がある場合はその場でスタッフにお知らせください。テイクアウト予約は、調理開始前ならアプリで取り消せます。席の予約にデポジットは不要です。']),
  ('5. 発票', ['返金時は、法令に従い元の発票を無効にするか、折讓（値引）証明を発行します。']),
]),
}

def e(s): return html.escape(s, quote=True)

def body(blocks):
    out = []
    for b in blocks:
        if isinstance(b, tuple) and b[0] == 'ul':
            out.append('<ul>' + ''.join(f'<li>{e(x)}</li>' for x in b[1]) + '</ul>')
        else:
            out.append(f'<p>{e(b)}</p>')
    return ''.join(out)

def url(lang, slug): return ('' if lang == 'zh' else '/' + lang) + '/' + slug

for lang, c in L.items():
    for slug in ('privacy', 'terms', 'refund'):
        lede, secs = P[lang][slug]
        title = c['names'][slug]
        others = ''.join(f'<a href="{url(lang, s)}">{e(c["names"][s])}</a>' for s in ('terms', 'privacy', 'refund') if s != slug)
        sections = ''.join(
            f'\n  <section class="about-block legal-sec"><div class="about-narrow"><h2 class="legal-h">{e(h)}</h2><div class="about-prose legal-prose">{body(bl)}</div></div></section>'
            for h, bl in secs)
        prevail = f'<p class="legal-meta">{e(c["prevail"])}</p>' if c['prevail'] else ''
        page = f'''<!DOCTYPE html>
<html lang="{c['lang']}">
<head>
<script>document.documentElement.className='js'</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#1B1A17">
<title>{e(title + c['suffix'])}</title>
<meta name="description" content="{e(lede[:150])}">
<link rel="canonical" href="https://www.emoji.tw{url(lang, slug)}">
<link rel="alternate" hreflang="zh-Hant" href="https://www.emoji.tw{url('zh', slug)}">
<link rel="alternate" hreflang="en" href="https://www.emoji.tw{url('en', slug)}">
<link rel="alternate" hreflang="ja" href="https://www.emoji.tw{url('ja', slug)}">
<link rel="alternate" hreflang="x-default" href="https://www.emoji.tw{url('zh', slug)}">
<meta property="og:locale" content="{c['locale']}">
<meta property="og:title" content="{e(title + c['suffix'])}">
<meta property="og:url" content="https://www.emoji.tw{url(lang, slug)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/nav.css">
<link rel="stylesheet" href="/about.css">
<script defer src="/nav.js"></script>
</head>
<body>
<a href="#content" class="skip-link">{e(c['skip'])}</a>

<!--SITE_HEADER-->

<main id="content" class="about-page legal-page">
  <section class="about-hero">
    <div class="about-narrow">
      <span class="eyebrow">{e(c['eyebrow'])}</span>
      <h1>{e(title)}</h1>
      <p class="lede">{e(lede)}</p>
      <p class="legal-meta">{e(c['updated'])}：{UPDATED}</p>
      {prevail}
    </div>
  </section>{sections}
  <section class="about-block"><div class="about-narrow"><h2 class="legal-h">{e(c['contact'])}</h2><div class="about-prose legal-prose"><p>{e(c['lead_contact'])} <a href="mailto:{CONTACT}">{CONTACT}</a>{'。' if lang != 'en' else '.'}</p><p>{e(CO[lang])}<br>{e(ADDR[lang])}</p></div>
    <p class="legal-others"><span>{e(c['others'])}</span>{others}</p></div></section>
</main>

<!--SITE_FOOTER-->

</body>
</html>
'''
        dest = ROOT / (f'{slug}.html' if lang == 'zh' else f'{lang}/{slug}.html')
        dest.write_text(page, encoding='utf-8')
        print('wrote', dest.relative_to(ROOT.parent))
