from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class AxisFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Axis MF portfolio links using predictive URL and scraping fallback"""
        links = []
        
        # 1. Try Predictive URL
        # Pattern: Monthly%20Portfolio-31%2003%2026.xlsx
        short_year = str(year)[-2:]
        month_map = {
            "January": "01", "February": "02", "March": "03", "April": "04",
            "May": "05", "June": "06", "July": "07", "August": "08",
            "September": "09", "October": "10", "November": "11", "December": "12"
        }
        month_num = month_map.get(month.capitalize(), "01")
        day = "31" if month.lower() != "february" else "28"
        
        predictive_url = f"https://www.axismf.com/cms/sites/default/files/Statutory/Monthly%20Portfolio-{day}%20{month_num}%20{short_year}.xlsx"
        
        logger.info(f"Checking Axis predictive URL: {predictive_url}")
        if self._check_url_exists(predictive_url):
            logger.info(f"Found Axis portfolio via predictive URL")
            links.append({
                "title": f"Monthly Portfolio {month} {year}",
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
            target_pattern = f"Portfolio.*?{month}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.xlsx' in href.lower() or '.xls' in href.lower()):
                    
                    if not href.startswith('http'):
                        href = "https://www.axismf.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            
        except Exception as e:
            logger.error(f"Axis fallback scraper failed: {e}")
            
        return links
