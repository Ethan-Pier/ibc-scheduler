import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseEnvFile(filename) {
  const filepath = path.join(projectRoot, filename);
  if (!fs.existsSync(filepath)) {
    return {};
  }

  return fs
    .readFileSync(filepath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf('=');
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

function readStorageFallback() {
  const filepath = path.join(projectRoot, 'src', 'lib', 'storage.ts');
  if (!fs.existsSync(filepath)) {
    return {};
  }

  const source = fs.readFileSync(filepath, 'utf8');
  const urlMatch = source.match(/const SUPABASE_URL = .*?\|\| '([^']+)'/);
  const keyMatch = source.match(/const SUPABASE_KEY = .*?\|\| '([^']+)'/);

  return {
    SUPABASE_URL: urlMatch?.[1],
    SUPABASE_ANON_KEY: keyMatch?.[1],
  };
}

const env = {
  ...readStorageFallback(),
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.local'),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少 Supabase 凭证。请提供 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，或在 .env 中配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const outputDir =
  process.argv[2] ||
  path.join(projectRoot, 'backups', `${today}-subsidy-recovery`);

fs.mkdirSync(outputDir, { recursive: true });

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function backupTable(table, orderColumn) {
  let query = supabase.from(table).select('*');
  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`${table} 备份失败：${error.message}`);
  }

  const outputPath = path.join(outputDir, `${table}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(data || [], null, 2));
  console.log(`已备份 ${table} -> ${outputPath}`);
  return {
    table,
    rows: Array.isArray(data) ? data.length : 0,
    outputPath,
  };
}

const startedAt = new Date().toISOString();

try {
  const results = [];
  results.push(await backupTable('user_profiles', 'updated_at'));
  results.push(await backupTable('subsidy_records', 'updated_at'));

  const metadata = {
    startedAt,
    completedAt: new Date().toISOString(),
    supabaseUrl,
    tables: results,
  };

  const metaPath = path.join(outputDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`备份完成 -> ${metaPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
