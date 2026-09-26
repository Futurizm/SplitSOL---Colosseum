# SplitSOL — инструкция по установке и запуску

> ⚠️ Проект работает **исключительно на Solana Devnet** с бесплатными тестовыми
> токенами. Реальных денег нет, комиссий приложения нет, mainnet заблокирован
> на уровне кода.

Полный флоу: создать группу → раздать invite-ссылку → участники платят on-chain →
создатель рассчитывает счёт или отменяет его с возвратом.

---

## Содержание

1. [Что понадобится](#требования)
2. [Установка зависимостей](#шаг-1-зависимости)
3. [Настройка Supabase](#шаг-2-supabase)
4. [Rust, Solana CLI и Anchor CLI](#шаг-3-инструменты-solana)
5. [Сборка и деплой Anchor-программы](#шаг-4-anchor-программа)
6. [Создание тестового токена tUSDC](#шаг-5-токен-tusdc)
7. [Быстрая инициализация](#шаг-7-быстрый-старт-скриптом)
8. [Helius и webhooks](#шаг-8-helius)
9. [Переменные окружения](#шаг-9-переменные-окружения)
10. [Запуск](#шаг-10-запуск)
11. [Phantom на Devnet](#шаг-11-phantom)
12. [Проверка полного флоу](#шаг-12-проверка-флоу)
13. [Известные проблемы](#известные-проблемы)
14. [Шпаргалка по CLI](#шпаргалка)

---

## Требования

| Что | Версия | Обязательно |
|---|---|---|
| Node.js | >= 18.17 (рекомендуется 20 LTS) | да |
| npm / pnpm | >= 9 / >= 8 | да |
| Git | любой | нет |
| Rust (stable) | >= 1.75 | для Anchor |
| Solana CLI | >= 1.18 | для деплоя и токенов |
| Anchor CLI | 0.30.1 | для деплоя |
| spl-token CLI | любой | для токена |

Аккаунты (бесплатные тарифы):

- [Supabase](https://supabase.com) — PostgreSQL, Auth, Realtime
- [Helius](https://helius.dev) — RPC к devnet (100K запросов/мес)
- [Phantom](https://phantom.app) — расширение браузера, переключается на Devnet

> Rust, Solana CLI и Anchor CLI нужны **только** для деплоя программы. Если вы
> только запускаете фронтенд, хватит шагов 1, 2, 5, 7, 9, 10.

---

## Шаг 1: зависимости

```bash
git clone <url-репозитория> splitsol
cd splitsol
npm install
```

После установки проект запускается даже с пустым `.env.local`: страницы
показывают экран настройки (`SetupNotice`) вместо падения. `npm run build`
тоже проходит — это проверяется в CI.

---

## Шаг 2: Supabase

### 2.1 Создание проекта

1. Откройте https://supabase.com → **New project**
2. Запомните пароль БД (в панели его больше не покажут)
3. Дождитесь provision (~2 минуты)

### 2.2 Схема, RLS, seed

В **Dashboard → SQL Editor** выполните по очереди:

1. `supabase/schema.sql` — таблицы, индексы, триггеры, view, Realtime-publication
2. `supabase/rls.sql` — политики доступа
3. `supabase/seed.sql` — демо-данные (опционально; скрипт безопасен, если
   пользователей ещё нет)

> Порядок важен: `rls.sql` вызывает `public.is_group_member()`, которая
> создаётся в самом `rls.sql`, а политики на `groups` — тоже там. Выполняйте
> `schema.sql` первым.

### 2.3 Auth

`Authentication → Providers`:

- **Email** — включён по умолчанию, ничего делать не нужно
- **Google OAuth** (опционально): создайте OAuth-клиент в Google Cloud Console
  и добавьте redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`

### 2.4 Ключи

`Project Settings → API`:

| Значение | Куда |
|---|---|
| `Project URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` | `SUPABASE_SERVICE_ROLE_KEY` (только сервер!) |

`service_role` обходит RLS. Его нельзя выносить в `NEXT_PUBLIC_*` — иначе любой
посетитель сможет читать и писать любые таблицы.

---

## Шаг 3: инструменты Solana

### 3.1 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup update stable
rustc --version    # >= 1.75
```

Windows (PowerShell): установка через <https://rustup.rs>, дальше
`$env:PATH += ";$env:USERPROFILE\.cargo\bin"`.

### 3.2 Solana CLI

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
```

Переключаемся на devnet и создаём кошелёк:

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/devnet-wallet.json --no-bip39-passphrase
solana config set --keypair ~/.config/solana/devnet-wallet.json
solana address
```

### 3.3 Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
anchor --version    # anchor-cli 0.30.1
```

> Версия Anchor CLI должна совпадать с `anchor-lang` в
> `programs/splitsol/Cargo.toml` (0.30.1). Расхождение — самая частая причина
> ошибок сборки.

### 3.4 spl-token CLI

```bash
cargo install spl-token-cli
spl-token --version
```

---

## Шаг 4: Anchor-программа

```bash
# 1. Собрать (создаст program keypair в target/deploy/)
npm run anchor:build

# 2. Проставить program ID в declare_id!, Anchor.toml и .env.local
node scripts/set-program-id.mjs

# 3. Пересобрать с правильным declare_id!
npm run anchor:build

# 4. Задеплоить (нужно ~2 SOL)
solana airdrop 2
npm run anchor:deploy

# 5. Обновить IDL во фронтенде
node scripts/refresh-idl.mjs
```

**Почему так много шагов.** `anchor deploy` требует, чтобы `declare_id!` в
`lib.rs` совпадал с адресом program keypair. Ключ генерируется при первом
`anchor build`, поэтому ID известен только после сборки — скрипт
`set-program-id.mjs` читает `target/deploy/splitsol-keypair.json` и подставляет
base58-адрес во все три места. В репозитории лежит валидная заглушка, чтобы
`anchor build` работал «из коробки».

Полезно:

```bash
anchor keys list            # адреса программы
cat target/deploy/splitsol-keypair.json   # program keypair (в .gitignore!)
```

### Тесты

```bash
npm run anchor:test          # против devnet
npm run anchor:test:local    # против локального валидатора
```

Тесты покрывают полный жизненный цикл (создание → присоединение → оплата →
расчёт), защитные сценарии (повторная оплата, неполная оплата, доступ не
владельцу, неполный список участников при отмене) и согласованность расчёта
долей с ончейн-логикой.

---

## Шаг 5: токен tUSDC

```bash
# Переключиться на devnet
solana config set --url devnet

# 1. Создать mint с 6 decimals (как у USDC)
spl-token create-token --decimals 6
# Вывод: Creating token <MINT_ADDRESS>   ← сохраните

# 2. Создать себе token account и наминтить
spl-token create-account <MINT_ADDRESS>
spl-token mint <MINT_ADDRESS> 100000
spl-token balance <MINT_ADDRESS>
```

### Mint authority для раздачи токенов из UI

```bash
solana-keygen new --outfile ./mint-authority.json --no-bip39-passphrase
spl-token authorize <MINT_ADDRESS> mint $(solana-keygen pubkey ./mint-authority.json)
solana airdrop 2 $(solana-keygen pubkey ./mint-authority.json)   # для комиссий

# Секрет в .env.local
node -e "console.log(JSON.stringify(Array.from(require('fs').readFileSync('./mint-authority.json'))))"
# → [12, 34, ...]  вставить в DEVNET_MINT_AUTHORITY_SECRET
```

`mint-authority.json` добавьте в `.gitignore` (уже добавлен). Этот ключ умеет
только минтить на devnet — утечка ничего не стоит, но всё равно держите его в
тайне: так вы не привыкнете к ротации ключей.

### Раздать токены другому тестировщику

```bash
spl-token transfer <MINT_ADDRESS> 100 <RECIPIENT_WALLET> --fund-recipient
```

`--fund-recipient` сам создаёт token account получателя (нужен SOL на rent).

---

## Шаг 6: тестовые SOL

```bash
solana airdrop 2        # лимит ~2 SOL за раз
solana balance
```

Если лимит исчерпан:

- подождите 60–120 секунд и повторите;
- или используйте фасадку: <https://faucet.solana.com>, и укажите её URL в
  `DEVNET_FAUCET_URL` — тогда кнопка «Получить тестовые SOL» в приложении
  будет работать через неё, а не через RPC-метод `requestAirdrop`.

---

## Шаг 7: быстрый старт скриптом

Шаги 3.2, 6 и 5 умещаются в один скрипт:

```bash
bash scripts/setup-devnet.sh
```

Он переключит CLI на devnet, создаст кошелёк, запросит SOL, создаст mint tUSDC,
наминтит 100 000 токенов, создаст mint-authority keypair и запишет адреса в
`.env.local`.

На Windows нужен Git Bash или WSL:

```powershell
wsl bash scripts/setup-devnet.sh
# либо вручную:
solana config set --url devnet
spl-token create-token --decimals 6
spl-token mint <MINT> 100000
```

---

## Шаг 8: Helius

1. Зарегистрируйтесь на <https://helius.dev>
2. **Create Project** → кластер **Devnet**
3. Скопируйте API Key
4. RPC URL: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`

### Webhook (опционально, но полезно)

Основной путь подтверждения платежа — `/api/transactions/verify`, который
клиент вызывает сам. Webhook нужен как страховка: если пользователь оплатил и
сразу закрыл вкладку, подтверждение догонит Helius.

1. **Webhooks → Add Webhook**
2. URL: `https://<домен>/api/transactions/webhook` (для локальной разработки —
   через ngrok, см. ниже)
3. Transaction Types: **All**
4. Account Addresses: адрес mint-authority кошелька
5. Скопируйте **Webhook Secret** в `HELIUS_WEBHOOK_SECRET`

Роут проверяет HMAC-SHA256 подпись заголовка `x-helius-signature` и отклоняет
любой запрос без валидной подписи.

### ngrok для локальной разработки

```bash
npm install -g ngrok
ngrok http 3000
# https://abc123.ngrok.io → указать в Helius и в NEXT_PUBLIC_APP_URL
```

---

## Шаг 9: переменные окружения

```bash
cp .env.local.example .env.local
```

Заполните:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # только сервер

# Solana — ТОЛЬКО DEVNET
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_API_KEY=...
HELIUS_WEBHOOK_SECRET=...

# Anchor (из шага 4)
NEXT_PUBLIC_PROGRAM_ID=...

# Тестовый токен (из шага 5)
NEXT_PUBLIC_TEST_TOKEN_MINT=...
NEXT_PUBLIC_TEST_TOKEN_SYMBOL=tUSDC
NEXT_PUBLIC_TEST_TOKEN_DECIMALS=6

# Mint authority (из шага 5)
DEVNET_MINT_AUTHORITY_SECRET=[12,34,...]

# Приложение
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_FEE_PERCENTAGE=0
```

> Переменных для mainnet в проекте нет намеренно: опечатка в URL не сможет
> увести приложение в реальную сеть — `assertDevnetOnly()` бросает исключение
> при создании соединения и в каждом серверном API-роуте.

Экран **Настройки** показывает, что именно сервер видит, и подсвечивает
незаполненные переменные.

---

## Шаг 10: запуск

```bash
npm run dev
```

Откройте http://localhost:3000. В шапке — жёлтый баннер «🧪 DEVNET».

---

## Шаг 11: Phantom

1. Расширение → ⚙️ → **Testnet Mode: ON** (или Настройки → Сети → Devnet)
2. Подключите кошелёк
3. Нажмите «Получить тестовые токены» в шапке — сервер наминтит tUSDC

> Phantom хранит devnet-кошельки отдельно от mainnet. Импортировать
> основной кошелёк не нужно и не стоит.

---

## Шаг 12: проверка флоу

1. `npm run dev`, откройте http://localhost:3000
2. Зарегистрируйтесь (`/register`)
3. Подключите Phantom (Testnet Mode)
4. «Получить тестовые токены» → 100 tUSDC
5. «Создать группу»: счёт 30 tUSDC, 3 участника, равное деление
6. Проверьте вкладку **Настройки** — все четыре пункта должны быть зелёными
7. Отправьте себе ссылку-приглашение (кнопка «Копировать»)
8. Нажмите «Оплатить долю» → подтвердите в кошельке
9. Статус участника должен стать «Оплачено» в течение 1–2 секунд
10. Когда все три оплатят — появится кнопка «Рассчитать группу»
11. После расчёта: эскроу пуст, получатель получил 30 tUSDC, статус `settled`

Проверить on-chain состояние независимо от интерфейса:

- **Solana Explorer** → Accounts → вставить PDA группы из карточки
- **Anchor Events** → `SharePaid`, `GroupSettled`

Отдельная проверка: отмена группы. Создайте группу, оплатите свою долю и
нажмите «Отменить и вернуть» — баланс должен вернуться в точности.

---

## Известные проблемы

**`anchor: command not found`**
`export PATH="$HOME/.cargo/bin:$PATH"`, затем перезапустите терминал.
На Windows: `$env:PATH += ";$env:USERPROFILE\.cargo\bin"`.

**`anchor build` падает с ошибками компиляции**
Проверьте `rustup update stable` и что версия `anchor-lang` в
`programs/splitsol/Cargo.toml` совпадает с `anchor --version`.

**`Program Id mismatch` при деплое**
Не выполнен `node scripts/set-program-id.mjs` после первого `anchor build`.
Запустите скрипт и пересоберите.

**`anchor deploy` → insufficient funds**
Деплой стоит ~2–3 SOL. `solana airdrop 2` несколько раз с паузами.

**`Error: Element type is invalid` при `next build`**
В `next.config.mjs` `@solana/spl-token` и `@coral-xyz/anchor` должны быть в
`transpilePackages`, а **не** в `experimental.serverComponentsExternalPackages`.
Во внешнем виде они корректно работают в Server Components, но в Client
Component импорт превращается в `undefined` — компонент не рендерится.

**`airdrop request failed` / лимит исчерпан**
Подождите 60–120 секунд. Либо укажите `DEVNET_FAUCET_URL` с
<https://faucet.solana.com>.

**`Transaction simulation failed`**
У отправителя нет token account для tUSDC. В приложении он создаётся
автоматически (`init_if_needed`), для CLI:

```bash
spl-token create-account <MINT> --owner <WALLET_ADDRESS>
```

**`Wallet not connected` при оплате**
Phantom в mainnet-режиме. Включите Testnet Mode.

**Статус оплаты не обновился у других участников**
Проверьте, что `group_members` добавлена в publication `supabase_realtime`
(делается в `supabase/schema.sql`) и что RLS- политика
`members view group roster` активна. Интерфейс покажет предупреждение, если
realtime-канал не подключился.

**`PaymentIntent` / `validateTransfer` из @solana/pay не работает**
Ожидаемо: библиотека v1 переехала на типы `@solana/kit` и принимает
`Rpc`-клиент вместо web3.js `Connection`. В `lib/solana/verify.ts` инструкции
разбираются вручную — это надёжнее и позволяет видеть SPL-токен, а не только
SOL. `encodeURL` из той же библиотеки используется для генерации ссылок.

**Расхождение на 1 micro-unit при оплате по QR**
tUSDC имеет 6 знаков после запятой, а кошельки переводят сумму из URL через
float и округляют вниз. Верификация принимает погрешность в 1 micro-unit
(< 0.000001 tUSDC). Точный путь — оплата кнопкой через `pay_share`.

---

## Шпаргалка

```bash
# Состояние
solana config get
solana balance
anchor keys list

# Токены
spl-token accounts
spl-token balance <MINT>
spl-token supply <MINT>

# Транзакции
solana airdrop 2
solana address
solana transaction-history <ADDRESS>

# Проект
npm run typecheck
npm run lint
npm run build
npm run anchor:build
npm run anchor:test
node scripts/set-program-id.mjs
node scripts/refresh-idl.mjs
node scripts/mint-tokens.mjs <WALLET> 100
bash scripts/setup-devnet.sh

# Explorer
# https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet
# https://explorer.solana.com/address/<ADDRESS>?cluster=devnet
```

## Ссылки

- [Solana Devnet Explorer](https://explorer.solana.com/?cluster=devnet)
- [Anchor Docs](https://www.anchor-lang.com) · [Anchor Book](https://book.anchor-lang.com)
- [Solana CLI](https://docs.solana.com/cli) · [SPL Token](https://spl.solana.com/token)
- [Supabase Dashboard](https://app.supabase.com) · [Helius](https://dev.helius.xyz)
- [Solana Pay](https://docs.solanapay.com) · [Phantom](https://phantom.app)
- [Devnet Faucet](https://faucet.solana.com)
