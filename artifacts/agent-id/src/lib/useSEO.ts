import { useEffect } from 'react';

const BASE_TITLE = 'Agent ID - Identity, Trust & Routing for AI Agents';
const BASE_DESCRIPTION =
  'Agent ID is the identity and trust layer for autonomous AI agents. Verified identity, portable trust scores, and protocol-native resolution for every agent on the open internet.';
const SITE_URL = 'https://getagent.id';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  /** Defaults to title. Override only when the OG title differs from the page title. */
  ogTitle?: string;
  /** Defaults to description. */
  ogDescription?: string;
  /** Absolute URL. Defaults to /og-image.png */
  ogImage?: string;
  noIndex?: boolean;
}

function setMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets per-page <title>, meta description, Open Graph, and canonical URL.
 * Resets to site defaults on unmount so navigating away doesn't leave stale tags.
 */
export function useSEO({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage = `${SITE_URL}/og-image.png`,
  noIndex = false,
}: SEOProps = {}) {
  useEffect(() => {
    const resolvedTitle = title ? `${title} - Agent ID` : BASE_TITLE;
    const resolvedDesc = description ?? BASE_DESCRIPTION;
    const resolvedCanonical = canonical ? `${SITE_URL}${canonical}` : SITE_URL;

    document.title = resolvedTitle;
    setMetaByName('description', resolvedDesc);
    setMetaByProperty('og:title', ogTitle ?? resolvedTitle);
    setMetaByProperty('og:description', ogDescription ?? resolvedDesc);
    setMetaByProperty('og:image', ogImage);
    setMetaByProperty('og:url', resolvedCanonical);
    setMetaByName('twitter:title', ogTitle ?? resolvedTitle);
    setMetaByName('twitter:description', ogDescription ?? resolvedDesc);
    setMetaByName('robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    setCanonical(resolvedCanonical);

    return () => {
      document.title = BASE_TITLE;
      setMetaByName('description', BASE_DESCRIPTION);
      setMetaByProperty('og:title', BASE_TITLE);
      setMetaByProperty('og:description', BASE_DESCRIPTION);
      setMetaByProperty('og:url', SITE_URL);
      setMetaByName('robots', 'index, follow');
      setCanonical(SITE_URL);
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, noIndex]);
}
