#!/usr/bin/env bash
#
# SplitSOL — быстрая инициализация devnet-окружения.
#
#   bash scripts/setup-devnet.sh
#
# Скрипт:
#   1. переключает Solana CLI на devnet и создаёт кошелёк разработчика;
#   2. просит тестовые SOL (для комиссий и деплоя программы);
#   3. создаёт кастомный SPL-токен tUSDC (6 decimals) и минтит 100 000 штук;
#   4. создаёт отдельный mint-authority keypair и передаёт ему mint authority;
#   5. записывает адреса в .env.local.

set -euo pipefail

MINT_AMOUNT="${MINT_AMOUNT:-100000}"
SOL_AIRDROP="${SOL_AIRDROP:-2}"

info()  { printf '\033[0;36mℹ %s\033[0m\n' "$*"; }
ok()    { printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[0;33m⚠ %s\033[0m\n' "$*"; }
fail()  { printf '\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Не найдена команда $1. $2"
}

printf '\n\033[1m🚀 SplitSOL — настройка devnet\033[0m\n\n'

# ─── 1. Проверки ────────────────────────────────────────────────────────────
require solana "Установите Solana CLI: https://docs.solana.com/cli/installation"
require spl-token "Установите spl-token CLI: cargo install spl-token-cli"
require node "Установите Node.js >= 18.17"

info "solana:  $(solana --version)"
info "spl-token: $(spl-token --version 2>/dev/null || echo 'n/a')"

# ─── 2. Devnet и кошелёк ────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

info "Переключаем CLI на devnet"
solana config set --url devnet >/dev/null

KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/devnet-wallet.json}"
if [ ! -f "$KEYPAIR" ]; then
  mkdir -p "$(dirname "$KEYPAIR")"
  info "Создаём кошелёк разработчика: $KEYPAIR"
  solana-keygen new --outfile "$KEYPAIR" --no-bip39-passphrase >/dev/null
fi
solana config set --keypair "$KEYPAIR" >/dev/null

WALLET="$(solana address)"
ok "Кошелёк разработчика: $WALLET"

# ─── 3. Тестовые SOL ────────────────────────────────────────────────────────
info "Запрашиваем $SOL_AIRDROP SOL (лимит devnet ~2 SOL за раз)"
if solana airdrop "$SOL_AIRDROP" >/dev/null 2>&1; then
  ok "SOL получены: $(solana balance)"
else
  warn "Airdrop не прошёл — лимит исчерпан или RPC ограничен."
  warn "Фасадка: https://faucet.solana.com  (укажите URL в DEVNET_FAUCET_URL)"
fi

# ─── 4. Токен tUSDC ─────────────────────────────────────────────────────────
ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || cp .env.local.example "$ENV_FILE"

MINT="${NEXT_PUBLIC_TEST_TOKEN_MINT:-}"
if [ -z "$MINT" ] || [ ! -f "$ENV_FILE" ] || ! grep -q "^NEXT_PUBLIC_TEST_TOKEN_MINT=$MINT$" "$ENV_FILE"; then
  info "Создаём кастомный SPL-токен tUSDC (6 decimals)"
  CREATE_OUTPUT="$(spl-token create-token --decimals 6)"
  echo "$CREATE_OUTPUT"
  MINT="$(echo "$CREATE_OUTPUT" | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n 1)"
  [ -n "$MINT" ] || fail "Не удалось определить mint-адрес из вывода spl-token"

  if grep -q '^NEXT_PUBLIC_TEST_TOKEN_MINT=' "$ENV_FILE"; then
    sed -i.bak "s|^NEXT_PUBLIC_TEST_TOKEN_MINT=.*|NEXT_PUBLIC_TEST_TOKEN_MINT=$MINT|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    echo "NEXT_PUBLIC_TEST_TOKEN_MINT=$MINT" >> "$ENV_FILE"
  fi
fi
ok "Mint tUSDC: $MINT"

info "Создаём token account и минтим $MINT_AMOUNT tUSDC"
spl-token create-account "$MINT" >/dev/null 2>&1 || true
spl-token mint "$MINT" "$MINT_AMOUNT"
ok "Баланс tUSDC: $(spl-token balance "$MINT")"

# ─── 5. Mint authority для раздачи токенов из UI ────────────────────────────
AUTHORITY_FILE="mint-authority.json"
if [ ! -f "$AUTHORITY_FILE" ]; then
  info "Создаём mint-authority keypair: $AUTHORITY_FILE"
  solana-keygen new --outfile "$AUTHORITY_FILE" --no-bip39-passphrase >/dev/null
  chmod 600 "$AUTHORITY_FILE"

  AUTHORITY_PUBKEY="$(solana-keygen pubkey "$AUTHORITY_FILE")"
  info "Передаём mint authority → $AUTHORITY_PUBKEY"
  solana-token authorize "$MINT" mint "$AUTHORITY_PUBKEY" >/dev/null 2>&1 \
    || spl-token authorize "$MINT" mint "$AUTHORITY_PUBKEY" >/dev/null

  SECRET="$(node -e "console.log(JSON.stringify(Array.from(require('fs').readFileSync('./$AUTHORITY_FILE'))))")"
  if grep -q '^DEVNET_MINT_AUTHORITY_SECRET=' "$ENV_FILE"; then
    sed -i.bak "s|^DEVNET_MINT_AUTHORITY_SECRET=.*|DEVNET_MINT_AUTHORITY_SECRET=$SECRET|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    echo "DEVNET_MINT_AUTHORITY_SECRET=$SECRET" >> "$ENV_FILE"
  fi

  info "Пополняем mint-authority для комиссий"
  solana airdrop 1 "$AUTHORITY_PUBKEY" >/dev/null 2>&1 || warn "Airdrop на mint-authority не прошёл"
  ok "Mint authority: $AUTHORITY_PUBKEY"
else
  warn "$AUTHORITY_FILE уже существует — пропускаем"
fi

# ─── 6. Итог ────────────────────────────────────────────────────────────────
printf '\n\033[1m🎉 Готово!\033[0m\n\n'
printf '  Сеть:            devnet\n'
printf '  Кошелёк:         %s\n' "$WALLET"
printf '  SOL:             %s\n' "$(solana balance)"
printf '  tUSDC mint:      %s\n' "$MINT"
printf '  tUSDC баланс:    %s\n' "$(spl-token balance "$MINT")"
printf '  Файл настроек:   %s\n' "$ENV_FILE"
printf '\n'
printf '  Дальше:\n'
printf '    1. Деплой Anchor-программы:  npm run anchor:build && npm run anchor:deploy\n'
printf '    2. Проставить program ID:     node scripts/set-program-id.mjs\n'
printf '    3. Запустить приложение:       npm run dev\n\n'
printf '  ⚠️  Все токены бесплатные и не имеют реальной ценности.\n\n'
