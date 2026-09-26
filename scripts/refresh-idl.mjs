#!/usr/bin/env node
/**
 * Копирует свежий IDL из `target/idl` во фронтенд.
 *
 * Запускать после каждого `anchor build`, если менялся код программы:
 *   npm run anchor:build && node scripts/refresh-idl.mjs
 *
 * Фронтенд читает `lib/solana/idl/splitsol.json`. Program ID подставляется из
 * NEXT_PUBLIC_PROGRAM_ID в рантайме (см. `resolveIdl()` в lib/solana/anchor.ts),
 * поэтому править IDL руками не нужно.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDL_DIR = join(ROOT, 'target', 'idl');
const TYPES_DIR = join(ROOT, 'target', 'types');
const DEST_DIR = join(ROOT, 'lib', 'solana', 'idl');
const DEST_FILE = join(DEST_DIR, 'splitsol.json');
const TYPES_DEST = join(ROOT, 'lib', 'solana', 'types');

/** Ищет самый свежий .json в каталоге. */
function newestIdl(dir) {
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) return null;

  const filesWithTime = files
    // anchor 0.30 кладёт IDL и в splitsol.json, и в splitsol-<address>.json
    .map((name) => ({
      path: join(dir, name),
      time: readFileSync(join(dir, name), 'utf8').length,
    }))
    // <name>.json короче, чем <name>-<programId>.json, поэтому берём максимум
    .sort((a, b) => b.time - a.time);

  return filesWithTime[0].path;
}

function main() {
  const source = newestIdl(IDL_DIR);
  if (!source) {
    console.error(
      [
        '',
        '✗ IDL не найден в target/idl.',
        '',
        '  Сначала соберите программу:',
        '    npm run anchor:build',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const idl = JSON.parse(readFileSync(source, 'utf8'));
  const formatted = `${JSON.stringify(idl, null, 2)}\n`;

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST_FILE, formatted, 'utf8');
  console.log(`✓ IDL обновлён: ${idl.name} v${idl.version}`);
  console.log(`  из: ${source}`);
  console.log(`  в:  lib/solana/idl/splitsol.json`);

  // Anchor 0.30 генерирует и TypeScript-типы — кладём их рядом, они пригодятся.
  if (existsSync(TYPES_DIR)) {
    mkdirSync(TYPES_DEST, { recursive: true });
    const typesFile = join(TYPES_DIR, 'splitsol.ts');
    if (existsSync(typesFile)) {
      writeFileSync(join(TYPES_DEST, 'splitsol.ts'), readFileSync(typesFile, 'utf8'), 'utf8');
      console.log('  типы: lib/solana/types/splitsol.ts');
    }
  }

  console.log('\nДальше: npm run typecheck — убедитесь, что IDL и клиент совпадают.\n');
}

main();
