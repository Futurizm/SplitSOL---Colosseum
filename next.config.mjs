/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Solana/Anchor тянут в бандл Node-модули (buffer, crypto, stream…).
  // На сервере их нужно оставить внешними, в браузере — подменить заглушками.
  transpilePackages: ['@solana/spl-token', '@coral-xyz/anchor'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Solana-стек (web3.js / spl-token / anchor) тянет Node-модули, которых
      // в браузере нет. Заглушки ставятся ТОЛЬКО на модули, которые реально
      // не используются в рантайме клиента: подменять `crypto`/`path`/`http`
      // нельзя — они ломают инициализацию библиотек в прод-сборке.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
