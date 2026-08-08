import json
import re
from .base_fetcher import BaseFetcher, logger

class HDFCFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        # HDFC URL is specific to monthly portfolios
        html = self._fetch_url(self.amc_url)
        if not html:
            logger.error("HDFC: HTML fetch failed")
            return []
            
        # Extract __NEXT_DATA__ JSON
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not match:
            logger.error("Could not find __NEXT_DATA__ in HDFC page")
            return []
            
        try:
            data = json.loads(match.group(1))
            # Path: props -> pageProps -> portfolioDataResponse -> data -> files
            files = data.get('props', {}).get('pageProps', {}).get('portfolioDataResponse', {}).get('data', {}).get('files', [])
            
            links = []
            for f in files:
                title = f.get('title', '')
                # Filter by year/month if provided in title
                if str(year) in title and month.lower() in title.lower():
                    # The file URL is in 'file' -> 'url'
                    file_url = f.get('file', {}).get('url')
                    if file_url:
                        links.append({
                            "title": title.strip(),
                            "url": file_url.strip()
                        })
            return links
        except Exception as e:
            logger.error(f"Error parsing HDFC JSON: {e}")
            return []
