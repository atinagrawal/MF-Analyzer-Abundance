from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class NipponFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Nippon India portfolio links using predictive URL and scraping fallback"""
        links = []
        
        # 1. Try Predictive URL
        # Pattern: NIMF-MONTHLY-PORTFOLIO-31-Mar-26.xls
        short_year = str(year)[-2:]
        short_month = month[:3].capitalize()
        day = "31" if month.lower() != "february" else "28"
        
        filename = f"NIMF-MONTHLY-PORTFOLIO-{day}-{short_month}-{short_year}.xls"
        predictive_url = f"https://www.nipponindiamf.com/Downloads/Portfolio-Disclosure/{filename}"
        
        logger.info(f"Checking Nippon predictive URL: {predictive_url}")
        if self._check_url_exists(predictive_url):
            logger.info(f"Found Nippon portfolio via predictive URL")
            links.append({
                "title": f"NIMF Monthly Portfolio {month} {year}",
                "url": predictive_url
            })
            return links

        # 2. Fallback to scraping
        try:
            logger.info(f"Predictive URL failed, falling back to scraping: {self.amc_url}")
            html = self._fetch_url(self.amc_url)
            if not html:
                return []
                
            soup = BeautifulSoup(html, 'html.parser')
            target_pattern = f"{month}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.xlsx' in href.lower() or '.xls' in href.lower()):
                    
                    if not href.startswith('http'):
                        href = "https://www.nipponindiamf.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            
        except Exception as e:
            logger.error(f"Nippon fallback scraper failed: {e}")
            
        return links
