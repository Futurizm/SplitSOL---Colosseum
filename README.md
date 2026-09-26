# SplitSOL

Сервис для разделения счетов между друзьями с расчётами в SOL и кастомном
SPL-токене **tUSDC** на блокчейне Solana.

> 🧪 **Devnet — тестовая сеть.** Приложение работает только на Solana Devnet с
> бесплатными токенами, которые выдаёт faucet. Реальных денег нет, комиссии
> приложения 0%. Mainnet-эндпоинты заблокированы в коде.

Полная инструкция по запуску — **[SETUP.md](./SETUP.md)**.

---

## Что это

Деньги лежат в **on-chain эскроу**: SPL-токены переводятся в ATA-аккаунт,
authority которого — PDA Anchor-программы. Пока группа активна, токены не может
забрать никто: ни участник, ни получатель. Средства уходят получателю только
когда оплатили все, а отмена возвращает каждую долю назад.

Supabase хранит только интерфейсные данные (имена, аватары, история). Все
правила расчёта и движение денег — в смарт-контракте.

## Архитектура

```
┌──────────────────────── Next.js 14 (App Router) ───────────────────────┐
│  Server Components по умолчанию, клиентские — где нужна интерактивность  │
│                                                                        │
│  UI ──► useAnchorProgram ──► Anchor-клиент ──► Solana Devnet           │
│    │                                                          ▲        │
│    └─► Supabase (RLS)  ◄── верификация ◄── серверные API-роуты ──┘        │
└────────────────────────────────────────────────────────────────────────┘

programs/splitsol (Rust, Anchor 0.30.1)
  create_group → join_group → pay_share → settle_group
                                       ↘ cancel_group (возврат всех долей)
```

| Слой | Отвечает за |
|---|---|
| Anchor-программа | эскроу, доли, расчёт, возврат, события |
| Supabase (Postgres + Auth + Realtime) | профили, группы, статусы, история |
| Next.js API routes | серверная верификация платежей, devnet-фасадка |
| Solana Pay | альтернативный путь оплаты по QR для мобильных |

## Инструкции программы

| Инструкция | Что делает | Кто вызывает |
|---|---|---|
| `create_group` | создаёт PDA группы + долю создателя + escrow-ATA | создатель |
| `join_group` | регистрирует участника с его долей | участник |
| `pay_share` | переводит долю в эскроу и фиксирует оплату | участник |
| `settle_group` | переводит весь эскроу получателю | только создатель |
| `cancel_group` | возвращает каждую оплаченную долю | только создатель |

PDA-сиды: `["group", owner, group_id]` и `["member", group, wallet]`.

## Решения, о которых стоит знать

**Доли всегда сходятся до 1 micro-unit.** Расчёт идёт в целых micro-единицах
(bigint), а остаток округления распределяется методом наибольших дробных
частей (`lib/utils/split.ts`). Поэтому `settle_group` никогда не падает с
`AmountOverflow`.

**Лимит 10 участников.** Нужен, чтобы реестр платежей помещался в аккаунт
фиксированного размера и `cancel_group` мог вернуть все средства on-chain
полным списком, а не «кто успел».

**`cancel_group` требует полный список участников.** Иначе часть денег осталась
бы в эскроу навсегда — программа проверяет `remaining_accounts.len() ==
joined_count`.

**PDA-сиды группы валидируются вручную.** Сиды зависят от полей самого
аккаунта (`owner`, `group_id`), поэтому Anchor-constraint `seeds = [...]`
применить нельзя. Валидация выполняется в handler'е через
`assert_group_pda` / `assert_member_pda`.

**Mainnet заблокирован.** `assertDevnetOnly()` вызывается при создании каждого
соединения и в каждом серверном API-роуте. Переменных для mainnet в проекте
нет.

**Никакого float в деньгах.** Суммы — `bigint` micro-единиц, форматирование и
промежуточные вычисления — `BigNumber.js`.

**Приватные ключи не покидают кошелёк.** Приложение никогда их не запрашивает;
tUSDC для раздачи минтит отдельный серверный клюpair с mint authority.

**Клиенту нельзя «нарисовать» оплату.** `/api/transactions/verify` читает
транзакцию из сети и сверяет отправителя, получателя, mint, сумму и
reference-ключ. Статус меняется только после этого.

## Стек

- **Frontend:** Next.js 14 (App Router), TypeScript strict, Tailwind, shadcn/ui, Framer Motion, React Hook Form + Zod, Recharts
- **On-chain:** Anchor 0.30.1 (Rust), `anchor-lang`, `anchor-spl`
- **Клиент:** `@coral-xyz/anchor`, `@solana/web3.js`, `@solana/spl-token`, `@solana/pay`, wallet-adapter (Phantom, Solflare, Backpack)
- **Данные:** Supabase (PostgreSQL, Auth, Realtime, RLS)
- **Devnet:** Helius RPC, Solana CLI, spl-token CLI

## Быстрый старт

```bash
npm install
bash scripts/setup-devnet.sh        # devnet, кошелёк, тUSDC, mint authority
npm run anchor:build                # собрать программу
node scripts/set-program-id.mjs     # проставить program ID
npm run anchor:build && npm run anchor:deploy
node scripts/refresh-idl.mjs        # обновить IDL во фронтенде
cp .env.local.example .env.local    # заполнить ключи
npm run dev
```

Проверки качества:

```bash
npm run typecheck
npm run lint
npm run build
npm run anchor:test                 # интеграционные тесты против devnet
```

## Структура

```
splitsol/
├── programs/splitsol/          Anchor-программа (Rust)
│   └── src/
│       ├── lib.rs              точка входа, declare_id
│       ├── errors.rs           кастомные ошибки
│       ├── state/              аккаунты Group и Member
│       └── instructions/       5 инструкций + события
├── tests/splitsol.ts           интеграционные тесты
├── supabase/                   schema.sql, rls.sql, seed.sql
├── scripts/                    setup-devnet.sh, set-program-id, refresh-idl, mint-tokens
├── app/                        Next.js App Router
│   ├── (auth)/                 вход и регистрация
│   ├── (dashboard)/            приватная часть
│   │   ├── dashboard/          сводка
│   │   ├── groups/             список, создание, детали, оплата, QR
│   │   ├── history/            транзакции + экспорт CSV
│   │   ├── analytics/          графики трат
│   │   └── settings/           профиль и проверка окружения
│   ├── join/[code]/            присоединение по invite-коду
│   └── api/                    groups, transactions, solana, profile, devnet
├── components/                 UI, кошелёк, группы, платежи, аналитика
├── lib/
│   ├── solana/                 constants, anchor, token, pay, verify, airdrop
│   ├── supabase/               client, server, middleware
│   ├── hooks/                  useAnchorProgram, useTransaction, useRealtimePayments…
│   └── utils/                  split, format, validation, invite
└── middleware.ts               обновление сессии + защита маршрутов
```

## Безопасность

- RLS на всех таблицах: пользователь видит только свои группы
- Серверная верификация транзакций: сумма, отправитель, получатель, mint
- HMAC-проверка подписи Helius webhook (`timingSafeEqual`)
- Rate limit на devnet-фасадку (5 минтов/мин на токены, 3 на SOL)
- Zod-валидация всех входных данных
- Никаких приватных ключей и никакой комиссии приложения

Для продакшена понадобится заменить rate limit на внешний стор (Upstash) и
провести аудит Anchor-программы.

## Лицензия

Демо для хакатона. Перед использованием в продакшене нужны аудит смарт-контракта
и переход на mainnet с настоящим USDC.
