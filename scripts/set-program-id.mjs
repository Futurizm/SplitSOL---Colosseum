#!/usr/bin/env node
/**
 * Проставляет Program ID Anchor-программы в declare_id! и Anchor.toml.
 *
 * Зачем: `declare_id!` обязан совпадать с адресом program keypair из
 * `target/deploy/splitsol-keypair.json`, иначе деплой падает с
 * «Program Id mismatch».
 *
 *   node scripts/set-program-id.mjs
 *   node scripts/set-program-id.mjs --program-id <BASE58>
 *
 * Шаги:
 *   1. находит ключ из target/deploy/splitsol-keypair.json
 *      (или берёт из --program-id / переменной окружения);
 *   2. подставляет его в programs/splitsol/src/lib.rs и Anchor.toml;
 *   3. записывает NEXT_PUBLIC_PROGRAM_ID в .env.local.
 *
 * Для вычисления base58 нужен только Node — Solana CLI не требуется.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYPAIR_PATH = join(ROOT, 'target', 'deploy', 'splitsol-keypair.json');
const LIB_RS = join(ROOT, 'programs', 'splitsol', 'src', 'lib.rs');
const ANCHOR_TOML = join(ROOT, 'Anchor.toml');
const ENV_FILE = join(ROOT, '.env.local');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Ed25519-ключ в JSON-файле — это 64 байта: 32 seed + 32 публичный ключ. */
function publicKeyFromKeypairFile(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const bytes = Array.isArray(raw) ? raw : raw.secretKey;
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(`Неожиданный формат keypair в ${path}`);
  }
  return { publicKey: base58Encode(Uint8Array.from(bytes.slice(32, 64))), secretKey: bytes };
}

function base58Encode(bytes) {
  if (bytes.length === 0) return '';

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  let encoded = '';
  while (value > 0n) {
    const mod = value % 58n;
    value /= 58n;
    encoded = BASE58_ALPHABET[Number(mod)] + encoded;
  }

  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = BASE58_ALPHABET[0] + encoded;
  }
  return encoded;
}

function replaceInFile(path, pattern, replacement) {
  if (!existsSync(path)) {
    console.warn(`  ⚠ файл не найден, пропущен: ${path}`);
    return false;
  }
  const source = readFileSync(path, 'utf8');
  if (!pattern.test(source)) {
    console.warn(`  ⚠ шаблон не найден в ${path} — проверьте вручную`);
    return false;
  }
  writeFileSync(path, source.replace(pattern, replacement), 'utf8');
  return true;
}

function upsertEnv(programId) {
  if (!existsSync(ENV_FILE)) {
    const template = join(ROOT, '.env.local.example');
    if (existsSync(template)) {
      writeFileSync(ENV_FILE, readFileSync(template, 'utf8'), 'utf8');
    } else {
      writeFileSync(ENV_FILE, '', 'utf8');
    }
    console.log('  • создан .env.local из шаблона');
  }

  const source = readFileSync(ENV_FILE, 'utf8');
  const line = `NEXT_PUBLIC_PROGRAM_ID=${programId}`;

  if (/^NEXT_PUBLIC_PROGRAM_ID=.*$/m.test(source)) {
    writeFileSync(ENV_FILE, source.replace(/^NEXT_PUBLIC_PROGRAM_ID=.*$/m, line), 'utf8');
    console.log('  • обновлён NEXT_PUBLIC_PROGRAM_ID в .env.local');
  } else {
    writeFileSync(ENV_FILE, `${source.trimEnd()}\n${line}\n`, 'utf8');
    console.log('  • добавлен NEXT_PUBLIC_PROGRAM_ID в .env.local');
  }
}

function main() {
  const args = process.argv.slice(2);
  const explicitIndex = args.indexOf('--program-id');
  const explicit = explicitIndex >= 0 ? args[explicitIndex + 1] : process.env.PROGRAM_ID;

  let programId = explicit;

  if (!programId) {
    if (!existsSync(KEYPAIR_PATH)) {
      console.error(
        [
          '',
          '✗ Program keypair не найден.',
          '',
          `  Ожидался файл: target/deploy/splitsol-keypair.json`,
          '',
          '  Сделайте так:',
          '    1) npm run anchor:build       # создаст program keypair',
          '    2) node scripts/set-program-id.mjs',
          '',
          '  Либо передайте адрес явно:',
          '    node scripts/set-program-id.mjs --program-id <BASE58>',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
    programId = publicKeyFromKeypairFile(KEYPAIR_PATH).publicKey;
    console.log('  • program keypair найден в target/deploy/');
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId)) {
    console.error(`✗ Некорректный base58 program ID: ${programId}`);
    process.exit(1);
  }

  console.log(`\nProgram ID: ${programId}\n`);

  const inLib = replaceInFile(
    LIB_RS,
    /declare_id!\("[^"]*"\)/,
    `declare_id!("${programId}")`,
  );
  console.log(`  ${inLib ? '✓' : '·'} programs/splitsol/src/lib.rs`);

  for (const section of ['localnet', 'devnet']) {
    replaceInFile(
      ANCHOR_TOML,
      new RegExp(`(\\[programs\\.${section}\\]\\s*\\n\\s*splitsol\\s*=\\s*)"[^"]*"`),
      `$1"${programId}"`,
    );
  }
  console.log('  ✓ Anchor.toml');

  upsertEnv(programId);

  console.log('\n✓ Готово. Пересоберите программу:');
  console.log('    npm run anchor:build && npm run anchor:deploy\n');
}

try {
  main();
} catch (error) {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
}

export { base58Encode, publicKeyFromKeypairFile };
