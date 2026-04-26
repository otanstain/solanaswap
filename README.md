# Seeker Auto-Swap

Мобильное приложение для **Seeker (Solana Mobile)**, которое автоматизирует ежедневные свапы с рандомизацией для имитации обычного пользователя.

## Стек

- **React Native + Expo SDK 54** — основа приложения
- **TypeScript** — типизация
- **@solana-mobile/mobile-wallet-adapter-protocol-web3js v2.2.x** — подключение Seed Vault
- **@solana/web3.js v1.x** — работа с блокчейном Solana
- **Jupiter API v6** — DEX агрегатор для свапов
- **js-base64** — декодирование адресов (toUint8Array)
- **@react-native-async-storage/async-storage** — хранение настроек
- **expo-notifications** — уведомления о следующем свапе
- **expo-background-fetch + expo-task-manager** — фоновые задачи

## Рандомизация

| Параметр | Диапазон |
|----------|----------|
| Сумма свапа | $1 – $15 |
| Задержка между свапами | 2 – 8 минут |
| Торговые пары | SOL↔USDC, SOL↔USDT, USDC↔USDT, SOL↔SCR |
| Slippage | 0.5% – 1.5% |
| Порядок пар | Случайный каждый день |

## Функционал

- **Settings** — количество свапов в день (50–100), бюджет, уведомления
- **Swap Queue** — кнопка "Start Daily Session", очередь свапов с таймером до следующего
- **Statistics** — сделано сегодня / всего / потрачено на газ
- **SCR Token** — покупка и стейкинг SCR

## Архитектура MWA

- `useAuthorization` + `useMobileWallet` паттерн
- `js-base64` → `toUint8Array` для декодирования адреса
- `chain: "solana:mainnet"` в authorize
- Без `QueryClientProvider` (вызывает краш)
- Каждый свап требует подтверждения через Seed Vault (биометрия)

## Установка

```bash
npm install
npx expo prebuild
npx expo run:android
```

## Структура проекта

```
src/
├── constants/
│   └── tokens.ts          # Токены, пары, константы
├── types/
│   └── index.ts           # TypeScript типы
├── utils/
│   └── randomizer.ts      # Рандомизация параметров
├── hooks/
│   ├── useAuthorization.ts # MWA авторизация
│   └── useMobileWallet.ts  # MWA транзакции
├── services/
│   ├── jupiter.ts          # Jupiter API интеграция
│   ├── storage.ts          # AsyncStorage
│   ├── swapEngine.ts       # Движок свапов
│   ├── notifications.ts    # Expo Notifications
│   └── backgroundTask.ts   # Background Fetch
└── screens/
    ├── SwapScreen.tsx       # Главный экран с очередью
    ├── StatsScreen.tsx      # Статистика
    ├── StakeScreen.tsx      # SCR стейкинг
    └── SettingsScreen.tsx   # Настройки
```

## Платформа

Android (Seeker Phone) — требуется устройство с Seed Vault для подписи транзакций.
