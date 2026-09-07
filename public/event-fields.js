/* Fields shared by the existing event editor and server validation. */
(function(root){
const fields=[["headline", "主視覺標題"], ["kicker", "主視覺標籤"], ["section_label", "亮點區標籤"], ["section_title", "亮點區標題"], ["venue_title", "交通區標題"], ["venue_note", "交通補充"], ["venue_caption", "圖片說明"], ["faq_title", "常見問題標題"], ["closing", "頁尾標題"], ["notice", "活動須知"], ["highlight_1_title", "亮點 1 標題"], ["highlight_1_body", "亮點 1 內容"], ["highlight_2_title", "亮點 2 標題"], ["highlight_2_body", "亮點 2 內容"], ["highlight_3_title", "亮點 3 標題"], ["highlight_3_body", "亮點 3 內容"], ["faq_1_question", "問題 1"], ["faq_1_answer", "回答 1"], ["faq_2_question", "問題 2"], ["faq_2_answer", "回答 2"], ["faq_3_question", "問題 3"], ["faq_3_answer", "回答 3"], ["faq_4_question", "問題 4"], ["faq_4_answer", "回答 4"]];
if(typeof module==='object'&&module.exports)module.exports=fields;else root.EVENT_FIELDS=fields;
})(typeof window==='object'?window:globalThis);
