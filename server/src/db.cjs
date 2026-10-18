'use strict';
const {Pool}=require('pg');
const SCHEMA=`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS plans(
  id text PRIMARY KEY, name text NOT NULL, max_devices int NOT NULL CHECK(max_devices>0),
  price_monthly int NOT NULL DEFAULT 0, price_yearly int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL,
  name text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'client' CHECK(role IN('client','admin')),
  blocked boolean NOT NULL DEFAULT false, failed_logins int NOT NULL DEFAULT 0, locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS subscriptions(
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, plan_id text NOT NULL REFERENCES plans(id),
  period_end timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES plans(id), period text NOT NULL CHECK(period IN('monthly','yearly')),
  amount int NOT NULL, method text NOT NULL CHECK(method IN('bkash','nagad','bank')), trx_id text NOT NULL, payer_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','rejected')), note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by uuid,
  UNIQUE(method,trx_id));
CREATE TABLE IF NOT EXISTS devices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fp_hash text NOT NULL, secret_hash text NOT NULL, name text NOT NULL DEFAULT '', platform text NOT NULL DEFAULT '',
  revoked boolean NOT NULL DEFAULT false, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,fp_hash));
CREATE TABLE IF NOT EXISTS sessions(
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}');
INSERT INTO plans(id,name,max_devices,price_monthly,price_yearly) VALUES
  ('basic','Basic',1,1000,10000),('pro','Pro',3,2500,25000),('business','Business',5,4000,40000)
  ON CONFLICT(id) DO NOTHING;`;
function createPool(url){return new Pool({connectionString:url,max:10,idleTimeoutMillis:30000})}
async function migrate(pool){await pool.query(SCHEMA)}
module.exports={createPool,migrate};
