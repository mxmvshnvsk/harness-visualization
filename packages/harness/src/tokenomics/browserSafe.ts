// Чистые функции токеномики без зависимостей от Node — их импортирует и интерфейс
// (@harness-visualization/harness/tokenomics), чтобы считать так же, как харнесс.
// Главный вход пакета для браузера не годится: он тянет файловую систему, сеть и MCP.

export { classifyCacheWarmth, WARM_SHARE_THRESHOLD, type CacheWarmth } from './cacheWarmth.js';
