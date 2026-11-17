# 付款依法人分開（KK 11/11 D2）

| 法人 | 品牌 | 金流設定鍵 |
|---|---|---|
| 言文字股份有限公司（TTH） | 在咖啡 CAFE、三點水 BAR | 原本的鍵：`LINEPAY_MERCHANT_ID`、`CTBC_MPOS_*`、`EZPAY_INVOICE_*` |
| 遊遊股份有限公司（TWOURING） | 等等空間 STAY、約書旅 REST | 同名加 `:TWOURING`，例 `LINEPAY_MERCHANT_ID:TWOURING` |

唯一來源：`lib/entities.js`。

## 行為

- **不借用**：遊遊沒填的金流＝未啟用。等等空間／約書旅 POS 不列 LINE Pay、信用卡（中信）；遊遊訂單不開 ezPay 發票（補開時回「尚未設定遊遊股份有限公司的 ezPay 電子發票憑證」）。現金、轉帳、自訂收款帳戶照常。
- **發票賣方**＝訂單品項品牌的法人（`orderEntity`），開票、補開、改開、作廢都用該法人的 ezPay 商店。
- **對帳**：`linepay_transactions`／`ctbc_transactions` 新增 `entity` 欄；NULL＝言文字（舊資料不用搬）。遊遊交易 id 加 `TWOURING:` 前綴避免與言文字撞號。依時間自動歸屬只在同法人兩店間（言文字 在咖啡↔三點水、遊遊 等等空間↔約書旅）；品牌 POS 只看到、只能認領自己法人的交易，跨法人認領回 409。
- **同步**：每個法人各自一個常駐登入分頁、各自排程與鎖；同步狀態 `*_sync_state` id=1 言文字、id=2 遊遊。手動同步／匯入 API 帶 `entity: "TWOURING"`，不帶＝言文字。
- 會計對帳報表的 FNB／SPACE 分組即法人（`GROUP_OF` 由 `ENTITY_OF` 推出）。

## 上線步驟

1. 部署：開機自動 `ALTER TABLE … ADD COLUMN IF NOT EXISTS entity`，無資料搬移；言文字設定不動，行為與上線前相同。
2. 遊遊開通金流時，KK 到 admin「系統設定」填 `…（遊遊股份有限公司）` 那組（存檔即生效，不用重啟）。填好後等等空間／約書旅 POS 才會出現該付款方式、開始同步與開票。
3. 回滾：還原程式即可；`entity` 欄留著無害。
