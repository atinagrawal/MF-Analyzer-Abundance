from .base_fetcher import BaseFetcher, logger
import json
import time

class BandhanFetcher(BaseFetcher):
    def get_portfolio_links(self, year, month):
        """Extracts portfolio links by intercepting/waiting for the CMS API response"""
        from playwright.sync_api import sync_playwright
        
        links = []
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                # Use a very specific Chrome UA to avoid detection
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 800}
                )
                page = context.new_page()
                
                # Set a longer timeout
                page.set_default_timeout(60000)
                
                # We expect a POST request to cms-call
                api_responses = []
                
                # Inject script to intercept fetch and XHR calls directly in the browser
                page.add_init_script("""
                    window.cms_responses = [];
                    
                    // Intercept Fetch
                    const originalFetch = window.fetch;
                    window.fetch = async (...args) => {
                        const response = await originalFetch(...args);
                        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                        if (url && url.includes('cms-call')) {
                            try {
                                const clone = response.clone();
                                const data = await clone.json();
                                window.cms_responses.push(data);
                                console.log('INTERCEPTED_FETCH:', url, data.data ? data.data.length : 0);
                            } catch (e) {}
                        }
                        return response;
                    };
                    
                    // Intercept XHR
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        this._url = url;
                        return originalOpen.apply(this, arguments);
                    };
                    const originalSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function() {
                        this.addEventListener('load', function() {
                            if (this._url && this._url.includes('cms-call')) {
                                try {
                                    const data = JSON.parse(this.responseText);
                                    window.cms_responses.push(data);
                                    console.log('INTERCEPTED_XHR:', this._url, data.data ? data.data.length : 0);
                                } catch (e) {}
                            }
                        });
                        return originalSend.apply(this, arguments);
                    };
                """)
                
                # Listen for console logs
                page.on("console", lambda msg: logger.info(f"Browser Console: {msg.text}") if "INTERCEPTED" in msg.text else None)
                
                logger.info(f"Navigating to {self.amc_url}")
                try:
                    # Use a very long timeout and wait for network idle if possible
                    page.goto(self.amc_url, wait_until="networkidle", timeout=120000)
                except Exception as e:
                    logger.warning(f"Navigation timed out or failed: {e}, attempting to proceed...")

                # Interaction: Ensure we are on the Portfolio section and trigger data loads
                try:
                    # Look for the section heading
                    section_text = "Monthly / Half Yearly Portfolios - Disclosures"
                    logger.info(f"Looking for section: {section_text}")
                    # Wait for it to be visible
                    page.wait_for_selector(f"text='{section_text}'", timeout=30000)
                    page.click(f"text='{section_text}'")
                    logger.info("Clicked Portfolio Disclosures section")
                    page.wait_for_timeout(2000)
                    
                    # Try clicking year buttons to trigger filtered API calls
                    years_to_try = [year, year-1]
                    for y in years_to_try:
                        logger.info(f"Attempting to click button for year {y}...")
                        try:
                            # Try multiple ways to find the button
                            btn = page.locator(f"button:has-text('{y}')").first
                            if btn.is_visible():
                                btn.click()
                                logger.info(f"Clicked year button: {y}")
                                page.wait_for_timeout(5000)
                        except Exception as e:
                            logger.debug(f"Year button {y} click failed: {e}")
                            
                except Exception as e:
                    logger.warning(f"Portfolio section interaction failed: {e}")

                # Poll for API response with specific month/year
                logger.info(f"Waiting for {month} {year} data to appear in API responses...")
                start_time = time.time()
                while time.time() - start_time < 60:
                    # Get responses from the browser
                    api_responses = page.evaluate("() => window.cms_responses") or []
                    
                    found_matches = 0
                    for api_response in api_responses:
                        if isinstance(api_response, dict) and "data" in api_response:
                            for item in api_response["data"]:
                                title = item.get("title", "")
                                acf = item.get("acf_fields", {})
                                
                                if month.lower() in title.lower() and str(year) in title:
                                    found_matches += 1
                                    continue
                                    
                                disclosure_files = acf.get("disclosure_files", [])
                                if not disclosure_files: disclosure_files = acf.get("files", [])
                                if isinstance(disclosure_files, list):
                                    for f in disclosure_files:
                                        if month.lower() in f.get("document_name", "").lower() and str(year) in f.get("document_name", ""):
                                            found_matches += 1
                                            break
                    
                    if found_matches > 0:
                        logger.info(f"Found {found_matches} potential matches in {len(api_responses)} responses")
                        break
                    
                    page.wait_for_timeout(2000)

                # Process collected responses
                api_responses = page.evaluate("() => window.cms_responses") or []
                for api_response in api_responses:
                    if isinstance(api_response, dict) and "data" in api_response:
                        for item in api_response["data"]:
                            title = item.get("title", "")
                            acf = item.get("acf_fields", {})
                            
                            # Case 1: Individual file item
                            if month.lower() in title.lower() and str(year) in title:
                                doc_link = acf.get("document_link") or acf.get("file")
                                if doc_link and isinstance(doc_link, dict) and doc_link.get("url"):
                                    links.append({
                                        "title": title,
                                        "url": doc_link.get("url")
                                    })
                            
                            # Case 2: Folder item with multiple files
                            disclosure_files = acf.get("disclosure_files", [])
                            if not disclosure_files: disclosure_files = acf.get("files", [])
                                
                            if isinstance(disclosure_files, list):
                                for f in disclosure_files:
                                    doc_name = f.get("document_name", "")
                                    if month.lower() in doc_name.lower() and str(year) in doc_name:
                                        doc_link = f.get("document_link", {})
                                        if isinstance(doc_link, dict) and doc_link.get("url"):
                                            links.append({
                                                "title": doc_name or title,
                                                "url": doc_link.get("url")
                                            })
                
                # Remove duplicates
                seen_urls = set()
                unique_links = []
                for l in links:
                    if l['url'] not in seen_urls:
                        unique_links.append(l)
                        seen_urls.add(l['url'])
                links = unique_links

                if not links:
                    logger.warning(f"No matching links found in {len(api_responses)} API responses")
                else:
                    logger.info(f"Successfully found {len(links)} unique links for {month} {year}")
                
                browser.close()

        except Exception as e:
            logger.error(f"BandhanFetcher failed: {e}")
            
        return links
