// Проверяет адрес перед загрузкой страницы.
// Разрешены только http и https. По умолчанию запрещены localhost и адреса
// локальной сети: иначе модель могла бы читать сервисы на вашем компьютере
// (админки, базы данных) — это называется SSRF.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ToolError } from '../ToolError.js';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export async function assertAllowedUrl(
  urlText: string,
  allowPrivateNetwork: boolean,
): Promise<URL> {
  const url = parseUrl(urlText);
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new ToolError(`Можно загружать только http и https, а не ${url.protocol}`);
  }
  if (allowPrivateNetwork) {
    return url;
  }
  const hostname = stripIpv6Brackets(url.hostname);
  if (isLocalHostname(hostname) || isPrivateAddress(hostname)) {
    throw new ToolError(`Адрес ${hostname} — локальная сеть, загружать его запрещено`);
  }
  const addresses = await resolveAddresses(hostname);
  if (addresses.some(isPrivateAddress)) {
    throw new ToolError(
      `Имя ${hostname} указывает на адрес локальной сети, загружать его запрещено`,
    );
  }
  return url;
}

function parseUrl(urlText: string): URL {
  try {
    return new URL(urlText);
  } catch {
    throw new ToolError(`Некорректный адрес: ${urlText}`);
  }
}

// В URL IPv6-адрес записывается в квадратных скобках: http://[::1]/
function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized.endsWith('.localhost');
}

// Имя может указывать на адрес локальной сети. Если имя не удалось разрешить
// (например, DNS доступен только через прокси), не мешаем — запрос сделает fetch.
async function resolveAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) {
    return [hostname];
  }
  try {
    const records = await lookup(hostname, { all: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address.toLowerCase());
  }
  return false;
}

interface Ipv4Range {
  // Что это за диапазон — для понимания, в коде не используется.
  name: string;
  firstOctet: number;
  // Если не заданы, подходит любой второй октет.
  secondOctetFrom?: number;
  secondOctetTo?: number;
}

const PRIVATE_IPV4_RANGES: Ipv4Range[] = [
  { name: 'этот компьютер, 127.0.0.0/8', firstOctet: 127 },
  { name: '«любой адрес», 0.0.0.0/8', firstOctet: 0 },
  { name: 'локальная сеть, 10.0.0.0/8', firstOctet: 10 },
  {
    name: 'локальная сеть, 172.16.0.0/12',
    firstOctet: 172,
    secondOctetFrom: 16,
    secondOctetTo: 31,
  },
  {
    name: 'локальная сеть, 192.168.0.0/16',
    firstOctet: 192,
    secondOctetFrom: 168,
    secondOctetTo: 168,
  },
  {
    name: 'автонастройка, 169.254.0.0/16',
    firstOctet: 169,
    secondOctetFrom: 254,
    secondOctetTo: 254,
  },
];

function isPrivateIpv4(address: string): boolean {
  const [firstOctet = 0, secondOctet = 0] = address.split('.').map(Number);
  return PRIVATE_IPV4_RANGES.some((range) => {
    if (range.firstOctet !== firstOctet) {
      return false;
    }
    const from = range.secondOctetFrom ?? 0;
    const to = range.secondOctetTo ?? 255;
    return secondOctet >= from && secondOctet <= to;
  });
}

function isPrivateIpv6(address: string): boolean {
  const ipv4MappedPrefix = '::ffff:';
  if (address.startsWith(ipv4MappedPrefix)) {
    return isPrivateAddress(address.slice(ipv4MappedPrefix.length));
  }
  const isLoopbackOrUnspecified = address === '::1' || address === '::';
  const isUniqueLocal = address.startsWith('fc') || address.startsWith('fd');
  const isLinkLocal = address.startsWith('fe80');
  return isLoopbackOrUnspecified || isUniqueLocal || isLinkLocal;
}
