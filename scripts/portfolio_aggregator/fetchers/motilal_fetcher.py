from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re
from datetime import datetime, timedelta

class MotilalFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Motilal Oswal portfolio links using predictive URL and scraping fallback"""
        links = []
        
        # 1. Try Predictive URL
        try:
            month_dt = datetime.strptime(f"{month} {year}", "%B %Y")
            upload_dt = month_dt + timedelta(days=32)
            upload_year = upload_dt.year
            upload_short_month = upload_dt.strftime("%b").lower()
            
            day = "31" if month.lower() != "february" else "28"
            month_num = month_dt.strftime("%m")
            
            filename = f"IN_MF_MOTILAL_FACTSHEET_{day}.{month_num}.{year}_Final.xlsx"
            predictive_url = f"https://www.motilaloswalmf.com/content/dam/motilal-mf/downloads/mf/month-end-portfolio/{upload_year}/{upload_short_month}/{filename}"
            
            logger.info(f"Checking Motilal predictive URL: {predictive_url}")
            if self._check_url_exists(predictive_url):
                logger.info(f"Found Motilal portfolio via predictive URL")
                links.append({
                    "title": f"Motilal Factsheet {month} {year}",
                    "url": predictive_url
                })
                return links
        except Exception as e:
            logger.debug(f"Motilal predictive URL construction failed: {e}")

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
                        href = "https://www.motilaloswalmf.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            
        except Exception as e:
            logger.error(f"Motilal fallback scraper failed: {e}")
            
        return links
