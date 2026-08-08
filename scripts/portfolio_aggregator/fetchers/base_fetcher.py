import abc
import requests
import logging
import time
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("PortfolioFetcher")

class BaseFetcher(abc.ABC):
    def __init__(self, amc_name, amc_url):
        self.amc_name = amc_name
        self.amc_url = amc_url
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    @abc.abstractmethod
    def get_portfolio_links(self, year, month):
        """Returns a list of dicts: {'title': str, 'url': str}"""
        pass

    def _fetch_url(self, url, data=None, headers=None, method='GET'):
        """Helper to fetch URL with retries and proper headers"""
        for attempt in range(3):
            try:
                response = self.session.request(method, url, data=data, headers=headers, timeout=30)
                response.raise_for_status()
                return response.text
            except Exception as e:
                logger.warning(f"Attempt {attempt+1} failed for {url}: {e}")
                time.sleep(2)
        return None

    def _fetch_url_with_browser(self, url, wait_selector=None):
        """Fetches URL using Playwright for JS-heavy pages"""
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, wait_until="networkidle")
                if wait_selector:
                    page.wait_for_selector(wait_selector, timeout=10000)
                content = page.content()
                browser.close()
                return content
        except Exception as e:
            logger.error(f"Browser fetch failed for {url}: {e}")
            return None

    def _check_url_exists(self, url):
        """Verifies if the URL is accessible using HEAD with fallback to GET stream"""
        try:
            response = self.session.head(url, allow_redirects=True, timeout=10)
            if response.status_code == 200:
                return True
            response = self.session.get(url, allow_redirects=True, timeout=10, stream=True)
            return response.status_code == 200
        except Exception as e:
            logger.debug(f"URL check failed for {url}: {e}")
            return False

    def download_file(self, url, dest_path):
        """Downloads a file to the specified path"""
        try:
            with self.session.get(url, timeout=60, stream=True) as r:
                r.raise_for_status()
                with open(dest_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            logger.info(f"Downloaded {url} to {dest_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to download {url}: {e}")
            return False
