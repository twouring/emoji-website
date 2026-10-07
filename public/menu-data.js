/* SEED — 供 server migrate 寫入 site_content.menu（預設全部 published:true）。
   亦供後台／IG 在 DB 尚無 menu 時作 fallback 原料。
   來源：2026-10-07 定稿 Google Sheets「在咖啡菜單」（菜單＋飲料單）與「三點水菜單」（菜單＋酒單）；
   英文品名取自 10_品牌與對外溝通/菜單文案/ 設計師版中英文案。單一售價，未填 emo 即不顯示會員價。
   note＝產品內容（前台顯示於品名下方）。image＝示意圖（Unsplash），實拍後由後台上傳取代。
   強制覆寫：啟動時設 FORCE_MENU_SEED=1（勿長期開啟）。 */
'use strict';
var U = function (id) { return 'https://images.unsplash.com/photo-' + id + '?w=480&h=480&fit=crop&q=70'; };
window.__MENU_SEED = [
  // ══ 在咖啡 ══
  // ── SALAD ──
  { venue:"CAFE", cat:"SALAD", zh:"生火腿酪梨優格碗", en:"Prosciutto & Avocado Yogurt Bowl", price:320, note:"希臘優格搭配酪梨、綜合堅果、蜂蜜、生火腿、紫蘇、白葡萄、黃檸檬皮、黑胡椒、初榨橄欖油與海鹽；另附蜂蜜柚子油醋生菜沙拉。", image:U('1597776776723-0153bbc0d3ad') },
  // ── BREAD ──
  { venue:"CAFE", cat:"BREAD", zh:"燻鮭魚酪梨蒔蘿奶油開放式三明治", en:"Smoked Salmon & Avocado Open Sandwich", price:320, note:"酸種麵包搭配燻鮭魚、酪梨、綜合堅果、紫蘇、蒔蘿奶油起司抹醬、蜂蜜、黑胡椒、黃檸檬皮與炸酸豆；附蜂蜜柚子油醋沙拉與蜂蜜堅果原味優格。", image:U('1768482303665-ed751d06af5f') },
  { venue:"CAFE", cat:"BREAD", zh:"奶油松露野菇炒蛋開放式三明治", en:"Truffle Mushroom & Egg Open Sandwich", price:300, note:"酸種麵包搭配蛋沙拉、奶油炒菇、紫蘇絲、帕瑪森、黑胡椒與細香蔥；附蜂蜜柚子油醋沙拉與蜂蜜堅果原味優格。", image:U('1631637214648-2c6fd7f947ae') },
  { venue:"CAFE", cat:"BREAD", zh:"無花果核桃蜂蜜奶油貝果", en:"Fig, Walnut & Honey Cream Cheese Bagel", price:150, note:"烤貝果搭配無花果奶油起司抹醬、烤核桃、蜂蜜與海鹽，呈現果香、乳脂與堅果口感。", image:U('1707079408137-cc73e9ef71c2') },
  { venue:"CAFE", cat:"BREAD", zh:"原味貝果", en:"Plain Bagel", price:80, note:"原味貝果單點供應；可加購奶油起司與果醬，作為簡單早餐、下午茶或外帶選擇。｜奶油起司＋果醬加購 20", image:U('1726733947933-a9e406f84d9a') },
  { venue:"CAFE", cat:"BREAD", zh:"柚子胡椒雞腿貝果", en:"Yuzu Kosho Chicken Bagel", price:260, note:"烤貝果搭配柚子胡椒奶油起司抹醬、鹽麴烤雞腿、生菜、大番茄片、紫洋蔥；附蜂蜜柚子油醋沙拉與蜂蜜堅果原味優格。", image:U('1726733860096-34a3fbae77c5') },
  { venue:"CAFE", cat:"BREAD", zh:"明太子美式炒蛋可頌", en:"Mentaiko Scrambled Egg Croissant", price:320, note:"可頌搭配明太子美乃滋、美式炒蛋、細香蔥與細海苔絲；附蜂蜜柚子油醋沙拉與蜂蜜堅果原味優格。", image:U('1771285119294-96a87cd118ab') },
  // ── JAPANESE ──
  { venue:"CAFE", cat:"JAPANESE", zh:"鹽烤雞腿昆布飯糰", en:"Salt-Grilled Chicken & Kombu Onigiri", price:240, note:"白芝麻油海鹽飯底包入鹽烤雞腿，搭配細絲昆布；套餐附蜂蜜柚子油醋沙拉與柴魚醬油冷豆腐。", image:U('1696463469919-def9b2830857') },
  { venue:"CAFE", cat:"JAPANESE", zh:"海苔馬告豬肉時雨煮飯糰", en:"Nori Onigiri, Maqaw Pork Shigureni", price:220, note:"青海苔風味飯糰搭配海苔奶油雞肉與白芝麻油海鹽飯底；套餐附蜂蜜柚子油醋沙拉與柴魚醬油冷豆腐。", image:U('1696463469925-77c6b7d9f0d6') },
  { venue:"CAFE", cat:"JAPANESE", zh:"柚子紫蘇雞腿冷蕎麥麵", en:"Cold Soba, Yuzu Shiso & Chicken", price:320, note:"蕎麥麵搭配柴魚麵露、紫蘇、季節生菜、小番茄、初榨橄欖油與鹽烤雞腿；附柴魚醬油嫩豆腐。", image:U('1766634001888-5d632d62689a') },
  // ── DESSERT ──
  { venue:"CAFE", cat:"DESSERT", zh:"莓果法式吐司", en:"Berry French Toast", price:280, note:"鮮奶吐司浸牛奶蛋液煎烤，搭配牛奶冰淇淋、核桃、覆盆子莓果醬、附上海鹽焦糖醬。", image:U('1639108094328-2b94a49b1c2e') },
  { venue:"CAFE", cat:"DESSERT", zh:"自製布丁・鹹鮮奶油", en:"House Pudding, Salted Cream", price:120, note:"滑嫩自製布丁搭配帶輕微鹹味的鮮奶油，平衡甜度並增加乳脂層次。", image:U('1702728109878-c61a98d80491') },
  { venue:"CAFE", cat:"DESSERT", zh:"巴斯克蛋糕", en:"Basque Cheesecake", price:100, note:"濃郁型巴斯克乳酪蛋糕。", image:U('1638519651608-412009302a02') },
  { venue:"CAFE", cat:"DESSERT", zh:"可麗露", en:"Canelé", price:80, note:"經典可麗露，外殼焦脆、內部濕潤。", image:U('1593353994452-97b4560c50c2') },
  { venue:"CAFE", cat:"DESSERT", zh:"藍莓起司蛋糕", en:"Blueberry Cheesecake", price:100, note:"濃郁型藍莓起司蛋糕。" },
  // ── COFFEE ──
  { venue:"CAFE", cat:"COFFEE", zh:"拿鐵咖啡", en:"Latte", price:180, note:"濃縮、牛奶、奶泡。濃縮咖啡揉合香醇鮮奶，咖啡與奶香平衡，口感柔滑溫潤，留下細緻醇厚的咖啡香。加購燕麥奶 +30。", image:U('1541167760496-1628856ab772') },
  { venue:"CAFE", cat:"COFFEE", zh:"美式咖啡", en:"Americano", price:150, note:"濃縮、水。以濃縮咖啡調製，保留純粹清晰的咖啡香，口感輕盈順口，尾韻乾淨俐落。", image:U('1551030173-122aabc4489c') },
  { venue:"CAFE", cat:"COFFEE", zh:"維也納咖啡", en:"Vienna Coffee", price:180, note:"濃縮、水、鮮奶油、可可粉。醇厚咖啡覆上綿密鮮奶油，先是柔和甜香，隨後帶出咖啡微苦，滑順而富有層次。", image:U('1551198297-0a648941bd7b') },
  { venue:"CAFE", cat:"COFFEE", zh:"西西里咖啡", en:"Espresso Romano", price:180, note:"濃縮、檸檬汁、糖漿、黑糖漿、氣泡水。清新的檸檬酸香融入咖啡，明亮果香平衡咖啡微苦，酸甜清爽，尾韻乾淨俐落。", image:U('1610889556528-9a770e32642f') },
  { venue:"CAFE", cat:"COFFEE", zh:"黑糖拿鐵", en:"Brown Sugar Latte", price:190, note:"黑糖漿、濃縮、牛奶、奶泡。黑糖焦香融入濃縮咖啡與鮮奶，溫潤滑順，甜香與咖啡微苦交織，醇厚而不膩。加購燕麥奶 +30。", image:U('1653122025505-eb23942cf527') },
  { venue:"CAFE", cat:"COFFEE", zh:"柚子美式", en:"Yuzu Americano", price:180, note:"柚子果漿、美式咖啡。清新柚香遇上醇厚咖啡，微酸微甜平衡咖啡苦韻，輕盈爽口，尾韻清新淡雅。" },
  // ── BEVERAGE ──
  { venue:"CAFE", cat:"BEVERAGE", zh:"可可拿鐵", en:"Cocoa Latte", price:220, note:"可可粉、牛奶、奶泡。濃郁可可融入香醇鮮奶，口感柔滑細緻，微苦與甜香相互平衡，濃郁而不甜膩。加購燕麥奶 +30。", image:U('1542990253-0d0f5be5f0ed') },
  { venue:"CAFE", cat:"BEVERAGE", zh:"抹茶拿鐵", en:"Matcha Latte", price:220, note:"抹茶粉、牛奶、奶泡。抹茶的微苦茶韻揉合香醇鮮奶，濃郁滑順，茶香與奶香平衡，留下淡雅抹茶餘韻。加購燕麥奶 +30。", image:U('1717603545758-88cc454db69b') },
  { venue:"CAFE", cat:"BEVERAGE", zh:"黑糖牛奶", en:"Brown Sugar Milk", price:180, note:"黑糖漿、牛奶、奶泡。黑糖焦香融入香醇鮮奶，溫潤柔滑，淡淡甜香隨奶香展開，簡單而耐喝。加購燕麥奶 +30。", image:U('1553909489-ec2175ef3f52') },
  { venue:"CAFE", cat:"BEVERAGE", zh:"紅烏龍拿鐵", en:"Red Oolong Latte", price:250, note:"紅烏龍茶葉、牛奶、奶泡。紅烏龍的熟果香與焙火茶韻揉合鮮奶，醇厚溫潤，茶香清晰，尾韻帶著柔和奶香。加購燕麥奶 +30。" },
  // ── TEA ──
  { venue:"CAFE", cat:"TEA", zh:"紅烏龍", en:"Red Oolong Tea", price:220, note:"紅烏龍茶葉、熱水。熟果香伴隨細緻焙火茶韻，茶湯醇厚順口，香氣隨溫度展開，尾韻自然回甘。" },
  { venue:"CAFE", cat:"TEA", zh:"柚子紅烏龍", en:"Yuzu Red Oolong Tea", price:250, note:"柚子果漿、紅烏龍茶葉、熱水。清新柚香融入紅烏龍，明亮酸甜襯托熟果茶韻，清爽順口，留下淡雅柚香與回甘。" },
  { venue:"CAFE", cat:"TEA", zh:"果茶（壺）", en:"Fruit Tea (Pot)", price:220, note:"果茶茶葉、熱水。清新果香隨茶湯慢慢舒展，酸甜柔和而不膩，風味明亮清爽，適合悠閒品飲。", image:U('1698302659204-ab2e13ac9e55') },
  { venue:"CAFE", cat:"TEA", zh:"草本茶（壺）", en:"Herbal Tea (Pot)", price:220, note:"草本茶葉、熱水。淡雅草本香氣隨茶湯緩緩展開，清透柔和、自然舒適，適合放慢步調細細品飲。", image:U('1675155337816-5002bb718d73') },
  // ── SPARKLING ──
  { venue:"CAFE", cat:"SPARKLING", zh:"柚子氣泡", en:"Yuzu Sparkling", price:160, note:"柚子果漿、氣泡水。清新柚香搭配細緻氣泡，酸甜輕盈，明亮果香隨氣泡展開，口感清爽俐落。" },
  { venue:"CAFE", cat:"SPARKLING", zh:"莓果氣泡", en:"Berry Sparkling", price:160, note:"莓果果漿、氣泡水。莓果酸甜遇上細緻氣泡，明亮清爽，酸香與甜味平衡，留下輕盈鮮明的莓果香。", image:U('1623227314867-33230da9b493') },
  { venue:"CAFE", cat:"SPARKLING", zh:"鳳梨氣泡", en:"Pineapple Sparkling", price:160, note:"鳳梨果漿、氣泡水。鳳梨的熱帶果香搭配細緻氣泡，酸甜鮮活，果香隨氣泡展開，口感清爽輕盈。", image:U('1626388877564-269967fb8ba7') },
  // ══ 三點水 ══
  // ── COLD_APP ──
  { venue:"BAR", cat:"COLD_APP", zh:"柚香鮭魚冷盤", en:"Yuzu Salmon Crudo", price:320, note:"生鮮鮭魚搭配柚子精凍、橄欖油與鹽巴調味，以紅蔥頭、茴香增添辛香與草本氣息，搭配黃檸檬呈現鮭魚油脂、柑橘酸香與清爽風味。", image:U('1656106577512-0259bf5b9fd6') },
  { venue:"BAR", cat:"COLD_APP", zh:"酸甜梅漬焙茶番茄", en:"Plum-Pickled Tomato, Hojicha", price:120, note:"牛蕃茄搭配梅子與糖醃漬，使蕃茄吸收梅子的酸甜風味，再以焙茶粉增添淡雅茶香，呈現酸甜、清爽並帶有茶香的冷前菜。", image:U('1592417817098-8fd3d9eb14a5') },
  { venue:"BAR", cat:"COLD_APP", zh:"擔擔胡麻冷豆腐", en:"Dan Dan Sesame Cold Tofu", price:180, note:"嫩豆腐搭配清爽胡麻醬、青蔥辣油、味增絞肉，兼具滑嫩與鹹鮮。", image:U('1596352670192-5a95e357df7b') },
  // ── HOT_APP ──
  { venue:"BAR", cat:"HOT_APP", zh:"白味噌優格炙烤花椰菜", en:"Charred Broccoli, White Miso Yogurt", price:180, note:"烤花椰菜搭配白味增與無糖希臘優格製成的醬汁，以蜂蜜增添柔和甜味，蒜頭增加辛香，並以鹽巴調整風味，呈現味增鹹香及優格酸香。", image:U('1699435560767-ad4d6b7dbeb2') },
  { venue:"BAR", cat:"HOT_APP", zh:"柚子胡椒奶油炒蛤蜊", en:"Clams, Yuzu Kosho Butter", price:280, note:"炒蛤蜊以白酒、奶油與柚子胡椒烹煮。", image:U('1715249792920-bfe1a3b9d79e') },
  // ── FRIED ──
  { venue:"BAR", cat:"FRIED", zh:"酥炸唐揚雞淋川味美乃滋", en:"Karaage, Sichuan Mayo", price:280, note:"日式炸雞搭配老乾媽辣醬與美奶滋醬，呈現酸甜、麻辣與乳脂層次、柴魚香氣。", image:U('1586793783658-261cddf883ef') },
  { venue:"BAR", cat:"FRIED", zh:"爆漿紫蘇起司條沾莓果優格醬", en:"Shiso Cheese Sticks, Berry Yogurt Dip", price:220, note:"帕瑪森起司卷紫蘇葉，搭配以莓果優格沾醬。" },
  { venue:"BAR", cat:"FRIED", zh:"海苔香酥薯條附明太子美乃滋", en:"Nori Fries, Mentaiko Mayo", price:180, note:"香酥薯條搭配海苔粉增添海味與香氣，搭配明太子美乃滋，呈現薯條酥香、海苔鹹鮮與明太子濃郁鮮味的風味組合。", image:U('1630431341771-1ceb084d6607') },
  // ── GRILL ──
  { venue:"BAR", cat:"GRILL", zh:"嫩燒梅花豬蔥芥末醬", en:"Pork Collar, Charred Scallion Mustard", price:360, note:"豬梅花經鹽麴醃漬與舒肥後高溫炙烤，搭配燒蔥、日式芥末、醬油與米醋調製的醬汁。", image:U('1625477811233-044633d10dd1') },
  { venue:"BAR", cat:"GRILL", zh:"馬告鳳尾蝦阿根廷醬", en:"Maqaw Shrimp, Chimichurri", price:380, note:"鳳尾蝦搭配以馬告、巴西里、奧勒岡葉、大蒜及紅辣椒製成的阿根廷醬，加入白酒醋與橄欖油調和，以鹽、黑胡椒調味，呈現蝦肉鮮甜、馬告柑橘辛香、香草氣息與微酸微辣的清爽風味。", image:U('1559742811-822873691df8') },
  { venue:"BAR", cat:"GRILL", zh:"蒜香味噌烤節瓜", en:"Garlic Miso Zucchini", price:220, note:"櫛瓜高溫烤製，薄刷蒜味噌醬，搭配核桃碎增加穀物香與口感。", image:U('1742044609850-ed68d84c39ab') },
  // ── MAIN ──
  { venue:"BAR", cat:"MAIN", zh:"濃香味噌肉醬烏龍麵附溫泉蛋", en:"Miso Meat Sauce Udon, Onsen Egg", price:320, note:"烏龍麵搭配以赤味增、豬絞肉與牛絞肉製成的味增肉醬，加入醬油、糖及高湯調整鹹甜與濃郁度，並以蔥、薑、蒜增加辛香，最後搭配溫泉蛋，使整體呈現味增醇厚鹹香、肉醬鮮味與蛋黃滑順口。", image:U('1707201124182-099f3d98bb90') },
  { venue:"BAR", cat:"MAIN", zh:"醬香野菇蕎麥麵附溫泉蛋", en:"Soy Mushroom Soba, Onsen Egg", price:240, note:"蕎麥麵搭配鴻禧菇、美白菇與舞菇，以洋蔥、大蒜增加辛香與自然甜味，並以醬油拌炒提味，最後搭配溫泉蛋，呈現野菇鮮香、醬油鹹香與蛋黃滑順濃郁的風味。", image:U('1674516585624-422828b423f1') },
  { venue:"BAR", cat:"MAIN", zh:"炙燒明太子烤飯糰茶泡飯", en:"Grilled Mentaiko Onigiri Ochazuke", price:120, note:"醬油烤飯糰搭配炙燒明太子、海苔絲，昆布柴魚高湯供應。", image:U('1516684808441-d7ca9141e63c') },
  { venue:"BAR", cat:"MAIN", zh:"太陽蛋番茄雞肉乾咖哩", en:"Tomato Chicken Dry Curry, Sunny-Side Egg", price:200, note:"雞絞肉搭配辛甜咖哩與蕃茄糊自製成乾咖哩，以洋蔥末、大蒜末增添辛香與自然甜味，整體呈現濃郁咖哩香氣、蕃茄酸甜與雞肉鮮味，搭配太陽蛋增加滑順濃郁口感。", image:U('1679279727895-bd5c9fb9c1a0') },
  // ── SOUP ──
  { venue:"BAR", cat:"SOUP", zh:"剝皮辣椒蛤蜊雞湯", en:"Chicken & Clam Soup, Pickled Chili", price:220, note:"雞肉搭配剝皮辣椒與蛤蠣熬煮，以大蒜增加辛香，並加入剝皮辣椒醬汁增添甘甜微辣風味；結合雞肉鮮味與蛤蠣海味，呈現甘甜、微辣且鮮味濃郁的暖湯。", image:U('1680137248903-7af5d51a3350') },
  // ── SAKE ──
  { venue:"BAR", cat:"SAKE", zh:"雪之松島・海 AIR 純米原酒", en:"Yuki no Matsushima “Kai AIR” Junmai Genshu", price:450, alcohol:true, note:"有點甜，但沒有要黏著你。 柔和微甜、口感輕盈，使用宮城縣產米釀製。｜12%・90ml／杯・整瓶 720ml NT$3,200・冷藏不加冰" },
  { venue:"BAR", cat:"SAKE", zh:"雪之松島・入魂超辛＋20", en:"Yuki no Matsushima Nyukon Cho-kara +20 Honjozo", price:280, alcohol:true, note:"不愛甜？好，你坐這桌。 俐落辛口帶著圓潤米旨味；本釀造，日本酒度＋18～＋22。｜18%・90ml／杯・整瓶 720ml NT$1,900・冷藏不加冰" },
  // ── LIQUEUR ──
  { venue:"BAR", cat:"LIQUEUR", zh:"繁桝・紅紫蘇純米梅酒", en:"Shigemasu Red Shiso Junmai Umeshu", price:240, alcohol:true, note:"梅酒加紫蘇，欸，真的有差。 酸甜梅香結合清新紅紫蘇，純米酒為基底，酒色如紅寶石，口感溫和柔順。｜6%・60ml／杯・整瓶 720ml NT$2,500・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"本坊・文旦飴酒", en:"Hombo Buntan-ame (Pomelo Candy) Liqueur", price:240, alcohol:true, note:"長大了，糖果用杯子裝。 文旦的清香搭上蜜柑的濃郁果味，酸甜裡帶著日本經典「文旦飴」的懷舊糖果感。｜6%・60ml／杯・整瓶 500ml NT$1,750・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"本坊・寶星梅酒", en:"Hombo Takaraboshi Umeshu", price:180, alcohol:true, note:"想半天，還是想喝梅酒。 青梅香氣與清爽酸甜，加上蜂蜜提味，呈現經典梅酒風味。｜12%・60ml／杯・僅杯售・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"篠崎・甘王草莓梅酒", en:"Shinozaki Amaou Strawberry Umeshu", price:240, alcohol:true, note:"都看到草莓了，還要考慮嗎？ 福岡甘王草莓的鮮明香甜，搭配梅酒酸度，果香與酒香相互交織。｜6%・60ml／杯・整瓶 500ml NT$1,750・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"西吉田・八女茶梅酒", en:"Nishiyoshida Yame Tea Umeshu", price:260, alcohol:true, note:"想喝茶，也沒說不喝酒。 八女茶的清新與濃厚梅香交織，麥燒酎打底，熟成兩年以上。｜12%・60ml／杯・整瓶 720ml NT$2,600・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"堤酒造・晚白柚酒", en:"Tsutsumi Banpeiyu Pomelo Liqueur", price:260, alcohol:true, note:"有點苦，但你可能就愛這一點。 熊本晚白柚帶來鮮果香甜與酸感，尾韻留下柚皮微苦。｜8%・60ml／杯・整瓶 720ml NT$2,300・加冰" },
  { venue:"BAR", cat:"LIQUEUR", zh:"老松・御免酒柚子", en:"Oimatsu Gomenshu Yuzu Liqueur", price:280, alcohol:true, note:"柚子控不用把菜單翻完。 龍神村柚子的香氣濃厚，果實酸甜鮮明。｜8%・60ml／杯・整瓶 720ml NT$2,700・加冰" },
  // ── WINE ──
  { venue:"BAR", cat:"WINE", zh:"高畠・冰結甜白葡萄酒", en:"Takahata Hyoketsu-shibori Sweet White", price:400, alcohol:true, note:"甜點不一定用盤子。這我知道。 杏子、熟白桃、乾果與蜂蜜香，甜美濃郁。｜9.5%・60ml／杯・整瓶 500ml NT$2,800・冷藏不加冰" },
  // ── SPARKLING ──
  { venue:"BAR", cat:"SPARKLING", zh:"柚子氣泡", en:"Yuzu Sparkling", price:160, note:"柚子果漿、氣泡水。清新柚香搭配細緻氣泡，酸甜輕盈，明亮果香隨氣泡展開，口感清爽俐落。" },
  { venue:"BAR", cat:"SPARKLING", zh:"莓果氣泡", en:"Berry Sparkling", price:160, note:"莓果果漿、氣泡水。莓果酸甜遇上細緻氣泡，明亮清爽，酸香與甜味平衡，留下輕盈鮮明的莓果香。", image:U('1623227314867-33230da9b493') },
  { venue:"BAR", cat:"SPARKLING", zh:"鳳梨氣泡", en:"Pineapple Sparkling", price:160, note:"鳳梨果漿、氣泡水。鳳梨的熱帶果香搭配細緻氣泡，酸甜鮮活，果香隨氣泡展開，口感清爽輕盈。", image:U('1626388877564-269967fb8ba7') },
];
// 向後相容：舊程式碼可能仍讀 window.MENU_DATA；admin.html 會在讀到 DB 資料後覆寫此值。
window.MENU_DATA = window.__MENU_SEED;
