import json
import re
from .base_fetcher import BaseFetcher, logger

class SBIFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        url = "https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheets"
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        }
        
        # Month mapping if needed, SBI uses full month name like "March"
        payload = {
            "FundId": 0,
            "PSYear": str(year),
            "PSMonth": month, # Expecting "March", "April", etc.
            "PSFrequency": "Monthly"
        }
        
        data = json.dumps(payload).encode('utf-8')
        html_fragment = self._fetch_url(url, data=data, headers=headers, method='POST')
        
        if not html_fragment:
            return []
            
        # Extract links from HTML table rows
        # Pattern: <a href="(.*?)" .*?>(.*?)</a>
        links = []
        pattern = r'<a href="(.*?)".*?>(.*?)</a>'
        matches = re.findall(pattern, html_fragment)
        
        for url, title in matches:
            if "download" not in url.lower() and ".xlsx" in url.lower():
                links.append({
                    "title": title.strip(),
                    "url": url.strip() if url.startswith("http") else f"https://www.sbimf.com{url.strip()}"
                })
        
        # SBI sometimes has a duplicate "Download" link in the same row, let's dedup by URL
        unique_links = []
        seen_urls = set()
        for link in links:
            if link['url'] not in seen_urls:
                unique_links.append(link)
                seen_urls.add(link['url'])
                
        return unique_links
