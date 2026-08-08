from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re
from datetime import datetime, timedelta

class TataFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Tata MF portfolio links using predictive URL and scraping fallback"""
        links = []
        
        # 1. Try Predictive URL
        try:
            month_dt = datetime.strptime(f"{month} {year}", "%B %Y")
            upload_dt = month_dt + timedelta(days=32)
            upload_folder = upload_dt.strftime("%Y-%m")
            
            if month.lower() == "march": day_suffix = "31st"
            elif month.lower() == "february": day_suffix = "28th"
            else: day_suffix = "30th"
            
            predictive_url = f"https://betacms.tatamutualfund.com/system/files/{upload_folder}/Monthly%20Portfolio%20as%20on%20{day_suffix}%20{month.capitalize()}%20{year}.xlsx"
            
            logger.info(f"Checking Tata predictive URL: {predictive_url}")
            if self._check_url_exists(predictive_url):
                logger.info(f"Found Tata portfolio via predictive URL")
                links.append({
                    "title": f"Monthly Portfolio {month} {year}",
                    "url": predictive_url
                })
                return links
        except Exception as e:
            logger.debug(f"Tata predictive URL construction failed: {e}")

        # 2. Fallback to scraping
        try:
            logger.info(f"Predictive URL failed, falling back to scraping: {self.amc_url}")
            html = self._fetch_url(self.amc_url)
            if not html:
                return []
                
            soup = BeautifulSoup(html, 'html.parser')
            target_pattern = f"Portfolio.*?{month}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.xlsx' in href.lower() or '.xls' in href.lower()):
                    
                    if not href.startswith('http'):
                        if 'tatamutualfund.com' not in href:
                            href = "https://www.tatamutualfund.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            
        except Exception as e:
            logger.error(f"Tata fallback scraper failed: {e}")
            
        return links
