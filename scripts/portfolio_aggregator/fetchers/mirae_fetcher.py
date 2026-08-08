from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class MiraeFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Mirae Asset individual portfolio links using browser"""
        links = []
        
        try:
            logger.info(f"Fetching Mirae disclosure page via browser: {self.amc_url}")
            html = self._fetch_url_with_browser(self.amc_url, wait_selector="a[href*='.xlsx']")
            if not html: return []
                
            soup = BeautifulSoup(html, 'html.parser')
            # Mirae filenames: scheme-name-31-mar-2026.xlsx
            target_pattern = f"{month[:3]}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, href, re.I)) and ('.xlsx' in href.lower()):
                    if not href.startswith('http'):
                        href = "https://www.miraeassetmf.co.in" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            return links
            
        except Exception as e:
            logger.error(f"Mirae browser scraper failed: {e}")
            
        return links
