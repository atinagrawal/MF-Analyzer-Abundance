from .base_fetcher import BaseFetcher, logger
import time

class QuantFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts portfolio links using Playwright for browser automation"""
        from playwright.sync_api import sync_playwright
        
        links = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(self.amc_url, wait_until="networkidle")
                
                # 1. Expand 'MONTHLY PORTFOLIO'
                try:
                    logger.info("Attempting to expand 'MONTHLY PORTFOLIO' via JS click")
                    page.evaluate("""() => {
                        const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText.trim() === 'MONTHLY PORTFOLIO');
                        if (el) el.click();
                    }""")
                    page.wait_for_timeout(2000)
                    
                    # 2. Click the Year via JS
                    logger.info(f"Attempting to click Year {year} via JS click")
                    page.evaluate(f"""() => {{
                        const elements = Array.from(document.querySelectorAll('*')).filter(e => e.innerText.trim() === '{year}');
                        const el = elements.find(e => {{
                            const onclick = e.getAttribute('onclick') || '';
                            return onclick.includes('MONTHLY PORTFOLIO') && !onclick.includes('FUND - WISE');
                        }});
                        if (el) el.click();
                    }}""")
                    page.wait_for_timeout(2000)
                    
                    # 3. Extract links
                    logger.info(f"Extracting links for {month} {year}")
                    links_data = page.evaluate("""({month, year}) => {
                        const results = [];
                        const anchors = document.querySelectorAll('a');
                        for (const a of anchors) {
                            const text = a.innerText.toLowerCase();
                            const href = a.href;
                            if (text.includes(month.toLowerCase()) && text.includes(year.toString())) {
                                if (href.endsWith('.xlsx') || href.endsWith('.xls')) {
                                    results.push({title: a.innerText.trim(), url: href});
                                }
                            }
                        }
                        return results;
                    }""", {"month": month, "year": year})
                    
                    if links_data:
                        logger.info(f"Successfully found {len(links_data)} links")
                        links = links_data
                except Exception as e:
                    logger.error(f"JS expansion failed: {e}")
                
                browser.close()
        except Exception as e:
            logger.error(f"QuantFetcher failed: {e}")
            
        return links
