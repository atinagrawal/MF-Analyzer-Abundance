from .base_fetcher import BaseFetcher, logger
from bs4 import BeautifulSoup
import re

class ABSLFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts ABSL portfolio links using predictive ZIP URL and scraping fallback"""
        links = []
        
        # 1. Try Predictive ZIP URL
        # Pattern: monthly-portfolio-mar-2026.zip
        short_month = month[:3].lower()
        
        predictive_url = f"https://mutualfund.adityabirlacapital.com/-/media/bsl/files/resources/monthly-portfolio/{year}/monthly-portfolio-{short_month}-{year}.zip"
        
        logger.info(f"Checking ABSL predictive URL: {predictive_url}")
        if self._check_url_exists(predictive_url):
            logger.info(f"Found ABSL portfolio ZIP via predictive URL")
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
            target_pattern = f"{month}.*?{year}"
            
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True)
                
                if (re.search(target_pattern, text, re.I) or re.search(target_pattern, href, re.I)) and \
                   ('.zip' in href.lower() or '.xlsx' in href.lower()):
                    
                    if not href.startswith('http'):
                        href = "https://mutualfund.adityabirlacapital.com" + (href if href.startswith('/') else '/' + href)
                    
                    links.append({
                        "title": text or href.split('/')[-1],
                        "url": href
                    })
            
        except Exception as e:
            logger.error(f"ABSL fallback scraper failed: {e}")
            
        return links
