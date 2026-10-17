'use strict';
// Payment API, deliberately separate from the merchant-center reconciliation scraper.
function configuration(env=process.env){
  const blockers=[],hasSecret=typeof env.LINEPAY_OFFLINE_CHANNEL_SECRET==='string'&&env.LINEPAY_OFFLINE_CHANNEL_SECRET.trim().length>0;
  if(env.LINEPAY_OFFLINE_ENABLED!=='1')blockers.push('LINE Pay API 收款尚未啟用');
  if(!['sandbox','production'].includes(env.LINEPAY_OFFLINE_ENV))blockers.push('請設定獨立的 sandbox／production 收款環境');
  if(!/^\d{6,20}$/.test(env.LINEPAY_OFFLINE_CHANNEL_ID||''))blockers.push('缺少 LINE Pay 付款 API Channel ID（不是商家帳號）');
  if(!hasSecret)blockers.push('缺少 LINE Pay 付款 API Channel secret（不是商家密碼）');
  if(env.LINEPAY_OFFLINE_V2_APPROVED!=='1')blockers.push('需 LINE Pay 確認 Offline v2 非 EPI 收款權限，並在商家中心關聯 @338ymhys');
  const canQuery=['sandbox','production'].includes(env.LINEPAY_OFFLINE_ENV)&&/^\d{6,20}$/.test(env.LINEPAY_OFFLINE_CHANNEL_ID||'')&&hasSecret;
  return {enabled:!blockers.length,canQuery,blockers,mode:env.LINEPAY_OFFLINE_ENV,channel:env.LINEPAY_OFFLINE_CHANNEL_ID,secret:env.LINEPAY_OFFLINE_CHANNEL_SECRET};
}
const fail=(status,message)=>Object.assign(Error(message),{status});
function createClient({env=process.env,fetcher=fetch}={}){
  async function request(path,data,config){
    const cfg=config||configuration(env);if(!(data?cfg.enabled:cfg.canQuery))throw fail(503,cfg.blockers.join('；'));
    const host=cfg.mode==='production'?'https://api-pay.line.me':'https://sandbox-api-pay.line.me';
    const res=await fetcher(host+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-LINE-ChannelId':cfg.channel,'X-LINE-ChannelSecret':cfg.secret},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(data?45000:25000)});
    if(!res.ok)throw fail(502,'LINE Pay 回應不明，請查詢原交易，勿重新收款。');
    // Official transaction IDs exceed JS Number precision. Never parse them as Number.
    return JSON.parse((await res.text()).replace(/(:\s*)(\d{16,})(?=\s*[,}\]])/g,'$1"$2"'));
  }
  return {
    pay:(attempt,oneTimeKey,config)=>request('/v2/payments/oneTimeKeys/pay',{amount:attempt.amount,currency:'TWD',capture:true,orderId:attempt.id,productName:'言文字 POS 消費',oneTimeKey,extras:{addFriends:[{type:'LINE_AT',idList:['@338ymhys']}]}},config),
    check:(attempt,config)=>request('/v2/payments/orders/'+encodeURIComponent(attempt.id)+'/check',null,config)
  };
}
const ACTIVE="state NOT IN ('failed','cancelled','settled')";
const publicAttempt=a=>({id:a.id,state:a.state,amount:a.amount,mode:a.mode,code:a.code||undefined,result:a.result||undefined});
function createService({pool,uid,quote,owned,finish,env=process.env,api=createClient({env})}){
  const cfg=(queryOnly=false)=>{const c=configuration(env);if(!(queryOnly?c.canQuery:c.enabled))throw fail(503,c.blockers.join('；'));return c;};
  async function locked(id,auth,fn){
    const c=await pool.connect();
    try{await c.query('BEGIN');const s=(await c.query('SELECT * FROM table_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!s||!owned(s,auth))throw fail(404,'找不到可收款的桌次。');
      const out=await fn(c,s);await c.query('COMMIT');return out;
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  const save=async(c,a,state,transaction=null,code=null,result=null)=>(await c.query('UPDATE linepay_payments SET state=$2,transaction_id=COALESCE($3,transaction_id),code=$4,result=$5,updated_at=now() WHERE id=$1 RETURNING *',[a.id,state,transaction,code,result?JSON.stringify(result):null])).rows[0];
  const load=async(c,s,id)=>{const a=(await c.query('SELECT * FROM linepay_payments WHERE session_id=$1 AND id=$2 FOR UPDATE',[s.id,id])).rows[0];if(!a)throw fail(404,'找不到原 LINE Pay 交易。');return a;};
  async function apply(id,auth,attemptId,response,isCheck){
    return locked(id,auth,async(c,s)=>{
      let a=await load(c,s,attemptId);if(['settled','failed','cancelled'].includes(a.state))return publicAttempt(a);
      const info=response?.info;
      if(response?.returnCode==='0000'&&(!isCheck||info?.status==='COMPLETE')){
        const valid=info?.orderId===a.id&&/^\d{1,30}$/.test(String(info?.transactionId||''))&&Array.isArray(info.payInfo)&&info.payInfo.length>0&&info.payInfo.every(p=>Number.isSafeInteger(p.amount)&&p.amount>=0)&&info.payInfo.reduce((n,p)=>n+p.amount,0)===a.amount&&!info.authorizationExpireDate;
        if(!valid)return publicAttempt(await save(c,a,'review',info?.orderId===a.id&&/^\d{1,30}$/.test(String(info?.transactionId||''))?String(info.transactionId):null,'AMOUNT_OR_ID_MISMATCH'));
        a=await save(c,a,'paid',String(info.transactionId),'0000');
        // The frozen checkout is settled in the same DB transaction as its terminal state.
        if(s.status!=='open'||JSON.stringify(s.items)!==JSON.stringify(a.snapshot))return publicAttempt(await save(c,a,'review',null,'BILL_CHANGED'));
        // Release the freeze only inside this transaction; a failed finish rolls it all back.
        await save(c,a,'settled');
        const result=await finish(c,s,a,auth);
        return {...publicAttempt(await save(c,a,'settled',null,'0000',result)),settled_now:true};
      }
      // Only definitive rejections release the bill. Duplicate/in-progress/internal errors remain unknown.
      const declines=new Set(['1101','1102','1104','1105','1106','1110','1124','1133','1141','1142','1178','1183','1184','1283','1286','1287','1288','1289','1290','1291','1292','1293','1294','1295','1296','1298','2101','2102','2103','2104']);
      if((isCheck&&response?.returnCode==='0000'&&info?.status==='FAIL'&&info?.orderId===a.id)||(!isCheck&&declines.has(response?.returnCode)))return publicAttempt(await save(c,a,'failed',null,isCheck?String(info.failReturnCode||'FAIL'):response.returnCode));
      return publicAttempt(a);
    });
  }
  return {
    async cancel(id,auth,body={}){
      return locked(id,auth,async(c,s)=>{const a=await load(c,s,body.attempt_id);if(a.state==='cancelled')return publicAttempt(a);if(a.state!=='prepared')throw fail(409,'已送出的付款不可取消或解除鎖定，請查詢原交易。');return publicAttempt(await save(c,a,'cancelled'));});
    },
    async prepare(id,auth,body={}){
      const config=cfg();
      return locked(id,auth,async(c,s)=>{
        const existing=(await c.query('SELECT * FROM linepay_payments WHERE session_id=$1 AND '+ACTIVE+' FOR UPDATE',[id])).rows[0];if(existing)return publicAttempt(existing);
        if(s.status!=='open')throw fail(409,'這桌已結束。');
        const out=await quote(s,auth,body,c);
        if(!Number.isSafeInteger(out.amount)||out.amount<=0)throw fail(400,'API 收款金額必須為正整數。');
        const a=(await c.query('INSERT INTO linepay_payments(id,session_id,amount,snapshot,quote,mode,channel) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[uid('lp_'),s.id,out.amount,JSON.stringify(s.items),JSON.stringify(out),config.mode,config.channel])).rows[0];
        return publicAttempt(a);
      });
    },
    async pay(id,auth,body={}){
      const config=cfg();let send=false;
      const a=await locked(id,auth,async(c,s)=>{
        let a=await load(c,s,body.attempt_id);
        if(a.state!=='prepared')return a;
        if(a.mode!==config.mode||a.channel!==config.channel)throw fail(409,'付款憑證已變更，請取消尚未送出的交易後重開。');
        if(!/^\d{18}$/.test(body.oneTimeKey||''))throw fail(400,'請掃描客人 LINE Pay 的 18 碼付款碼。');
        if(s.status!=='open'||JSON.stringify(s.items)!==JSON.stringify(a.snapshot))throw fail(409,'帳單已變更，請取消這筆尚未送出的交易。');
        send=true;return save(c,a,'unknown');
      });
      if(!send)return publicAttempt(a);
      // Intent is committed BEFORE network I/O. No automatic payment retry, even after process death.
      let response;try{response=await api.pay(a,body.oneTimeKey,config);}catch{return publicAttempt(a);}
      return apply(id,auth,a.id,response,false);
    },
    async check(id,auth,body={}){
      const config=cfg(true);
      const a=await locked(id,auth,(c,s)=>load(c,s,body.attempt_id));
      if(['prepared','settled','failed','cancelled','review'].includes(a.state))return publicAttempt(a);
      if(a.mode!==config.mode||a.channel!==config.channel)throw fail(409,'請恢復原交易的付款環境與 Channel ID 再查詢，勿改用其他方式收款。');
      let response;try{response=await api.check(a,config);}catch{return publicAttempt(a);}
      return apply(id,auth,a.id,response,true);
    }
  };
}
const schema=`
CREATE TABLE IF NOT EXISTS linepay_payments(
 id text PRIMARY KEY,session_id text NOT NULL REFERENCES table_sessions(id),amount integer NOT NULL CHECK(amount>0),
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','unknown','paid','review','settled','failed','cancelled')),
 snapshot jsonb NOT NULL,quote jsonb NOT NULL,mode text NOT NULL CHECK(mode IN ('sandbox','production')),channel text NOT NULL,
 transaction_id text,code text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS linepay_payments_active_session ON linepay_payments(session_id) WHERE state NOT IN ('failed','cancelled','settled');
CREATE UNIQUE INDEX IF NOT EXISTS linepay_payments_transaction ON linepay_payments(mode,channel,transaction_id) WHERE transaction_id IS NOT NULL;
CREATE OR REPLACE FUNCTION linepay_freeze_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.items IS DISTINCT FROM OLD.items OR NEW.status IS DISTINCT FROM OLD.status OR NEW.table_no IS DISTINCT FROM OLD.table_no)
 AND EXISTS(SELECT 1 FROM linepay_payments WHERE session_id=OLD.id AND state NOT IN ('failed','cancelled','settled')) THEN
 RAISE EXCEPTION 'LINEPAY_PAYMENT_LOCK: LINE Pay 原交易待確認，禁止變更帳單或再次收款。' USING ERRCODE='55P03';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS linepay_freeze_session ON table_sessions;
CREATE TRIGGER linepay_freeze_session BEFORE UPDATE ON table_sessions FOR EACH ROW EXECUTE FUNCTION linepay_freeze_session();
CREATE OR REPLACE FUNCTION linepay_protect_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.payer->>'linepay_payment' IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.items IS DISTINCT FROM OLD.items OR NEW.payer IS DISTINCT FROM OLD.payer OR NEW.status='void') THEN
 RAISE EXCEPTION 'LINEPAY_REFUND_REQUIRED: API 實收訂單不可當作手動帳務作廢；請由管理員向 LINE Pay 辦理退款並對帳。' USING ERRCODE='55P03';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS linepay_protect_refund ON table_orders;
CREATE TRIGGER linepay_protect_refund BEFORE UPDATE ON table_orders FOR EACH ROW EXECUTE FUNCTION linepay_protect_refund();
`;
module.exports={configuration,createClient,createService,ACTIVE,schema};
