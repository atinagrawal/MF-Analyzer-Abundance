from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class NaviFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Navi portfolio links using browser"""
        links = []
        
        try:
            logger.info(f"Fetching Navi disclosure page via browser: {self.amc_url}")
            html = self._fetch_url_with_browser(self.amc_url, wait_selector="a[href*='.xlsx']")
            if not html: return []
                
            soup = BeautifulSoup(html, 'html.parser')
            target_pattern = f"{month[:3]}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.xlsx' in href.lower() or '.xls' in href.lower()):
                    
                    if not href.startswith('http'):
                        href = "https://www.navimutualfund.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            return links
            
        except Exception as e:
            logger.error(f"Navi browser scraper failed: {e}")
            
        return links
