// Заголовок User-Agent для всех исходящих запросов харнесса.
// Встроенный fetch в Node представляется просто как «node», и сетевые фильтры
// перед некоторыми API отвечают на такие запросы 403. Явный агент честно говорит,
// кто обращается к серверу.

export const HARNESS_USER_AGENT =
  'HarnessVisualization/0.1 (learning project; +https://github.com/mxmvshnvsk/harness-visualization)';
