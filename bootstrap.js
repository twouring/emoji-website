'use strict';

const {Pool}=require('pg');
const systemSettings=require('./lib/system-settings');

function poolConfig(env=process.env){const ssl=env.PGSSL==='true'?true:env.PGSSL==='relax'?{rejectUnauthorized:false}:false,connectionString=env.DATABASE_URL||env.POSTGRES_CONNECTION_STRING;if(connectionString)return {connectionString,ssl};const host=env.POSTGRES_HOST||env.PGHOST;if(!host)return null;return {host,port:Number(env.POSTGRES_PORT||env.PGPORT||5432),user:env.POSTGRES_USERNAME||env.POSTGRES_USER||env.PGUSER,password:env.POSTGRES_PASSWORD||env.PGPASSWORD,database:env.POSTGRES_DATABASE||env.POSTGRES_DB||env.PGDATABASE,ssl};}

(async()=>{const config=poolConfig();if(config){const pool=new Pool({...config,connectionTimeoutMillis:5000,statement_timeout:15000});try{const rows=(await pool.query('SELECT key,value FROM system_settings')).rows;systemSettings.apply(rows);}catch(error){if(error.code!=='42P01'){console.error('[system-settings] 載入失敗：',error.message);if(process.env.NODE_ENV==='production')process.exit(1);}}finally{await pool.end();}}require('./server').boot();})();
