from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class CanaraRobecoFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Canara Robeco consolidated portfolio link using browser"""
        links = []
        
        try:
            logger.info(f"Fetching Canara Robeco disclosure page via browser: {self.amc_url}")
            html = self._fetch_url_with_browser(self.amc_url, wait_selector="a[href*='.zip'], a[href*='.xlsx']")
            if not html: return []
                
            soup = BeautifulSoup(html, 'html.parser')
            target_pattern = f"{month[:3]}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.zip' in href.lower() or '.xlsx' in href.lower()):
                    
                    if not href.startswith('http'):
                        href = "https://www.canararobeco.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            return links
            
        except Exception as e:
            logger.error(f"Canara Robeco browser scraper failed: {e}")
            
        return links
