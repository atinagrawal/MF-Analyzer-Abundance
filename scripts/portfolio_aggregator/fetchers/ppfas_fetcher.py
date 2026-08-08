from .base_fetcher import BaseFetcher, logger
import urllib.request
from bs4 import BeautifulSoup

class PPFASFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts portfolio links from the static HTML of PPFAS disclosure page"""
        links = []
        try:
            logger.info(f"Fetching PPFAS URL: {self.amc_url}")
            html = self._fetch_url(self.amc_url)
            if not html:
                logger.error("Failed to fetch PPFAS HTML")
                return []
                
            logger.info(f"Fetched {len(html)} bytes of HTML")
            soup = BeautifulSoup(html, 'html.parser')
            
            target_text = f"{month} {year}"
            logger.info(f"Searching for target text: {target_text}")
            
            all_links = soup.find_all('a', href=True)
            logger.info(f"Found {len(all_links)} links in total")
            for link in all_links:
                href = link['href']
                text = link.get_text(strip=True).lower()
                
                # Check if href contains the year and month pattern or text matches
                if (str(year) in href and month.lower() in href.lower()) or \
                   (str(year) in text and month.lower() in text):
                    
                    # Fix: Handle query parameters (e.g. .xls?123)
                    if '.xls' in href.lower() or '.xlsx' in href.lower():
                        if not href.startswith('http'):
                            href = "https://amc.ppfas.com" + (href if href.startswith('/') else '/' + href)
                        
                        links.append({
                            "title": link.get_text(strip=True) or href.split('/')[-1],
                            "url": href
                        })
            
            # Remove duplicates while preserving order
            seen = set()
            unique_links = []
            for l in links:
                if l['url'] not in seen:
                    unique_links.append(l)
                    seen.add(l['url'])
            return unique_links
            
        except Exception as e:
            logger.error(f"PPFASFetcher failed: {e}")
            
        return links
