from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

class InvescoFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Invesco scheme-wise portfolio links using browser and pattern matching"""
        links = []
        
        try:
            logger.info(f"Fetching Invesco disclosure page via browser: {self.amc_url}")
            html = self._fetch_url_with_browser(self.amc_url)
            if not html: return []
                
            soup = BeautifulSoup(html, 'html.parser')
            target_pattern = f"{month[:3]}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href'].strip()
                text = link.get_text(strip=True)
                
                # Check text in the same row or the link itself
                parent_row = link.find_parent('tr')
                row_text = parent_row.get_text(strip=True) if parent_row else ""
                
                if (re.search(target_pattern, row_text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.xlsx' in href.lower() or '.xls' in href.lower()):
                    
                    full_url = urljoin("https://www.invescomutualfund.com", href)
                    
                    links.append({
                        "title": text or full_url.split('/')[-1],
                        "url": full_url
                    })
            
            # De-duplicate
            unique_links = []
            seen_urls = set()
            for l in links:
                if l['url'] not in seen_urls:
                    unique_links.append(l)
                    seen_urls.add(l['url'])
            
            logger.info(f"Found {len(unique_links)} unique Invesco links")
            return unique_links
            
        except Exception as e:
            logger.error(f"Invesco browser scraper failed: {e}")
            
        return links
