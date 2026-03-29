import fs from 'fs';
import path from 'path';

export const OPPORTUNITIES_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
export const OPPORTUNITY_SOURCES = [
  {
    id: 'simplify-internships',
    name: 'Simplify Internships',
    repo: 'SimplifyJobs/Summer2026-Internships',
    branch: 'dev',
    path: 'README.md',
    roleType: 'internship',
    parser: 'simplify-html-table'
  },
  {
    id: 'simplify-new-grad',
    name: 'Simplify New Grad',
    repo: 'SimplifyJobs/New-Grad-Positions',
    branch: 'dev',
    path: 'README.md',
    roleType: 'new-grad',
    parser: 'simplify-html-table'
  }
];

export function readOpportunitiesCache(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      return {
        updatedAt: '',
        fetchedAt: '',
        opportunities: [],
        sources: []
      };
    }
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return {
      updatedAt: parsed.updatedAt || '',
      fetchedAt: parsed.fetchedAt || '',
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : []
    };
  } catch {
    return {
      updatedAt: '',
      fetchedAt: '',
      opportunities: [],
      sources: []
    };
  }
}

export function writeOpportunitiesCache(cachePath, payload) {
  const nextPayload = {
    updatedAt: payload.updatedAt || new Date().toISOString(),
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    opportunities: Array.isArray(payload.opportunities) ? payload.opportunities : [],
    sources: Array.isArray(payload.sources) ? payload.sources : []
  };
  fs.writeFileSync(cachePath, JSON.stringify(nextPayload, null, 2), 'utf-8');
  return nextPayload;
}

export function getRawGithubUrl(source) {
  return `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${source.path}`;
}

export function normalizeOpportunityText(value) {
  return (value || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[_*`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMarkdownLinks(value) {
  return [...(value || '').matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    label: (match[1] || '').trim(),
    url: (match[2] || '').trim()
  }));
}

export function normalizeOpportunityCategory(value) {
  return normalizeOpportunityText(value)
    .replace(/roles?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function parseMarkdownTableOpportunities(markdown, source) {
  const lines = (markdown || '').split(/\r?\n/);
  const opportunities = [];
  let currentCategory = source.roleType === 'internship' ? 'Internships' : 'New Grad';
  let lastCompany = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{2,6}\s+(.+)$/);
    if (headingMatch) {
      currentCategory = normalizeOpportunityCategory(headingMatch[1]) || currentCategory;
      continue;
    }

    if (!line.includes('|')) continue;

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((_, index, arr) => !(index === 0 && arr[index] === '') && !(index === arr.length - 1 && arr[index] === ''));

    if (cells.length < 4) continue;
    if (/^company$/i.test(normalizeOpportunityText(cells[0])) && /^role$/i.test(normalizeOpportunityText(cells[1] || ''))) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')))) continue;

    const companyCell = cells[0] || '';
    const roleCell = cells[1] || '';
    const locationCell = cells[2] || '';
    const applicationCell = cells[3] || '';
    const ageCell = cells[4] || '';

    let company = normalizeOpportunityText(companyCell).replace(/^↳\s*/, '').trim();
    if (!company || company === '↳') {
      company = lastCompany;
    } else {
      lastCompany = company;
    }

    const role = normalizeOpportunityText(roleCell).replace(/^↳\s*/, '').trim();
    const location = normalizeOpportunityText(locationCell);
    const age = normalizeOpportunityText(ageCell);
    const companyLinks = extractMarkdownLinks(companyCell);
    const applicationLinks = extractMarkdownLinks(applicationCell);
    const applyLink = applicationLinks.find((link) => /apply/i.test(link.label))?.url || applicationLinks[0]?.url || '';
    const companyUrl = companyLinks[0]?.url || '';
    const simplifyLink = applicationLinks.find((link) => /simplify/i.test(link.label))?.url || '';

    if (!company || !role || !location) continue;

    opportunities.push({
      id: `${source.id}:${company.toLowerCase()}::${role.toLowerCase()}::${location.toLowerCase()}`,
      company,
      role,
      location,
      age: age || 'Unknown',
      applyUrl: applyLink,
      companyUrl,
      simplifyUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceRepo: source.repo,
      sourceUrl: `https://github.com/${source.repo}`,
      roleType: source.roleType,
      category: currentCategory,
      fetchedAt: new Date().toISOString()
    });
  }

  return opportunities;
}

