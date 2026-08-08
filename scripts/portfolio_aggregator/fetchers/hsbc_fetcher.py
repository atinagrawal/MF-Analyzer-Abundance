from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class HSBCFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts HSBC individual portfolio links using browser"""
        links = []
        
        try:
            logger.info(f"Fetching HSBC disclosure page via browser: {self.amc_url}")
            html = self._fetch_url_with_browser(self.amc_url, wait_selector="a[href*='.xlsx']")
            if not html: return []
                
            soup = BeautifulSoup(html, 'html.parser')
            # HSBC filenames: .../document-31032026/...
            day = "31" if month.lower() == "march" else "30"
            month_num = "03" if month.lower() == "march" else "04"
            date_str = f"{day}{month_num}{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (date_str in href or date_str in text) and ('.xlsx' in href.lower()):
                    if not href.startswith('http'):
                        href = "https://www.assetmanagement.hsbc.co.in" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            return links
            
        except Exception as e:
            logger.error(f"HSBC browser scraper failed: {e}")
            
        return links
