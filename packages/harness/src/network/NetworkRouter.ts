// Направляет исходящие запросы по маршрутам из настроек и сообщает о каждом.
// Один маршрутизатор на сессию: его метод fetch заменяет глобальный fetch
// в провайдере модели, поисковых провайдерах и загрузке страниц.
//
// Маршрут применяется диспетчером undici на каждый запрос: ProxyAgent — через прокси,
// обычный Agent — напрямую (минуя прокси из окружения). Так в одной сессии часть
// запросов идёт через прокси, часть — напрямую, и каждый выбор виден в трейсе.

import { Agent, ProxyAgent, type Dispatcher } from 'undici';
import { maskProxyUrl } from './proxyFromEnvironment.js';
import { resolveNetworkRoute } from './resolveNetworkRoute.js';
import type { NetworkSettings } from '../settings/settingsSchema.js';

// Совместима по вызову с глобальным fetch, поэтому подставляется вместо него.
export type RoutedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface NetworkRequestInfo {
  host: string;
  // Маршрут, выбранный по настройкам.
  route: 'proxy' | 'direct';
  // Пошёл ли запрос через прокси на самом деле (proxy по настройкам, но прокси не задан — нет).
  viaProxy: boolean;
  rule: string | null;
  // Адрес прокси, секреты скрыты; null — запрос пошёл напрямую.
  proxyUrl: string | null;
}

export type OnNetworkRequest = (info: NetworkRequestInfo) => void;

export interface NetworkRouterOptions {
  settings: NetworkSettings;
  // Адрес прокси из окружения; null — прокси нет, маршрут proxy выполняется напрямую.
  proxyUrl: string | null;
  onRequest: OnNetworkRequest;
}

export class NetworkRouter {
  private readonly settings: NetworkSettings;
  private readonly proxyUrl: string | null;
  private readonly onRequest: OnNetworkRequest;
  private readonly directDispatcher: Agent;
  private readonly proxyDispatcher: ProxyAgent | null;

  constructor(options: NetworkRouterOptions) {
    this.settings = options.settings;
    this.proxyUrl = options.proxyUrl;
    this.onRequest = options.onRequest;
    this.directDispatcher = new Agent();
    this.proxyDispatcher = options.proxyUrl === null ? null : new ProxyAgent(options.proxyUrl);
  }

  readonly fetch: RoutedFetch = async (input, init) => {
    const host = new URL(input instanceof URL ? input.href : input).hostname;
    const decision = resolveNetworkRoute(host, this.settings);
    const viaProxy = decision.route === 'proxy' && this.proxyDispatcher !== null;
    this.onRequest({
      host,
      route: decision.route,
      viaProxy,
      rule: decision.rule,
      proxyUrl: viaProxy && this.proxyUrl !== null ? maskProxyUrl(this.proxyUrl) : null,
    });
    const dispatcher: Dispatcher = viaProxy ? this.getProxyDispatcher() : this.directDispatcher;
    return fetch(input, { ...init, dispatcher } as RequestInit);
  };

  async close(): Promise<void> {
    await this.directDispatcher.close();
    await this.proxyDispatcher?.close();
  }

  private getProxyDispatcher(): Dispatcher {
    if (this.proxyDispatcher === null) {
      throw new Error('Маршрут proxy запрошен, но прокси не задан');
    }
    return this.proxyDispatcher;
  }
}