function stripHtml(value) {
  return (value || '')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;/gi, '–')
    .replace(/&#8211;/gi, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSimplifyHtmlTableOpportunities(markdown, source) {
  const lines = (markdown || '').split(/\r?\n/);
  const opportunities = [];
  let currentCategory = source.roleType === 'internship' ? 'Internships' : 'New Grad';
  let inRow = false;
  let rowBuffer = [];
  let lastCompany = '';
  let lastCompanyUrl = '';

  const flushRow = () => {
    if (!rowBuffer.length) return;
    const rowHtml = rowBuffer.join('\n');
    rowBuffer = [];
    inRow = false;

    const cellMatches = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1]);
    if (cellMatches.length < 5) return;

    const companyCell = cellMatches[0];
    const roleCell = cellMatches[1];
    const locationCell = cellMatches[2];
    const applicationCell = cellMatches[3];
    const ageCell = cellMatches[4];
    let company = stripHtml(companyCell);
    const role = stripHtml(roleCell);
    const location = stripHtml(locationCell);
    const age = stripHtml(ageCell);
    if (!company || /^company$/i.test(company) || !role) return;

    const companyLinks = [
      ...extractMarkdownLinks(companyCell),
      ...(companyCell.matchAll(/href="([^"]+)"/gi)).map((match) => ({ label: '', url: match[1] }))
    ];
    let companyUrl = companyLinks[0]?.url || '';
    if (company === '↳') {
      company = lastCompany || company;
      companyUrl = lastCompanyUrl || companyUrl;
    } else {
      lastCompany = company;
      lastCompanyUrl = companyUrl;
    }

    const applicationLinks = [...applicationCell.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
      url: match[1],
      label: /alt="simplify"/i.test(match[2]) ? 'Simplify' : 'Apply'
    }));
    const applyLink = applicationLinks.find((link) => link.label === 'Apply')?.url || '';
    const simplifyUrl = applicationLinks.find((link) => link.label === 'Simplify')?.url || '';

    opportunities.push({
      id: `${source.id}:${company.toLowerCase()}::${role.toLowerCase()}::${location.toLowerCase()}`,
      company,
      role,
      location: location || 'Location not listed',
      age: age || 'Unknown',
      applyUrl: applyLink,
      companyUrl,
      simplifyUrl,
      sourceId: source.id,
      sourceName: source.name,
      sourceRepo: source.repo,
      sourceUrl: `https://github.com/${source.repo}`,
      roleType: source.roleType,
      category: currentCategory,
      fetchedAt: new Date().toISOString()
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      if (inRow) rowBuffer.push(line);
      continue;
    }

    const headingMatch = line.match(/^#{2,6}\s+(.+)$/);
    if (headingMatch) {
      flushRow();
      currentCategory = normalizeOpportunityCategory(headingMatch[1]) || currentCategory;
      continue;
    }

    if (/<tr>/i.test(line)) {
      flushRow();
      inRow = true;
      rowBuffer = [line];
      if (/<\/tr>/i.test(line)) {
        flushRow();
      }
      continue;
    }

    if (inRow) {
      rowBuffer.push(line);
      if (/<\/tr>/i.test(line)) {
        flushRow();
      }
      continue;
    }
  }

  flushRow();
  return opportunities;
}

export function parsePostingAge(value) {
  const match = (value || '').match(/(\d+)/);
  return match ? Number(match[1]) : 9999;
}

export function dedupeOpportunities(opportunities) {
  const seen = new Map();

  for (const item of opportunities) {
    const key = [
      (item.company || '').toLowerCase(),
      (item.role || '').toLowerCase(),
      (item.location || '').toLowerCase(),
      (item.roleType || '').toLowerCase()
    ].join('::');

    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }

    const existing = seen.get(key);
    const existingAge = parsePostingAge(existing.age);
    const nextAge = parsePostingAge(item.age);
    if (nextAge < existingAge) {
      seen.set(key, item);
    }
  }

  return [...seen.values()].sort((a, b) => parsePostingAge(a.age) - parsePostingAge(b.age));
}

export async function fetchOpportunitiesFeed(source) {
  const response = await fetch(getRawGithubUrl(source));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.name} (${response.status})`);
  }

  const markdown = await response.text();
  const opportunities = source.parser === 'simplify-html-table'
    ? parseSimplifyHtmlTableOpportunities(markdown, source)
    : parseMarkdownTableOpportunities(markdown, source);
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceRepo: source.repo,
    count: opportunities.length,
    fetchedAt: new Date().toISOString(),
    status: 'ok',
    url: getRawGithubUrl(source),
    opportunities
  };
}

export async function getOpportunitiesPayload({
  forceRefresh = false,
  cachePath,
  cacheTtlMs = OPPORTUNITIES_CACHE_TTL_MS
}) {
  const cached = readOpportunitiesCache(cachePath);
  const cachedAge = cached.fetchedAt ? (Date.now() - new Date(cached.fetchedAt).getTime()) : Infinity;
  const shouldUseCache = !forceRefresh && cached.opportunities.length > 0 && cachedAge < cacheTtlMs;

  if (shouldUseCache) {
    return {
      ...cached,
      fromCache: true
    };
  }

  const results = await Promise.allSettled(OPPORTUNITY_SOURCES.map((source) => fetchOpportunitiesFeed(source)));
  const sourceSummaries = [];
  const collected = [];

  results.forEach((result, index) => {
    const source = OPPORTUNITY_SOURCES[index];
    if (result.status === 'fulfilled') {
      sourceSummaries.push({
        ...result.value,
        opportunities: undefined
      });
      collected.push(...result.value.opportunities);
      return;
    }

    sourceSummaries.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceRepo: source.repo,
      count: 0,
      fetchedAt: new Date().toISOString(),
      status: 'error',
      error: result.reason?.message || 'Failed to fetch source.',
      url: getRawGithubUrl(source)
    });
  });

  if (!collected.length && cached.opportunities.length) {
    return {
      ...cached,
      sources: sourceSummaries.length ? sourceSummaries : cached.sources,
      fromCache: true,
      stale: true
    };
  }

  if (!collected.length) {
    throw new Error('No opportunity feeds could be loaded right now.');
  }

  const payload = writeOpportunitiesCache(cachePath, {
    updatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    opportunities: dedupeOpportunities(collected),
    sources: sourceSummaries
  });

  return {
    ...payload,
    fromCache: false
  };
}

export function ensureOpportunitiesCacheDir(cachePath) {
  const directory = path.dirname(cachePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function getCachedOpportunitiesPayload(cachePath) {
  return {
    ...readOpportunitiesCache(cachePath),
    fromCache: true,
    stale: false
  };
}
