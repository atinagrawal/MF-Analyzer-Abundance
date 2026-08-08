from .base_fetcher import BaseFetcher, logger
import requests
import json
import re

class KotakFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts Kotak portfolio links using hybrid predictive/API approach"""
        links = []
        
        # 1. Try Predictive S3 URL
        # Pattern: .../Portfolio31032026111145.xlsx (The timestamp is tricky, but often 111145 or similar)
        # However, they also have a direct API we discovered
        
        try:
            # The subagent discovered this API call:
            api_url = "https://www.kotakmf.com/api/FormsAndDownload/GetFormsAndDownload"
            payload = {
                "Category": "Portfolio Disclosures",
                "SubCategory": "Monthly Portfolio",
                "Year": str(year),
                "Month": month
            }
            
            logger.info(f"Fetching Kotak links via API: {api_url} for {month} {year}")
            response = self.session.post(api_url, json=payload, timeout=20)
            if response.status_code == 200:
                data = response.json()
                for item in data:
                    if month.lower() in item.get('Title', '').lower() and str(year) in item.get('Title', ''):
                        links.append({
                            "title": item.get('Title'),
                            "url": item.get('DownloadUrl')
                        })
                if links:
                    logger.info(f"Found {len(links)} Kotak links via API")
                    return links
        except Exception as e:
            logger.error(f"Kotak API fetch failed: {e}")

        return links
